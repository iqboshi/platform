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

## Design Rules

- Every important asset is versioned
- Workflows are immutable once versioned
- Jobs are append-only operational records
- Preview services do not mutate source data
- Configuration stays environment-driven
