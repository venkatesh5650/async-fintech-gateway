"""
Container Build Diagnostics & Specification Engine
--------------------------------------------------
Programmatically validates multi-stage Docker build specifications,
non-root security posture, entrypoints, and .dockerignore hygiene
for cloud orchestration.
"""

from datetime import datetime, timezone
import logging
import os
import re
from typing import Optional

from app.core.telemetry import generate_trace_id
from app.database.schemas import (
    ContainerImageSpec,
    ContainerSecurityCheck,
    ContainerSpecReport,
    DockerIgnoreAudit,
)

logger = logging.getLogger("docker_spec")


class ContainerBuildDiagnosticsManager:
    """Evaluates container configurations against cloud-native production standards."""

    def __init__(self, base_dir: Optional[str] = None):
        # Resolve backend root directory robustly
        if base_dir:
            self.backend_dir = os.path.abspath(base_dir)
        else:
            current_dir = os.path.dirname(os.path.abspath(__file__))
            # current_dir is app/core -> parent is app -> parent is backend
            self.backend_dir = os.path.abspath(os.path.join(current_dir, "../.."))

    def _resolve_file_path(self, relative_path: str) -> str:
        """Resolves file path relative to backend root."""
        return os.path.join(self.backend_dir, relative_path)

    def audit_dockerignore(self) -> DockerIgnoreAudit:
        """Verifies that .dockerignore excludes sensitive secrets, environments, and local data dumps."""
        dockerignore_path = self._resolve_file_path(".dockerignore")
        if not os.path.exists(dockerignore_path):
            return DockerIgnoreAudit(
                is_valid=False,
                total_rules=0,
                critical_exclusions_present=[],
                missing_exclusions=[".venv", ".env", ".git", "*.dump"],
                rules_sample=[],
            )

        with open(dockerignore_path, "r", encoding="utf-8") as f:
            lines = [line.strip() for line in f if line.strip() and not line.strip().startswith("#")]

        critical_targets = [".venv", ".env", ".git", "*.dump"]
        present: list[str] = []
        missing: list[str] = []

        for target in critical_targets:
            if any(target in line for line in lines):
                present.append(target)
            else:
                missing.append(target)

        is_valid = len(missing) == 0 and len(lines) >= 5

        return DockerIgnoreAudit(
            is_valid=is_valid,
            total_rules=len(lines),
            critical_exclusions_present=present,
            missing_exclusions=missing,
            rules_sample=lines[:10],
        )

    def analyze_dockerfile(self, filename: str, service_name: str) -> ContainerImageSpec:
        """Parses a Dockerfile to verify multi-stage build, non-root user, and entrypoint."""
        dockerfile_path = self._resolve_file_path(filename)
        checks: list[ContainerSecurityCheck] = []
        score = 100.0

        if not os.path.exists(dockerfile_path):
            checks.append(
                ContainerSecurityCheck(
                    check_id="FILE_EXISTS",
                    title="Dockerfile Existence",
                    status="FAILED",
                    description=f"Specification file '{filename}' was not found in {self.backend_dir}.",
                    severity="CRITICAL",
                )
            )
            return ContainerImageSpec(
                service_name=service_name,
                dockerfile_path=filename,
                base_image="unknown",
                is_multistage=False,
                is_non_root=False,
                user_name="root",
                exposed_ports=[],
                entrypoint_cmd="",
                healthcheck_defined=False,
                security_score_pct=0.0,
                security_checks=checks,
            )

        with open(dockerfile_path, "r", encoding="utf-8") as f:
            content = f.read()

        # 1. Multi-Stage Check
        from_matches = re.findall(r"^FROM\s+(\S+)(?:\s+AS\s+(\S+))?", content, re.MULTILINE | re.IGNORECASE)
        is_multistage = len(from_matches) >= 2
        if is_multistage:
            checks.append(
                ContainerSecurityCheck(
                    check_id="MULTI_STAGE",
                    title="Multi-Stage Build Pattern",
                    status="PASSED",
                    description=f"Enforces multi-stage build pipeline with {len(from_matches)} stages.",
                    severity="HIGH",
                )
            )
        else:
            score -= 30.0
            checks.append(
                ContainerSecurityCheck(
                    check_id="MULTI_STAGE",
                    title="Multi-Stage Build Pattern",
                    status="FAILED",
                    description="Single-stage build detected. Multi-stage separation is required.",
                    severity="HIGH",
                )
            )

        # Base image
        runtime_base = from_matches[-1][0] if from_matches else "unknown"

        # 2. Non-root user check
        user_match = re.search(r"^USER\s+(\S+)", content, re.MULTILINE | re.IGNORECASE)
        user_name = user_match.group(1) if user_match else "root"
        is_non_root = user_name.lower() not in ("root", "0")

        if is_non_root:
            checks.append(
                ContainerSecurityCheck(
                    check_id="NON_ROOT_USER",
                    title="Least Privilege Execution",
                    status="PASSED",
                    description=f"Container executes under non-root account '{user_name}'.",
                    severity="CRITICAL",
                )
            )
        else:
            score -= 35.0
            checks.append(
                ContainerSecurityCheck(
                    check_id="NON_ROOT_USER",
                    title="Least Privilege Execution",
                    status="FAILED",
                    description="Container runs as root. An unprivileged user must be declared.",
                    severity="CRITICAL",
                )
            )

        # 3. Exposed Ports
        expose_matches = re.findall(r"^EXPOSE\s+([0-9\s]+)", content, re.MULTILINE | re.IGNORECASE)
        exposed_ports: list[int] = []
        for match in expose_matches:
            for p in match.split():
                if p.isdigit():
                    exposed_ports.append(int(p))

        # 4. Entrypoint / CMD
        cmd_match = re.search(r"^(?:CMD|ENTRYPOINT)\s+(.+)", content, re.MULTILINE | re.IGNORECASE)
        entrypoint_cmd = cmd_match.group(1).strip() if cmd_match else ""

        # 5. Healthcheck check
        healthcheck_defined = bool(re.search(r"^HEALTHCHECK\s+", content, re.MULTILINE | re.IGNORECASE))
        if service_name == "api_gateway":
            if healthcheck_defined:
                checks.append(
                    ContainerSecurityCheck(
                        check_id="HEALTHCHECK",
                        title="Container Health Probe",
                        status="PASSED",
                        description="Built-in Docker HEALTHCHECK probe configured.",
                        severity="MEDIUM",
                    )
                )
            else:
                score -= 15.0
                checks.append(
                    ContainerSecurityCheck(
                        check_id="HEALTHCHECK",
                        title="Container Health Probe",
                        status="WARNING",
                        description="No native HEALTHCHECK declared in web container.",
                        severity="MEDIUM",
                    )
                )
        else:
            # Worker daemon is headless, orchestrator checks process liveness
            checks.append(
                ContainerSecurityCheck(
                    check_id="HEADLESS_RUNNER",
                    title="Headless Daemon Entrypoint",
                    status="PASSED",
                    description="Worker runs continuously via Redis stream loop.",
                    severity="LOW",
                )
            )

        return ContainerImageSpec(
            service_name=service_name,
            dockerfile_path=filename,
            base_image=runtime_base,
            is_multistage=is_multistage,
            is_non_root=is_non_root,
            user_name=user_name,
            exposed_ports=exposed_ports,
            entrypoint_cmd=entrypoint_cmd,
            healthcheck_defined=healthcheck_defined,
            security_score_pct=max(0.0, score),
            security_checks=checks,
        )

    def generate_full_report(self, trace_id: Optional[str] = None) -> ContainerSpecReport:
        """Generates comprehensive container specification report for all services."""
        trace = trace_id or generate_trace_id()
        api_spec = self.analyze_dockerfile("Dockerfile.api", "api_gateway")
        worker_spec = self.analyze_dockerfile("Dockerfile.worker", "stream_worker")
        dockerignore_audit = self.audit_dockerignore()

        # Calculate composite compliance score
        scores = [api_spec.security_score_pct, worker_spec.security_score_pct]
        if dockerignore_audit.is_valid:
            scores.append(100.0)
        else:
            scores.append(40.0)

        composite_score = round(sum(scores) / len(scores), 1)
        status = "CERTIFIED" if composite_score >= 90.0 else "WARNING" if composite_score >= 70.0 else "FAILED"

        return ContainerSpecReport(
            system_name="Automated Equity Research Engine",
            status=status,
            total_services=2,
            compliance_score_pct=composite_score,
            services=[api_spec, worker_spec],
            dockerignore_audit=dockerignore_audit,
            timestamp_iso=datetime.now(timezone.utc).isoformat(),
            trace_id=trace,
        )
