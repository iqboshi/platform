from platform_backend.schemas.workflow import (
    WorkflowEdge,
    WorkflowGraph,
    WorkflowNode,
    WorkflowNodePort,
)
from platform_backend.workflows.validation import validate_workflow_graph


def test_cycle_detection() -> None:
    graph = WorkflowGraph(
        nodes=[
            WorkflowNode(
                id="a",
                type="tabular.linear_regression_predict",
                position={"x": 0, "y": 0},
                params={
                    "modelVersionId": "model-v1",
                    "predictionColumn": "prediction",
                },
                input_bindings={"table": "b:table"},
                output_defs=[
                    WorkflowNodePort(
                        key="table",
                        label="Prediction Table",
                        data_types=["table"],
                    )
                ],
            ),
            WorkflowNode(
                id="b",
                type="tabular.linear_regression_predict",
                position={"x": 1, "y": 1},
                params={
                    "modelVersionId": "model-v1",
                    "predictionColumn": "prediction",
                },
                input_bindings={"table": "a:table"},
                output_defs=[
                    WorkflowNodePort(
                        key="table",
                        label="Prediction Table",
                        data_types=["table"],
                    )
                ],
            ),
        ],
        edges=[
            WorkflowEdge(
                id="e1", source="a", target="b", source_handle="table", target_handle="table"
            ),
            WorkflowEdge(
                id="e2", source="b", target="a", source_handle="table", target_handle="table"
            ),
        ],
    )
    result = validate_workflow_graph(graph)
    assert result.valid is False
    assert "acyclic" in result.errors[0]


def test_valid_graph_passes() -> None:
    graph = WorkflowGraph(
        nodes=[
            WorkflowNode(
                id="a",
                type="source.dataset_version",
                position={"x": 0, "y": 0},
                params={"datasetVersionId": "dsv-1"},
                input_bindings={},
                output_defs=[
                    WorkflowNodePort(
                        key="dataset",
                        label="Dataset Version",
                        data_types=["dataset_version"],
                    )
                ],
            ),
            WorkflowNode(
                id="b",
                type="table.load_csv",
                position={"x": 1, "y": 1},
                params={"delimiter": ","},
                input_bindings={"dataset": "a:dataset"},
                output_defs=[WorkflowNodePort(key="table", label="Table", data_types=["table"])],
            ),
        ],
        edges=[
            WorkflowEdge(
                id="e1", source="a", target="b", source_handle="dataset", target_handle="dataset"
            )
        ],
    )
    result = validate_workflow_graph(graph)
    assert result.valid is True


def test_camel_case_port_payload_still_validates() -> None:
    graph = WorkflowGraph.model_validate(
        {
            "nodes": [
                {
                    "id": "source-node",
                    "type": "source.dataset_version",
                    "position": {"x": 0, "y": 0},
                    "params": {"datasetVersionId": "dsv-1"},
                    "inputBindings": {},
                    "outputDefs": [
                        {
                            "key": "dataset",
                            "label": "Dataset Version",
                            "dataTypes": ["dataset_version"],
                        }
                    ],
                },
                {
                    "id": "load-node",
                    "type": "table.load_csv",
                    "position": {"x": 200, "y": 0},
                    "params": {"delimiter": ","},
                    "inputBindings": {"dataset": "source-node:dataset"},
                    "outputDefs": [
                        {
                            "key": "table",
                            "label": "Table",
                            "dataTypes": ["table"],
                        }
                    ],
                },
            ],
            "edges": [
                {
                    "id": "edge-1",
                    "source": "source-node",
                    "target": "load-node",
                    "sourceHandle": "dataset",
                    "targetHandle": "dataset",
                }
            ],
        }
    )

    result = validate_workflow_graph(graph)
    assert result.valid is True


def test_validation_falls_back_to_catalog_output_types() -> None:
    graph = WorkflowGraph.model_validate(
        {
            "nodes": [
                {
                    "id": "source-node",
                    "type": "source.dataset_version",
                    "position": {"x": 0, "y": 0},
                    "params": {"datasetVersionId": "dsv-1"},
                    "inputBindings": {},
                    "outputDefs": [
                        {
                            "key": "dataset",
                            "label": "Dataset Version",
                            "dataTypes": [],
                        }
                    ],
                },
                {
                    "id": "load-node",
                    "type": "table.load_csv",
                    "position": {"x": 200, "y": 0},
                    "params": {"delimiter": ","},
                    "inputBindings": {"dataset": "source-node:dataset"},
                    "outputDefs": [
                        {
                            "key": "table",
                            "label": "Table",
                            "dataTypes": [],
                        }
                    ],
                },
            ],
            "edges": [
                {
                    "id": "edge-1",
                    "source": "source-node",
                    "target": "load-node",
                    "sourceHandle": "dataset",
                    "targetHandle": "dataset",
                }
            ],
        }
    )

    result = validate_workflow_graph(graph)
    assert result.valid is True
