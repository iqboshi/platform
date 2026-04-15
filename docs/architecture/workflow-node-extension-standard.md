---
source_of_truth: manual
last_verified_at: 2026-04-16
owned_by: platform-team
derived_from:
  - packages/types/src/index.ts
  - apps/web/src/features/workflows/draft-handoff.ts
  - apps/web/src/features/workflows/workflow-semantics.ts
  - apps/web/src/features/workflows/workflow-subgraphs.ts
  - apps/web/src/components/WorkflowCanvas.tsx
  - apps/web/src/features/asset-flow/handoff.ts
  - backend/src/platform_backend/schemas/workflow.py
  - backend/src/platform_backend/workflows/catalog.py
  - backend/src/platform_backend/workflows/patch_runtime.py
  - backend/src/platform_backend/workflows/gee_runtime.py
  - backend/src/platform_backend/workflows/tabular_runtime.py
  - backend/src/platform_backend/workflows/subgraph_runtime.py
  - backend/src/platform_backend/workflows/validation.py
  - backend/tests/test_workflow_validation.py
---

# Workflow Node Extension Standard

This document is normative. Future agents adding workflow nodes must follow these rules. Do not add page-level special cases instead of conforming to this contract.

## 0. Semantic Model Comes First

Workflow correctness is defined by semantic boundaries, not by whether a node is convenient to place on the canvas.

Every new node or template must respect this layering:

- Asset handle nodes expose reusable references such as `dataset_version`, `model_version`, `spatial_roi`, and `gee_credential`.
- Loader or adapter nodes convert asset handles into typed workflow data such as `table`, `geo_raster`, `image_collection`, `feature_collection`, `mask_raster`, or `mask_collection`.
- Pure transform nodes consume typed workflow data and emit typed workflow data. They must not silently look up assets by id when an upstream binding already exists.
- Sampling nodes convert imagery into `tile_set`, convert supervision into `label_set`, and bind them into `sample_set`.
- Publishing or persistence nodes create durable outputs such as `dataset_version`, `model_version`, or artifact files.

Rules:

- `dataset_version` is only an asset handle. It is not equivalent to `table`, `geo_raster`, `image_collection`, or `feature_collection`.
- A node must not claim a broader semantic type than it truly emits. For example, a tile generator emits `tile_set`, not `dataset_version`.
- Cross-page handoff should target stable handles, not loaded in-memory workflow values.
- Validation must reject graphs that bridge semantic layers without an explicit loader, adapter, or publisher.
- Semantic-preserving transform nodes must propagate `taskTypes`, `annotationKinds`, `sampleKinds`, and other declared contract semantics through runtime previews and validation, rather than dropping them after the first transform.
- If a node converts one supervision form into another, for example features to mask labels or features to polygon annotations, its output contract must explicitly declare the produced task and annotation semantics.

Examples:

- `source.dataset_version -> raster.load_georaster -> rgb.patchify_raster -> dataset.build_samples` is valid.
- `source.dataset_version -> rgb.patchify_raster` is invalid because a dataset handle is not a raster.
- `source.dataset_version -> table.load_csv -> table.train_test_split` is valid only when the dataset contract matches a CSV tabular dataset.

## 0.1 Primitive Nodes Beat Wrapper Nodes

If a capability can be expressed as a fixed subgraph of existing primitives, prefer a template over a new node.

Create a new primitive node only when at least one of these is true:

- It introduces a new external side effect or runtime boundary, such as querying a remote catalog or persisting a new asset.
- It performs a non-trivial operation that cannot be decomposed into existing node contracts without losing important runtime guarantees.
- It exposes a reusable semantic type that does not already exist in the graph model.

Provider-specific or externally integrated boundary nodes are valid primitives when they encapsulate real remote-system behavior that the current generic graph model does not fully express.

Rules:

- Do not collapse `select asset`, `load asset`, `transform`, and `publish result` into one all-purpose node when existing primitives already cover those steps.
- Do not create a node only because a sequence is common; common sequences belong in templates.
- Boundary nodes may be specialized, but they still must expose strict typed inputs, outputs, params, contracts, previews, and validation behavior.
- Boundary nodes should be tagged explicitly, for example `boundary` plus a provider tag such as `provider_gee` or `provider_http_api` when applicable.
- `provider_http_api` boundary nodes must use the shared versioned request and response contract in `docs/architecture/custom-api-node-contract.md`. Do not invent node-local HTTP payload shapes.
- Wrapper nodes that remain only for migration or convenience must be explicitly marked as `convenience` or `legacy`, and new templates should prefer the primitive path.
- External training and prediction nodes are valid boundary primitives when they create or consume real persisted `model_version` assets and cannot be decomposed into existing in-process primitives.

Examples:

- `geo.query_raster_collection -> geo.filter_scene_collection -> geo.sort_scene_collection -> geo.select_scene -> geo.fetch_scene_as_dataset` is the preferred primitive path.
- A Sentinel-2 downloader can be a valid specialized boundary node if it genuinely encapsulates external provider query and download behavior that is not fully represented by existing primitives.

## 0.2 Structured Control Flow Beats Arbitrary Cycles

The outer workflow graph remains acyclic.

Rules:

- Do not introduce free-form back-edges just to emulate loops or branches.
- If branching or iteration is needed, add explicit structured control nodes such as `control.if`, `control.switch`, `control.for_each`, `control.retry`, or `workflow.call_subgraph`.
- Control nodes must expose typed inputs and outputs like any other primitive. They are not exempt from contracts just because they orchestrate execution.
- Generic control nodes should prefer `value`, `value_list`, `annotation_set`, `prediction_set`, and other reusable semantic types instead of task-specific wrappers.
- Do not ship a fake loop node that only changes labels on the canvas but cannot express body execution, skip propagation, and merge semantics in runtime and validation.
- `workflow.call_subgraph` remains the base structural composition primitive. Its external interface is derived from nested `workflow.subgraph_input` and `workflow.subgraph_output` boundary nodes, not manually hand-maintained on the outer node.
- `control.for_each` is a real structural loop primitive, not a canvas alias. It reuses the same nested boundary-node model for its body.
- For `control.for_each`, the outer node must expose a required `items: value_list` input. Nested `workflow.subgraph_input` nodes with keys `item` and `index` are reserved per-iteration body inputs injected by runtime, not outer graph inputs.
- For `control.for_each`, each declared nested `workflow.subgraph_output` is aggregated into a `value_list` on the outer node, preserving deterministic per-iteration ordering.
- Boundary nodes are valid only inside a structural subgraph body.
- Outer graphs and nested subgraphs must each remain acyclic.
- Until real higher-level wrappers exist, prefer primitive branch-building nodes such as boolean emitters, comparators, negation, guards, coalescers, and `workflow.call_subgraph`. A higher-level `if` or `for_each` wrapper should be added only when it has stricter semantics than those primitives and is not merely a convenience alias.

Rationale:

- Arbitrary cycles make validation, preview, scheduling, and runtime determinism much harder.
- Structured control nodes keep the canvas expressive while preserving strict workflow semantics.

## 1. Shared Contract Is Mandatory

- Every new node must be described first in `packages/types/src/index.ts` and `backend/src/platform_backend/schemas/workflow.py` compatible terms.
- A node is not considered integrated if it only appears in the backend catalog. It must also satisfy handoff, preview, and testing rules below.
- New capabilities must extend the shared unions instead of introducing ad hoc strings inside page components.
- `WorkflowNode` may carry instance-level `inputDefs`, `inputContracts`, `outputDefs`, `outputContracts`, and `subgraph` only when the node is a genuine dynamic-interface structural primitive such as `workflow.call_subgraph`, `control.for_each`, `workflow.subgraph_input`, or `workflow.subgraph_output`.
- Runtime, validation, and frontend analysis must all resolve the same effective interface for these nodes. Do not let the canvas, backend validator, and executor disagree on the meaning of a dynamic port.

When a port contract needs stricter semantics than raw data type alone, use shared semantic fields instead of task-specific wrapper nodes:

- `taskTypes`
- `annotationKinds`
- `sampleKinds`
- `valueTypes`

Examples:

- A semantic-segmentation trainer should constrain `taskTypes: ["semantic_segmentation"]` instead of requiring a bespoke segmentation-only sample wrapper node.
- A control node consuming a boolean flag should constrain `valueTypes: ["boolean"]` on a `value` port.

## 2. Catalog Requirements

Every node added to `backend/src/platform_backend/workflows/catalog.py` must declare:

- `type`, `label`, `category`, `runtime_kind`, `supported_tasks`, `tags`
- Complete `inputs`, `outputs`, and `params`
- `input_contracts`, `output_contracts`, `example_inputs`, `example_outputs`, `common_errors`

Exception:

- Structural dynamic-interface primitives may intentionally declare empty static `inputs` or `outputs` in the catalog when their real interface is derived from instance-level node data. These nodes must be tagged `structural`, and their runtime plus validation behavior must define exactly how the effective interface is derived.

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
- For standard mode pairs such as `roiId`/`roiMode` and `personalCredentialId`/`credentialMode`, the normalized catalog and generic draft handoff path may infer the stable mode switch automatically, but the effective binding must still behave exactly as if those `presetParams` had been declared explicitly.
- `autoCreate: true` is allowed only on meaningful starter nodes that still make sense when created alone.
- `autoCreate: false` must be used for nodes that require other upstream inputs to become useful.
- If multiple catalog nodes can accept the same handoff and no compatible node exists in the current graph, the highest `priority` wins for auto-create selection.
- If multiple existing nodes in the current graph can accept the same handoff and the handoff does not carry an explicit target node id, generic attachment must refuse the bind as ambiguous instead of mutating an arbitrary node.
- If a handoff carries `targetNodeId`, generic attachment must only attempt to bind that node. It must not silently retarget to another compatible node or fall back to auto-create.
- A receiving workflow page may resolve this ambiguity by presenting a target-selection UI built from the matched node ids, then re-attempting attachment with an explicit `targetNodeId`.

Examples:

- `source.dataset_version` binds `datasetVersionId` and may auto-create.
- `source.sentinel2_gee_download` binds `roiId` with `presetParams: { roiMode: "saved_roi" }`.
- A workflow dataset handoff may include `targetNodeId: "image-source"` to bind one specific starter in a graph that has multiple dataset starters.
- `tabular.linear_regression_predict` may accept `modelVersionId`, but must not auto-create because it still needs a table input.

Starter bindings must not bypass semantic layers:

- A handoff into `dataset_version` may prefill a dataset selector.
- A handoff must not pretend that a dataset handle is already a loaded table or raster.

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
- Canvas validation, parameter filtering, and issue focus must be driven by shared contracts and semantic analysis, not by page-only guesses about which node "usually" connects to which.
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
- Run `python .\\scripts\\validate_workflow_nodes.py`
- Run `npm run lint --workspace @platform/web`
- Run `npm run test --workspace @platform/web`
- Run `npm run build --workspace @platform/web`
- Run `python .\\scripts\\validate_docs.py`

## 10. Scaffold Generator

Before wiring a new node by hand, generate a scaffold pack:

```powershell
python .\scripts\create_workflow_node_scaffold.py --node-type custom.example_node --label "Example Node"
```

Rules:

- The scaffold pack is written to `tmp/workflow-node-scaffolds/<node-type-slug>/`.
- Fill the generated snippets, then merge them into the real catalog, runtime, mock catalog, and tests.
- Do not treat the scaffold output as the implementation itself. It is a consistency aid, not a compatibility layer.

## 11. Anti-Patterns

Do not do any of the following:

- Keep legacy compatibility layers that duplicate the new contract path
- Add page-only buttons that bypass shared handoff helpers
- Serialize reusable outputs as unlabeled blobs
- Introduce a node that only works when the author remembers an undocumented follow-up edit in another page
- Update backend catalog without updating frontend mock catalog
- Treat `dataset_version` as if it already were a loaded raster, image collection, vector collection, or table
- Introduce a node whose main purpose is to bundle multiple existing semantic stages that should remain composable
- Add a new "special" geospatial wrapper when the same behavior should be a template built from `geo.*`, `raster.*`, `image.*`, `vector.*`, `rgb.*`, `label.*`, and `dataset.*` primitives

## 12. Minimal Change Template

When adding a new reusable node, touch these areas in order:

1. Decide whether the capability should be a primitive node or a template built from existing primitives.
2. Generate a scaffold pack if the node is new enough that a fresh template will save time.
3. Extend shared types if a new reusable kind is genuinely needed.
4. Add catalog entry with contracts and `starter_bindings` or `output_behaviors`.
5. Update runtime execution and preview serialization.
6. Update mock catalog.
7. Add or update handoff tests.
8. Run workflow node validation, lint, tests, build, and docs validation.

If a future agent cannot satisfy this checklist, it should stop and finish the contract work before adding more UI.
