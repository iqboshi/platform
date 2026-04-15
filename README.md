# Platform

Platform is a remote sensing and data-processing workspace centered on reusable
assets, workflow orchestration, spatial visualization, model execution, and
workspace governance.

## Release Snapshot

- Current release target: `v6`
- Cross-page handoff is now contract-driven for datasets, ROIs, model versions, and GEE credentials.
- Workflow node extension rules are documented in `docs/architecture/workflow-node-extension-standard.md`.
- Structured workflow composition now includes nested subgraphs, boundary-node-derived interfaces, and explicit control-flow primitives instead of ad hoc page coupling.
- External HTTP API workflow nodes now share a versioned contract documented in `docs/architecture/custom-api-node-contract.md`.
- Workspace module documentation is generated from `apps/web/src/config/workspace-modules.json`.
- Workflow node scaffolding and contract validation are now built into local scripts and CI.
- Personal assets, workflows, spatial overlays, and workspace settings are documented as separate, composable surfaces.

## Highlights

- Reusable asset hub for datasets, workflow outputs, models, products, and shared capabilities
- Workflow canvas with starter bindings and structured preview actions
- Spatial studio that can consume overlay-ready workflow outputs directly
- Workspace overview, announcements, approvals, and notifications wired to live state
- Backend API, workflow runtime, and shared frontend types aligned through generated and code-owned docs

## Repository Layout

```text
platform/
  apps/web          # React + Vite + Ant Design UI
  backend           # FastAPI API, domain logic, worker, and tiler entrypoints
  packages          # Shared frontend types and utilities
  config            # Env templates, logging, and deployment defaults
  infra             # Compose and infrastructure bootstrap manifests
  docs              # Architecture, generated docs, API snapshots, and release notes
  scripts           # Local automation helpers
  tests             # End-to-end and scenario documentation
```

## Quick Start

### 1. Install frontend dependencies

```powershell
npm install
```

### 2. Prepare the Python environment

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -e .\backend[dev]
```

### 3. Copy the environment template

```powershell
Copy-Item .\config\env\.env.example .\.env
```

### 4. Start the backend

```powershell
uvicorn platform_backend.main:app --app-dir .\backend\src --reload
```

### 5. Start the frontend

```powershell
npm run dev --workspace @platform/web
```

## Documentation

- `docs/README.md`: docs index and governance entry
- `docs/architecture/overview.md`: stable boundaries and runtime flows
- `docs/architecture/workflow-node-extension-standard.md`: required workflow node integration rules
- `docs/architecture/custom-api-node-contract.md`: versioned request and response contract for `provider_http_api` workflow nodes
- `docs/generated/module-catalog.md`: generated module registry snapshot
- `docs/api/openapi.json`: generated API contract snapshot

## Validation Commands

```powershell
npm run lint --workspace @platform/web
npm run test --workspace @platform/web
npm run build --workspace @platform/web
python .\scripts\validate_workflow_nodes.py
python .\scripts\validate_docs.py
.venv\Scripts\python.exe -m pytest .\backend\tests
```

## Workflow Node Authoring

```powershell
python .\scripts\create_workflow_node_scaffold.py --node-type custom.example_node --label "Example Node"
python .\scripts\validate_workflow_nodes.py
```

The scaffold generator writes a starter pack to `tmp/workflow-node-scaffolds/`.
Use it before editing the real catalog, runtime, mock catalog, and tests.

## Git Workflow

- Remote: [iqboshi/platform](https://github.com/iqboshi/platform.git)
- Default branch: `main`
- Release tags: `v5.0`, `v5.1`, `v5.2`, `v5.3`, `v5.4`, `v6`
- Merge policy: PR or protected-branch push only after validation passes
