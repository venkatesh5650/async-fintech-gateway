import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.core.openapi import export_openapi_json
from app.main import app


def run_export():
    backend_root = Path(__file__).resolve().parent.parent.parent
    frontend_public = backend_root.parent / "frontend" / "public"

    targets = [
        backend_root / "openapi.json",
        frontend_public / "openapi.json",
    ]

    schema = export_openapi_json(app, targets)
    total_paths = len(schema.get("paths", {}))
    total_tags = len(schema.get("tags", []))
    total_schemas = len(schema.get("components", {}).get("schemas", {}))

    print("================================================================================")
    print("[SPECIFICATION EXPORT] ENTERPRISE OPENAPI 3.1 CONTRACTS GENERATED")
    print("================================================================================")
    print(f"Title:         {schema.get('info', {}).get('title')}")
    print(f"Version:       {schema.get('info', {}).get('version')}")
    print(f"Total Paths:   {total_paths} endpoint routes documented")
    print(f"Total Tags:    {total_tags} domain category tags")
    print(f"Total Schemas: {total_schemas} Pydantic contract schemas")
    print("Targets:")
    for t in targets:
        print(f"  -> {t}")
    print("================================================================================")


if __name__ == "__main__":
    run_export()
