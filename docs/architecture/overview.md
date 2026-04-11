# Architecture Overview

## System Boundaries

- `apps/web`: operator-facing UI for datasets, workflows, and model runs
- `backend/api`: REST API and orchestration boundary
- `backend/worker`: async execution for ingestion, split jobs, and inference
- `backend/tiler`: tile preview boundary for raster outputs

## Core Flows

1. Upload dataset through a presigned object-storage session
2. Confirm upload and create a `DatasetVersion`
3. Run ingestion or split job in the worker
4. Publish preview URLs and metadata for the UI
5. Build or run workflows against datasets and model versions

## Stage-1 Refactor Spine

- `AssetFlow` now treats dataset versions and workflow versions as reusable versioned assets
- `Execution` is the shared runtime view for workflow runs and their produced outputs
- Result datasets carry standardized lineage metadata:
  `source_execution_id`, `source_workflow_version_id`, and `upstream_asset_version_ids`
- The new `/api/v1/asset-flow/overview` endpoint exposes the first vertical slice:
  dataset input -> workflow execution -> result artifact
- `/api/v1/asset-flow/input-candidates` now exposes consumer-oriented cross-page handoff:
  reusable dataset outputs -> workflow inputs, reusable workflow outputs -> map overlays,
  and saved ROIs -> workflow inputs

## Design Rules

- Every important asset is versioned
- Workflows are immutable once versioned
- Jobs are append-only operational records
- Preview services do not mutate source data
- Configuration stays environment-driven
- Cross-page reuse is explicit: every reusable output advertises which pages can consume it next
