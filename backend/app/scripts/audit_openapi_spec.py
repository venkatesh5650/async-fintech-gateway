import asyncio
import json
import logging
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

import httpx
from httpx import ASGITransport
from app.core.openapi import custom_openapi
from app.main import app

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("audit_openapi_spec")


async def run_openapi_audit():
    logger.info("================================================================================")
    logger.info("[DAY 89 AUDIT] ENTERPRISE OPENAPI 3.1 SPECIFICATION VERIFICATION AUDIT")
    logger.info("================================================================================")

    schema = custom_openapi(app)

    # 1. Core Specification Metadata
    assert schema.get("openapi", "").startswith("3."), f"Expected OpenAPI 3.x, got {schema.get('openapi')}"
    info = schema.get("info", {})
    assert info.get("version") == "0.9.0", f"Expected version 0.9.0, got {info.get('version')}"
    assert "Automated Equity Research Engine" in info.get("title", "")
    assert len(info.get("description", "")) > 500, "Description must be comprehensive (>500 chars)"
    logger.info(
        f"[PASS] Assertion 1: Core specification metadata verified (Title='{info.get('title')}', Version={info.get('version')})."
    )

    # 2. Domain Tags Coverage
    tags = schema.get("tags", [])
    assert len(tags) >= 10, f"Expected >= 10 domain tags, got {len(tags)}"
    tag_names = set()
    for t in tags:
        assert "name" in t and "description" in t, f"Tag missing name or description: {t}"
        tag_names.add(t["name"])
    assert "Quantitative Time-Series Analytics" in tag_names
    assert "Intelligence & Agentic Orchestration" in tag_names
    assert "Document Ingestion & Qualitative RAG" in tag_names
    logger.info(f"[PASS] Assertion 2: {len(tags)} domain category tags verified with descriptions.")

    # 3. Endpoint Route & Method Completeness
    paths = schema.get("paths", {})
    assert len(paths) >= 25, f"Expected >= 25 paths, got {len(paths)}"
    total_endpoints = 0
    for path, methods in paths.items():
        for method, op in methods.items():
            if method.lower() in ["get", "post", "put", "delete", "patch"]:
                total_endpoints += 1
                assert "responses" in op, f"Endpoint {method.upper()} {path} missing responses"
    assert total_endpoints >= 30, f"Expected >= 30 endpoints, got {total_endpoints}"
    logger.info(f"[PASS] Assertion 3: {len(paths)} routes ({total_endpoints} operations) verified with responses.")

    # 4. Security Schemes & Standard Response Components
    components = schema.get("components", {})
    sec_schemes = components.get("securitySchemes", {})
    assert "BearerAuth" in sec_schemes, "BearerAuth security scheme required"
    assert "ApiKeyAuth" in sec_schemes, "ApiKeyAuth security scheme required"
    assert sec_schemes["BearerAuth"]["type"] == "http"
    assert sec_schemes["ApiKeyAuth"]["type"] == "apiKey"

    responses = components.get("responses", {})
    assert "BadRequestError" in responses
    assert "UnauthorizedError" in responses
    assert "RateLimitError" in responses
    assert "InternalServerError" in responses
    logger.info("[PASS] Assertion 4: Security schemes (BearerAuth, ApiKeyAuth) and standard error responses verified.")

    # 5. Gateway Endpoints & Exported JSON Artifact Integrity
    backend_root = Path(__file__).resolve().parent.parent.parent
    backend_spec = backend_root / "openapi.json"
    frontend_spec = backend_root.parent / "frontend" / "public" / "openapi.json"

    assert backend_spec.exists(), f"Backend openapi.json missing at {backend_spec}"
    assert frontend_spec.exists(), f"Frontend openapi.json missing at {frontend_spec}"

    with open(backend_spec, "r", encoding="utf-8") as f:
        b_data = json.load(f)
    with open(frontend_spec, "r", encoding="utf-8") as f:
        f_data = json.load(f)

    assert b_data.get("info", {}).get("version") == "0.9.0"
    assert f_data.get("info", {}).get("version") == "0.9.0"

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        resp = await client.get("/v1/system/openapi.json")
        assert resp.status_code == 200
        api_data = resp.json()
        assert api_data["info"]["version"] == "0.9.0"
        assert len(api_data["paths"]) == len(paths)

    logger.info(
        "[PASS] Assertion 5: Exported filesystem artifacts and GET /v1/system/openapi.json verified with 100% integrity."
    )

    logger.info("================================================================================")
    logger.info("[DAY 89 CERTIFIED] 5/5 OPENAPI SPECIFICATION ASSERTIONS PASSED (100% CLEAN)")
    logger.info("================================================================================")


if __name__ == "__main__":
    asyncio.run(run_openapi_audit())
