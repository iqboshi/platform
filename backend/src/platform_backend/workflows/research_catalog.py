"""Research demonstration nodes using ordinary dataset and artifact ports."""

from platform_backend.schemas.workflow import (
    WorkflowCatalogItem,
    WorkflowEdge,
    WorkflowGraph,
    WorkflowNode,
    WorkflowNodePort,
    WorkflowParamDefinition,
    WorkflowParamOption,
    WorkflowTemplateDefinition,
)

STAGE_DATES = ["2024-10-06", "2024-12-05", "2025-03-08", "2025-03-25"]
METHODS = {
    "research.structure_tiller": "结构感知分蘖分析",
    "research.spectral_transfer": "光谱模拟与迁移融合",
    "research.carbon_potential": "农田碳交换潜势演示",
}


def research_nodes():
    result = []
    for node_type, label in METHODS.items():
        inputs = [
            WorkflowNodePort(
                key="dataset", label="多波段影像", data_types=["dataset_version"], required=True
            )
        ]
        if node_type == "research.carbon_potential":
            inputs += [
                WorkflowNodePort(key=f"stage{i}", label=f"阶段 {i}", data_types=["dataset_version"])
                for i in range(2, 5)
            ]
        inputs += [WorkflowNodePort(key="roi", label="分析区域（可选）", data_types=["roi"])]
        result.append(
            WorkflowCatalogItem(
                type=node_type,
                label=label,
                category="inference",
                runtime_kind="inference",
                description="真实影像驱动的简化演示；输出为相对指数，不代表论文模型推理或实测值。",
                tags=["research", "demo", "wheat"],
                supported_tasks=["research_demo"],
                inputs=inputs,
                outputs=[
                    WorkflowNodePort(key="artifact", label="结果 GeoTIFF", data_types=["artifact"]),
                    WorkflowNodePort(key="report", label="图像与阶段分析", data_types=["value"]),
                ],
                params=[
                    WorkflowParamDefinition(
                        key="vegetationThreshold",
                        label="植被阈值",
                        field_type="number",
                        default_value=0.25,
                        min=0,
                        max=0.9,
                        step=0.05,
                    ),
                    WorkflowParamDefinition(
                        key="structureWeight",
                        label="结构／光谱融合权重",
                        field_type="number",
                        default_value=0.55,
                        min=0,
                        max=1,
                        step=0.05,
                    ),
                    WorkflowParamDefinition(
                        key="analysisSize",
                        label="分析分辨率",
                        field_type="select",
                        default_value="512",
                        options=[
                            WorkflowParamOption(label="快速 · 512", value="512"),
                            WorkflowParamOption(label="精细 · 1024", value="1024"),
                        ],
                    ),
                ],
            )
        )
        if node_type == "research.carbon_potential":
            result[-1].params = [p for p in result[-1].params if p.key != "structureWeight"]
    return result


def research_templates():
    templates = []
    for method, label in METHODS.items():
        count = 4 if method == "research.carbon_potential" else 1
        nodes = [
            WorkflowNode(
                id=f"stage{i + 1}",
                type="source.dataset_version",
                position={"x": 40, "y": 60 + i * 170},
                params={"datasetVersionId": f"research-stage-{i + 1 if count == 4 else 4}-v1"},
            )
            for i in range(count)
        ]
        bindings = {
            ("dataset" if i == 0 else f"stage{i + 1}"): f"stage{i + 1}:dataset"
            for i in range(count)
        }
        nodes += [
            WorkflowNode(
                id="method",
                type=method,
                position={"x": 440, "y": 150},
                params={
                    "vegetationThreshold": 0.25,
                    **({"structureWeight": 0.55} if count == 1 else {}),
                    "analysisSize": "512",
                },
                input_bindings=bindings,
            ),
            WorkflowNode(
                id="save",
                type="export.artifact_to_dataset_version",
                position={"x": 840, "y": 150},
                params={"outputDatasetName": label + "结果"},
                input_bindings={"artifact": "method:artifact"},
            ),
        ]
        edges = [
            WorkflowEdge(
                id=f"input-{i}",
                source=f"stage{i + 1}",
                target="method",
                source_handle="dataset",
                target_handle="dataset" if i == 0 else f"stage{i + 1}",
            )
            for i in range(count)
        ]
        edges.append(
            WorkflowEdge(
                id="result",
                source="method",
                target="save",
                source_handle="artifact",
                target_handle="artifact",
            )
        )
        templates.append(
            WorkflowTemplateDefinition(
                id=method,
                label="科研成果 · " + label,
                description="选择真实阶段影像 → 运行方法节点 → 预览 → 保存并送往空间工作台。",
                tags=["research", "demo"],
                supported_tasks=["research_demo"],
                graph=WorkflowGraph(nodes=nodes, edges=edges),
            )
        )
    return templates
