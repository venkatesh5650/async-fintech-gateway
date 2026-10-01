"""
Tiered Health Probes Verification Suite Runner
"""

import asyncio
from app.scripts.audit_health_probes import run_health_probes_audit

if __name__ == "__main__":
    asyncio.run(run_health_probes_audit())
