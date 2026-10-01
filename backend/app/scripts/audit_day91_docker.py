"""
Container Build Specification Verification Suite Runner
"""

import asyncio
from app.scripts.audit_container_spec import run_container_spec_audit

if __name__ == "__main__":
    asyncio.run(run_container_spec_audit())
