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
                type="source.dataset",
                position={"x": 0, "y": 0},
                params={},
                input_bindings={},
                output_defs=[WorkflowNodePort(key="out", label="Out")],
            ),
            WorkflowNode(
                id="b",
                type="split.grid",
                position={"x": 1, "y": 1},
                params={},
                input_bindings={},
                output_defs=[WorkflowNodePort(key="out", label="Out")],
            ),
        ],
        edges=[
            WorkflowEdge(id="e1", source="a", target="b"),
            WorkflowEdge(id="e2", source="b", target="a"),
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
                type="source.dataset",
                position={"x": 0, "y": 0},
                params={},
                input_bindings={},
                output_defs=[WorkflowNodePort(key="out", label="Out")],
            ),
            WorkflowNode(
                id="b",
                type="split.grid",
                position={"x": 1, "y": 1},
                params={},
                input_bindings={"image": "a:out"},
                output_defs=[WorkflowNodePort(key="tiles", label="Tiles")],
            ),
        ],
        edges=[WorkflowEdge(id="e1", source="a", target="b")],
    )
    result = validate_workflow_graph(graph)
    assert result.valid is True
