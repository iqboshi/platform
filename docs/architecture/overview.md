---
source_of_truth: manual
last_verified_at: 2026-04-16
owned_by: platform-team
derived_from:
  - apps/web/src/App.tsx
  - apps/web/src/lib/workspace-modules.tsx
  - backend/src/platform_backend/api
  - backend/src/platform_backend/services/platform_store.py
  - backend/src/platform_backend/workflows/subgraph_runtime.py
  - backend/src/platform_backend/workflows/patch_runtime.py
  - docs/architecture/custom-api-node-contract.md
---

# Architecture Overview

## System Boundaries

- `apps/web`: operator-facing workspace UI, module navigation, overview, and cross-page handoff entry.
- `backend/src/platform_backend/api`: REST boundary for assets, workflows, models, settings, and feedback.
- `backend/src/platform_backend/services`: asset visibility, platform settings, and orchestration-facing domain logic.
- `backend/src/platform_backend/workflows`: workflow execution and GEE runtime integration.

## Shared Design Spine

- Modules are registered once and reused across navigation, overview, and generated documentation.
- Assets are treated as reusable outputs or shared capabilities with explicit downstream consumers.
- Asset-facing pages should expose the next valid handoff directly instead of forcing download and re-upload loops.
- Workflow outputs are expected to advertise whether they can feed map overlays, asset catalogs, or later workflow steps.
- Workflow node extensibility is contract-first. New starter inputs, reusable outputs, and preview actions must follow `docs/architecture/workflow-node-extension-standard.md`.
- Workflow composition stays structurally explicit: outer graphs remain acyclic while nested subgraphs, structural boundary nodes, and `control.for_each` bodies define scoped inner execution.
- Provider HTTP API integrations are valid specialized boundary nodes, but they must use the shared versioned contract in `docs/architecture/custom-api-node-contract.md`.
- Personal account data, reusable assets, and workspace-wide settings are separated into different pages and responsibilities.
- GEE credentials belong to the asset hub when they can be shared or promoted to platform defaults, because they participate in downstream workflow execution like other reusable capabilities.
- The overview is task-oriented: action queue, announcement state, recent runs, and module entry all come from live workspace state instead of duplicated feature copy.

## Runtime Flows

1. A user enters the workspace through the overview and module registry.
2. Reusable inputs such as datasets, ROIs, models, and shared capabilities like GEE credentials move into workflows.
3. Workflow and spatial pages surface persistent handoff feedback so the receiving side remains visible after route changes.
4. Workflow runs produce result assets that should flow back into the asset hub.
5. Overlay-compatible outputs continue into the spatial workspace without manual reformatting.
6. Published assets remain visible through dataset, product, and overview surfaces.

## Documentation Rules

- API contracts are generated, not narrated manually.
- Module capabilities come from the shared module registry.
- Architecture docs should capture boundaries and flow constraints, not volatile UI copy.
- Workflow node implementation details belong in the extension standard; feature pages should consume that shared contract rather than restating node-specific logic.
