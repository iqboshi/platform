---
source_of_truth: manual
last_verified_at: 2026-04-12
owned_by: platform-team
derived_from:
  - docs/api/README.md
  - docs/architecture/overview.md
  - docs/architecture/documentation-governance.md
  - docs/generated/README.md
  - apps/web/src/config/workspace-modules.json
---

# Documentation Index

- `docs/api`: generated API contract entry points and export instructions.
- `docs/architecture`: current architecture facts and documentation governance rules.
- `docs/generated`: artifacts generated from code-owned registries.

## Generated Sync Points

- `docs/generated/module-catalog.md` is exported from `apps/web/src/config/workspace-modules.json`.
- The workspace module registry now drives navigation, overview cards, and generated module documentation together.

## Commands

```powershell
npm run docs:modules
npm run docs:validate
```

## Rules

- API behavior must be derived from code or generated contracts, not hand-maintained prose.
- Architecture documents should describe stable boundaries, ownership, and flow constraints.
- Every Markdown document in `docs/` must declare metadata and a source of truth.
