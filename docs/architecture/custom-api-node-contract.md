---
source_of_truth: manual
last_verified_at: 2026-04-16
owned_by: platform-team
derived_from:
  - backend/src/platform_backend/workflows/tabular_runtime.py
  - backend/src/platform_backend/workflows/patch_runtime.py
  - backend/src/platform_backend/workflows/catalog.py
  - backend/src/platform_backend/services/platform_store.py
  - backend/tests/test_api.py
---

# Custom API Node Contract

This document is normative for workflow boundary nodes tagged `provider_http_api`.

Use this contract when implementing external services that will be called by platform workflow nodes. Do not introduce node-specific request or response payloads outside this versioned contract.

## 1. Version And Compatibility

- Current contract version: `platform.custom_api.v1`
- Every external API request must include `specVersion`.
- External services should ignore unknown optional fields so the platform can add forward-compatible metadata.
- The platform may keep temporary legacy compatibility fields during migrations, but new services should implement the preferred `v1` envelope, not the legacy shortcuts.

## 2. Transport Rules

- Method: `POST`
- Content type: `application/json`
- Encoding: UTF-8
- Authentication:
  - `auth_type = none`: no auth header
  - `auth_type = bearer`: send `Authorization: Bearer <token>`
  - `auth_type = header`: send `<auth_header_name>: <token>`
- Timeout: use the node or model-configured timeout.
- Success: any `2xx` response with a JSON object body.
- Failure: use non-`2xx` status codes. The platform currently surfaces the response body text for HTTP failures.

Recommended error body:

```json
{
  "specVersion": "platform.custom_api.v1",
  "status": "error",
  "error": {
    "code": "INVALID_INPUT",
    "message": "feature_b is required",
    "details": {
      "missingFields": ["feature_b"]
    }
  }
}
```

Note: the current runtime does not special-case `200` error envelopes. If the service failed, return a non-`2xx` status.

## 3. Implemented Today: `predict_table`

This operation is executed today by `custom.api_predict`.

### 3.1 Request Shape

```json
{
  "specVersion": "platform.custom_api.v1",
  "operation": "predict_table",
  "taskType": "regression",
  "model": {
    "modelVersionId": "mdv_123",
    "modelId": "mdl_123",
    "version": "1.0.0",
    "framework": "http-api",
    "sourceType": "custom_api"
  },
  "input": {
    "kind": "table",
    "columns": ["feature_a", "feature_b"],
    "rows": [
      {"feature_a": "7", "feature_b": "8"},
      {"feature_a": "8", "feature_b": "9"}
    ],
    "rowCount": 2
  },
  "parameters": {
    "threshold": 0.7,
    "topK": 3
  },
  "requestedResponseMode": "prediction_values",
  "columns": ["feature_a", "feature_b"],
  "rows": [
    {"feature_a": "7", "feature_b": "8"},
    {"feature_a": "8", "feature_b": "9"}
  ]
}
```

Rules:

- `operation` must be `predict_table`.
- `input.kind` must be `table`.
- `input.columns` and `input.rows` preserve the input table order.
- `parameters` equals model `default_parameters` merged with node `callParametersJson`, with node values taking precedence.
- Top-level `columns` and `rows` are legacy compatibility fields. New services should read from `input.columns` and `input.rows`.

### 3.2 Success Response Shape

Preferred `v1` response envelope:

```json
{
  "specVersion": "platform.custom_api.v1",
  "operation": "predict_table",
  "status": "succeeded",
  "output": {
    "kind": "prediction_values",
    "predictions": [10.5, 12.25]
  }
}
```

Alternative when the model returns row-wise structured outputs:

```json
{
  "specVersion": "platform.custom_api.v1",
  "operation": "predict_table",
  "status": "succeeded",
  "output": {
    "kind": "table_rows",
    "rows": [
      {"prediction": "class_a", "score": 0.91},
      {"prediction": "class_b", "score": 0.82}
    ]
  }
}
```

Temporary legacy responses that are still accepted:

```json
{"predictions": [10.5, 12.25]}
```

```json
{"rows": [{"prediction": "class_a"}, {"prediction": "class_b"}]}
```

### 3.3 Response Mode Semantics

- `prediction_values`
  - Response payload must provide one prediction per input row.
  - The platform appends or overwrites the configured `predictionColumn` on each input row.
- `table_rows`
  - Response payload must provide one object per input row.
  - The platform merges each returned object into the corresponding input row.
  - Returned row order must exactly match input row order.

For both modes:

- Row count must equal input row count.
- The response body must be a JSON object.

## 4. Forward-Compatible Semantic Contracts

The following operations are not yet transported over HTTP in runtime, but their semantic contracts are already normative. When these nodes are wired to real remote calls, they must use this versioned envelope instead of inventing a new payload shape.

## 4.1 `train_samples`

Target node: `custom.api_train_samples`

Current runtime status:

- The node persists a `model_version` locally.
- It writes a training artifact JSON.
- It does not yet `POST` training samples to the remote service.

Future request envelope:

```json
{
  "specVersion": "platform.custom_api.v1",
  "operation": "train_samples",
  "taskType": "semantic_segmentation",
  "input": {
    "kind": "sample_training_bundle",
    "trainSamples": {
      "kind": "sample_set",
      "taskTypes": ["semantic_segmentation"],
      "sampleKinds": ["geospatial_tile"],
      "annotationKinds": ["mask"],
      "sampleCount": 128
    },
    "validationSamples": {
      "kind": "sample_set",
      "taskTypes": ["semantic_segmentation"],
      "sampleKinds": ["geospatial_tile"],
      "annotationKinds": ["mask"],
      "sampleCount": 32
    }
  },
  "modelConfig": {
    "predictionEndpointUrl": "https://example.com/predict",
    "trainingEndpointUrl": "https://example.com/train",
    "responseMode": "prediction_masks",
    "defaultPredictionColumn": "prediction"
  },
  "parameters": {
    "threshold": 0.5
  }
}
```

Future success response:

```json
{
  "specVersion": "platform.custom_api.v1",
  "operation": "train_samples",
  "status": "succeeded",
  "output": {
    "kind": "custom_api_model",
    "taskType": "semantic_segmentation",
    "predictionEndpointUrl": "https://example.com/predict",
    "trainingEndpointUrl": "https://example.com/train",
    "responseMode": "prediction_masks",
    "defaultPredictionColumn": "prediction",
    "defaultParameters": {
      "threshold": 0.5
    }
  }
}
```

Rules:

- The semantic identity of `trainSamples` and `validationSamples` must be preserved.
- The remote service must not silently change task semantics. If it changes them, return explicit metadata in `output`.

## 4.2 `predict_samples`

Target node: `custom.api_predict_samples`

Current runtime status:

- The node currently returns a semantic `prediction_set` placeholder and preserves task/sample semantics.
- It does not yet `POST` sample payloads to the remote service.

Future request envelope:

```json
{
  "specVersion": "platform.custom_api.v1",
  "operation": "predict_samples",
  "taskType": "semantic_segmentation",
  "model": {
    "modelVersionId": "mdv_custom_seg_001",
    "modelId": "mdl_custom_seg",
    "version": "1.0.0",
    "framework": "http-api",
    "sourceType": "custom_api"
  },
  "input": {
    "kind": "sample_set",
    "samples": {
      "kind": "sample_set",
      "taskTypes": ["semantic_segmentation"],
      "sampleKinds": ["geospatial_tile"],
      "annotationKinds": ["mask"],
      "sampleCount": 64
    }
  },
  "parameters": {
    "threshold": 0.5
  }
}
```

Future success response:

```json
{
  "specVersion": "platform.custom_api.v1",
  "operation": "predict_samples",
  "status": "succeeded",
  "output": {
    "kind": "prediction_set",
    "taskType": "semantic_segmentation",
    "taskTypes": ["semantic_segmentation"],
    "sampleKinds": ["geospatial_tile"],
    "annotationKinds": ["mask"],
    "sampleCount": 64,
    "predictions": {
      "storage": "inline_or_uri_defined_by_future_runtime"
    }
  }
}
```

Rules:

- Prediction payloads must preserve one-to-one alignment with the input sample order or sample grid.
- `sampleKinds`, `taskTypes`, and `annotationKinds` must remain explicit.
- Do not collapse semantic segmentation, instance segmentation, classification, and detection into an untyped generic blob.

## 5. Semantic Object Rules

For sample-oriented custom API operations, these semantic wrappers are mandatory:

- `sample_set`
  - Required: `kind`, `taskTypes`, `sampleKinds`
  - Optional but strongly recommended: `annotationKinds`, `sampleCount`, payload location fields
- `prediction_set`
  - Required: `kind`, `taskTypes` or `taskType`, `sampleKinds`
  - Optional but strongly recommended: `annotationKinds`, `sampleCount`, payload location fields

These fields exist to keep workflow semantics strict and composable. External APIs must preserve them instead of forcing the platform to re-infer task meaning from provider-specific labels.

## 6. Boundary Node Rule

Provider-specific HTTP API nodes are valid specialized boundary primitives, but they are still bound by shared workflow semantics:

- Asset handles, loaded workflow data, transforms, and persistence remain separate concerns.
- A custom API node may be specialized because it crosses a real remote boundary.
- The request and response contract must remain versioned and shared across all `provider_http_api` nodes.

See also: `docs/architecture/workflow-node-extension-standard.md`
