---
source_of_truth: manual
last_verified_at: 2026-04-12
owned_by: platform-team
derived_from:
  - scripts/validate_docs.py
  - scripts/export_module_catalog.py
  - apps/web/src/config/workspace-modules.json
  - docs/README.md
---

# Documentation Governance

## Classes Of Documentation

- Generated: OpenAPI snapshots, module catalog, and other artifacts exported from code-owned registries.
- Manual architecture: stable boundaries, flow contracts, design rules, and decision records.
- Operational notes: short-lived rollout or migration notes that should still declare metadata and ownership.

## Required Metadata

Every Markdown file in `docs/` must declare:

- `source_of_truth`
- `last_verified_at`
- `owned_by`
- `derived_from`

## Workflow

1. Change code or registry sources first.
2. Regenerate generated docs.
3. Update manual docs only where stable behavior or architecture changed.
4. Run documentation validation before merging.

## Commands

```powershell
python .\scripts\export_module_catalog.py
python .\scripts\validate_docs.py
```

## Intent

- Keep stale prose from drifting away from runtime behavior.
- Make it obvious which documents are safe to trust.
- Ensure overview, navigation, and generated docs stay aligned through shared module registration.
