"""
Cloud Topology Verification Suite Runner
"""

import asyncio
from app.scripts.audit_cloud_topology import run_cloud_topology_audit

if __name__ == "__main__":
    asyncio.run(run_cloud_topology_audit())
