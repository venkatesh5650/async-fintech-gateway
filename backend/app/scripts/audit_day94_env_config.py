"""
Multi-Environment Promotion Verification Suite Runner
"""

import asyncio
from app.scripts.audit_env_config import run_env_config_audit

if __name__ == "__main__":
    asyncio.run(run_env_config_audit())
