---
source_of_truth: manual
last_verified_at: 2026-04-12
owned_by: platform-team
derived_from:
  - apps/web/src/App.tsx
  - apps/web/src/lib/workspace-modules.tsx
  - backend/src/platform_backend/api
  - backend/src/platform_backend/services/platform_store.py
---

# Architecture Overview

## System Boundaries

- `apps/web`: operator-facing workspace UI, module navigation, overview, and cross-page handoff entry.
- `backend/src/platform_backend/api`: REST boundary for assets, workflows, models, settings, and feedback.
- `backend/src/platform_backend/services`: asset visibility, platform settings, and orchestration-facing domain logic.
- `backend/src/platform_backend/workflows`: workflow execution and GEE runtime integration.

## Shared Design Spine

- Modules are registered once and reused across navigation, overview, and generated documentation.
- Assets are treated as reusable outputs with explicit downstream consumers.
- Workflow outputs are expected to advertise whether they can feed map overlays, asset catalogs, or later workflow steps.
- Personal account data, reusable assets, and workspace-wide settings are separated into different pages and responsibilities.

## Runtime Flows

1. A user enters the workspace through the overview and module registry.
2. Reusable inputs such as datasets, ROIs, models, and credentials move into workflows.
3. Workflow runs produce result assets that should flow back into the asset hub.
4. Overlay-compatible outputs continue into the spatial workspace without manual reformatting.
5. Published assets remain visible through dataset, product, and overview surfaces.

## Documentation Rules

- API contracts are generated, not narrated manually.
- Module capabilities come from the shared module registry.
- Architecture docs should capture boundaries and flow constraints, not volatile UI copy.
