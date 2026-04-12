---
source_of_truth: manual
last_verified_at: 2026-04-12
owned_by: platform-team
derived_from:
  - packages/types/src/index.ts
  - apps/web/src/features/workflows/draft-handoff.ts
  - apps/web/src/components/WorkflowCanvas.tsx
  - apps/web/src/features/asset-flow/handoff.ts
  - backend/src/platform_backend/schemas/workflow.py
  - backend/src/platform_backend/workflows/catalog.py
  - backend/src/platform_backend/workflows/tabular_runtime.py
---

# Workflow Node Extension Standard

This document is normative. Future agents adding workflow nodes must follow these rules. Do not add page-level special cases instead of conforming to this contract.

## 1. Shared Contract Is Mandatory

- Every new node must be described first in `packages/types/src/index.ts` and `backend/src/platform_backend/schemas/workflow.py` compatible terms.
- A node is not considered integrated if it only appears in the backend catalog. It must also satisfy handoff, preview, and testing rules below.
- New capabilities must extend the shared unions instead of introducing ad hoc strings inside page components.

## 2. Catalog Requirements

Every node added to `backend/src/platform_backend/workflows/catalog.py` must declare:

- `type`, `label`, `category`, `runtime_kind`, `supported_tasks`, `tags`
- Complete `inputs`, `outputs`, and `params`
- `input_contracts`, `output_contracts`, `example_inputs`, `example_outputs`, `common_errors`

If the node can receive a cross-page starter input, it must also declare `starter_bindings`.

If the node emits a reusable result, it must also declare `output_behaviors`.

## 3. Starter Binding Rules

Use `starter_bindings` whenever a page handoff should be able to prefill or bind the node.

Allowed `inputKind` values are:

- `dataset_version`
- `spatial_roi`
- `model_version`
- `gee_credential`

Rules:

- `paramKey` must point to the real parameter that the runtime consumes.
- `presetParams` must contain only stable defaults required to activate that input mode.
- `autoCreate: true` is allowed only on meaningful starter nodes that still make sense when created alone.
- `autoCreate: false` must be used for nodes that require other upstream inputs to become useful.
- If multiple nodes can accept the same handoff, the highest `priority` wins for auto-create selection.

Examples:

- `source.dataset_version` binds `datasetVersionId` and may auto-create.
- `source.sentinel2_gee_download` binds `roiId` with `presetParams: { roiMode: "saved_roi" }`.
- `tabular.linear_regression_predict` may accept `modelVersionId`, but must not auto-create because it still needs a table input.

Forbidden:

- Hardcoding node type checks in `WorkflowsPage.tsx`
- Reimplementing attach logic outside `apps/web/src/features/workflows/draft-handoff.ts`
- Adding a new handoff query param without extending `AssetHandoffPayload`

## 4. Output Reuse Rules

If a node output is reusable across pages, the node must define `output_behaviors`.

`output_behaviors` must identify:

- `portKey`
- compatible `previewKinds`
- downstream `usages`

Allowed downstream usages are:

- workflow target with `dataset_version`
- workflow target with `spatial_roi`
- workflow target with `model_version`
- workflow target with `gee_credential`
- spatial target with `asset_version`

Do not rely on UI-only guesswork for reusable outputs. Runtime previews must carry enough structured data to make the reuse real.

## 5. Runtime Preview Rules

Node test previews are the canonical reuse surface for workflow outputs.

If a preview represents a reusable asset or capability, it must use one of the structured preview kinds:

- `dataset_version`
- `model_version`
- `gee_credential`
- `model_ref`
- `table`
- `metrics_report`
- `artifact_file`
- `value`

Rules:

- Preview payloads must include the stable object id when one exists.
- Reusable previews must include `nextActions` with a fully formed `handoff`.
- `handoff.source` should reflect the real source surface, for example `workflow_node_test`.
- If a result can open in Spatial Studio, emit a spatial handoff directly instead of asking the UI to reconstruct it from raw fields.

Examples:

- Dataset previews must include `datasetVersionId` and `nextActions` for workflow reuse. Add map handoff only when the dataset is actually map-ready.
- Model version previews must include `modelVersionId` and `nextActions` for workflow reuse.

Forbidden:

- Returning only human-readable strings when a stable asset id exists
- Emitting preview JSON that forces the frontend to infer ids from labels
- Adding node-specific preview buttons in `WorkflowCanvas.tsx`

## 6. Runtime Consumption Rules

When a node can consume a reusable asset through either an input binding or a parameter:

- Resolve the bound input first
- Fall back to the parameter second
- Keep that order consistent across runtime and preview logic

Do not make the UI responsible for resolving runtime precedence.

## 7. Frontend Integration Rules

The following files are the only allowed extension points for workflow handoff behavior:

- `apps/web/src/features/asset-flow/handoff.ts`
- `apps/web/src/features/workflows/draft-handoff.ts`
- `apps/web/src/features/workflows/node-registry.ts`
- `apps/web/src/components/WorkflowCanvas.tsx`

Rules:

- Add new handoff kinds in `handoff.ts`, then consume them through the generic draft attachment path.
- `draft-handoff.ts` must remain metadata-driven. Do not add a new `if (node.type === "...")` special path for each node.
- `WorkflowCanvas.tsx` may render preview actions, but it must route from structured `nextActions`, not node-type-specific button logic.
- `apps/web/src/mocks/platform.ts` must be updated whenever catalog contracts change, or tests and fallback mode will drift.

## 8. Spatial Interop Rules

If a workflow output should be visible in Spatial Studio:

- The workflow preview must emit a spatial handoff with target `spatial` and input kind `asset_version`.
- The receiving spatial page must only validate capability and load the handoff. It must not know which workflow node produced the result.
- Results intended for map overlay use must preserve enough metadata to determine map readiness without manual user rewriting.

## 9. Testing Checklist

A node extension is incomplete until all relevant checks pass.

- Add or update `draft-handoff` tests when starter behavior changes.
- Add or update page handoff tests when new handoff kinds become routable.
- Verify node test preview contains the expected structured kind and `nextActions`.
- Run `npm run lint --workspace @platform/web`
- Run `npm run test --workspace @platform/web`
- Run `npm run build --workspace @platform/web`
- Run `python .\\scripts\\validate_docs.py`

## 10. Anti-Patterns

Do not do any of the following:

- Keep legacy compatibility layers that duplicate the new contract path
- Add page-only buttons that bypass shared handoff helpers
- Serialize reusable outputs as unlabeled blobs
- Introduce a node that only works when the author remembers an undocumented follow-up edit in another page
- Update backend catalog without updating frontend mock catalog

## 11. Minimal Change Template

When adding a new reusable node, touch these areas in order:

1. Extend shared types if a new reusable kind is genuinely needed.
2. Add catalog entry with contracts and `starter_bindings` or `output_behaviors`.
3. Update runtime execution and preview serialization.
4. Update mock catalog.
5. Add or update handoff tests.
6. Run lint, tests, build, and docs validation.

If a future agent cannot satisfy this checklist, it should stop and finish the contract work before adding more UI.
