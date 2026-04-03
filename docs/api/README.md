# API Notes

## Versioning

- Primary API base path: `/api/v1`
- Tile endpoints remain under `/tiles/*`
- The frontend is prepared to consume OpenAPI-generated contracts later

## Current Modules

- `auth`
- `workspaces`
- `datasets`
- `dataset-versions`
- `splits`
- `workflows`
- `workflow-runs`
- `models`
- `jobs`
- `tiles`

## Export Contract

```powershell
python .\scripts\export_openapi.py
```
