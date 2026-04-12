---
source_of_truth: generated
last_verified_at: 2026-04-12
owned_by: platform-backend
derived_from:
  - scripts/export_openapi.py
  - docs/api/openapi.json
  - backend/src/platform_backend/api
---

# API Notes

## Source Of Truth

- Runtime API behavior is defined in backend route and schema code.
- `docs/api/openapi.json` is the generated contract snapshot for consumers.
- Do not hand-maintain endpoint field details here.

## Export Commands

```powershell
python .\scripts\export_openapi.py
```

## Usage

- Treat this directory as generated-interface documentation.
- If routes, payloads, or response shapes change, regenerate `openapi.json`.
- Cross-page handoff behavior should be documented in generated module and asset-flow docs, not duplicated here.
