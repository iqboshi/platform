from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    backend_src = repo_root / "backend" / "src"
    sys.path.insert(0, str(backend_src))

    from platform_backend.main import app

    output_path = repo_root / "docs" / "api" / "openapi.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(app.openapi(), indent=2), encoding="utf-8")
    print(f"OpenAPI exported to {output_path}")


if __name__ == "__main__":
    main()
