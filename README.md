# Platform

Platform is a remote sensing and data-processing workspace for dataset management,
tile/split generation, workflow orchestration, model inference, and result review.

## Highlights

- Dataset upload and version-oriented asset management
- Raster/vector preview with a dedicated tile service boundary
- Drag-and-drop workflow design for preprocessing, split jobs, and inference
- Model registry with versioned plugin adapters
- Async job execution with clear run history

## Repository Layout

```text
platform/
  apps/web          # React + Vite + Ant Design UI
  backend           # FastAPI API, domain logic, worker, and tiler entrypoints
  packages          # Shared frontend types and utilities
  config            # Env templates, logging, and deployment defaults
  infra             # Compose and infrastructure bootstrap manifests
  docs              # Architecture and API documentation
  scripts           # Local automation helpers
  tests             # End-to-end and scenario documentation
```

## Quick Start

### 1. Install frontend dependencies

```powershell
npm install
```

### 2. Create a Python environment

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -e .\backend[dev]
```

### 3. Copy environment template

```powershell
Copy-Item .\config\env\.env.example .\.env
```

### 4. Start the API

```powershell
uvicorn platform_backend.main:app --app-dir .\backend\src --reload
```

### 5. Start the web app

```powershell
npm run dev --workspace @platform/web
```

## Git Workflow

- Remote: [iqboshi/platform](https://github.com/iqboshi/platform.git)
- Default branch: `main`
- Short-lived branches: `feature/*`, `fix/*`, `chore/*`, `docs/*`
- Merge policy: PR only, CI must pass

## Current Status

This repository includes the initial platform scaffold:

- backend domain models and API contracts
- worker and tiler entrypoints
- frontend shell for dashboard, datasets, workflows, and models
- infrastructure examples for PostGIS, Redis, MinIO, and TiTiler

The next implementation cycle should connect the current API surface to the
persistence layer and object storage services.
