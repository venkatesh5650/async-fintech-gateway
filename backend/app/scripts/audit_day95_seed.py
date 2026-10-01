"""
Production Seeding Verification Suite Runner
"""

import asyncio
from app.scripts.audit_production_seed import run_production_seed_audit

if __name__ == "__main__":
    asyncio.run(run_production_seed_audit())
