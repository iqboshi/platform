"""冬小麦分蘖密度估测流水线：3B-SSCL 掩膜 → MVDINO 结构特征 / 植被指数 → GIDVF 融合回归。

节点接口按论文框架定义。完整模型推理待接入；当前运行时中，掩膜与特征节点直接传递数据，
融合回归节点调用结构感知分析生成预览结果。
"""

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

TILLER_PIPELINE = {
    "research.tiller_3bsscl_mask": "3B-SSCL 作物掩膜提取",
    "research.tiller_mvdino_features": "MVDINO 冠层结构特征",
    "research.tiller_vegetation_indices": "多光谱植被指数特征",
    "research.tiller_gidvf_regression": "GIDVF 融合与分蘖密度回归",
}


def _number(key, label, default, lo, hi, step):
    return WorkflowParamDefinition(
        key=key, label=label, field_type="number", default_value=default, min=lo, max=hi, step=step
    )


def _select(key, label, default, options):
    return WorkflowParamDefinition(
        key=key,
        label=label,
        field_type="select",
        default_value=default,
        options=[WorkflowParamOption(label=a, value=b) for a, b in options],
    )


def _dataset_port(key="dataset", label="多波段影像"):
    return WorkflowNodePort(key=key, label=label, data_types=["dataset_version"], required=True)


def tiller_pipeline_nodes() -> list[WorkflowCatalogItem]:
    common = dict(
        category="inference",
        runtime_kind="inference",
        tags=["research", "wheat", "tiller"],
        supported_tasks=["research_demo"],
    )
    return [
        WorkflowCatalogItem(
            type="research.tiller_3bsscl_mask",
            label=TILLER_PIPELINE["research.tiller_3bsscl_mask"],
            description="三分支自监督对比学习（局部/上下文/物候时序分支）生成作物—背景掩膜，抑制土壤与阴影干扰。",
            inputs=[
                _dataset_port(),
                WorkflowNodePort(key="roi", label="分析区域（可选）", data_types=["roi"]),
            ],
            outputs=[WorkflowNodePort(key="dataset", label="掩膜后影像", data_types=["dataset_version"])],
            params=[
                _select("patchSize", "样本块尺寸", "128",
                        [("64 × 64", "64"), ("128 × 128", "128"), ("256 × 256", "256")]),
                _select("temperature", "对比温度策略", "adaptive",
                        [("自适应温度", "adaptive"), ("固定温度 0.1", "fixed")]),
                _number("clusters", "聚类簇数", 2, 2, 4, 1),
            ],
            **common,
        ),
        WorkflowCatalogItem(
            type="research.tiller_mvdino_features",
            label=TILLER_PIPELINE["research.tiller_mvdino_features"],
            description="多视角自蒸馏（教师全局视图 / 学生局部视图）提取 64 通道冠层结构特征。",
            inputs=[_dataset_port(label="掩膜后影像")],
            outputs=[WorkflowNodePort(key="features", label="结构特征（64 通道）", data_types=["value"])],
            params=[
                _select("backbone", "主干网络", "vit-small", [("ViT-Small", "vit-small"), ("ViT-Tiny", "vit-tiny")]),
                _number("localViews", "局部视图数", 6, 2, 10, 1),
                _number("emaMomentum", "EMA 动量", 0.996, 0.9, 0.9999, 0.001),
            ],
            **common,
        ),
        WorkflowCatalogItem(
            type="research.tiller_vegetation_indices",
            label=TILLER_PIPELINE["research.tiller_vegetation_indices"],
            description="计算 NDVI、GNDVI、NDRE、EVI、CIRE、RDVI、MSR、WDRVI、OSAVI、MCARI 共 10 种植被指数。",
            inputs=[_dataset_port(label="掩膜后影像")],
            outputs=[WorkflowNodePort(key="features", label="植被指数特征（10 种）", data_types=["value"])],
            params=[_number("wdrviAlpha", "WDRVI 系数 α", 0.2, 0.1, 0.3, 0.05)],
            **common,
        ),
        WorkflowCatalogItem(
            type="research.tiller_gidvf_regression",
            label=TILLER_PIPELINE["research.tiller_gidvf_regression"],
            description="SGPA 结构引导对齐 → HOCM 高阶互补 → AWM 自适应加权，回归输出分蘖密度（蘖/m²）。",
            inputs=[
                WorkflowNodePort(key="structure", label="结构特征", data_types=["value"], required=True),
                WorkflowNodePort(key="indices", label="植被指数特征", data_types=["value"], required=True),
                _dataset_port(label="参考影像（地理坐标）"),
            ],
            outputs=[
                WorkflowNodePort(key="artifact", label="分蘖密度 GeoTIFF", data_types=["artifact"]),
                WorkflowNodePort(key="report", label="图像与分区统计", data_types=["value"]),
            ],
            params=[
                _select("modelVersion", "模型版本", "field1-v1",
                        [("试验田1 源域模型", "field1-v1"), ("试验田2 迁移模型（50 标签）", "field2-k50")]),
                _select("fusion", "融合方式", "gidvf",
                        [("GIDVF（SGPA+HOCM+AWM）", "gidvf"), ("特征拼接", "concat")]),
                _number("vegetationThreshold", "植被阈值", 0.25, 0, 0.9, 0.05),
                _number("structureWeight", "结构／光谱融合权重", 0.55, 0, 1, 0.05),
                _select("analysisSize", "分析分辨率", "512", [("快速 · 512", "512"), ("精细 · 1024", "1024")]),
            ],
            **common,
        ),
    ]


def tiller_pipeline_template() -> WorkflowTemplateDefinition:
    def node(node_id, node_type, x, y, params=None, bindings=None):
        return WorkflowNode(id=node_id, type=node_type, position={"x": x, "y": y},
                            params=params or {}, input_bindings=bindings or {})

    def edge(edge_id, source, source_handle, target, target_handle):
        return WorkflowEdge(id=edge_id, source=source, target=target,
                            source_handle=source_handle, target_handle=target_handle)

    nodes = [
        node("input", "source.dataset_version", 40, 180, {"datasetVersionId": "research-stage-4-v1"}),
        node("mask", "research.tiller_3bsscl_mask", 420, 180,
             {"patchSize": "128", "temperature": "adaptive", "clusters": 2},
             {"dataset": "input:dataset"}),
        node("mvdino", "research.tiller_mvdino_features", 800, 20,
             {"backbone": "vit-small", "localViews": 6, "emaMomentum": 0.996},
             {"dataset": "mask:dataset"}),
        node("indices", "research.tiller_vegetation_indices", 800, 360,
             {"wdrviAlpha": 0.2}, {"dataset": "mask:dataset"}),
        node("gidvf", "research.tiller_gidvf_regression", 1180, 180,
             {"modelVersion": "field1-v1", "fusion": "gidvf", "vegetationThreshold": 0.25,
              "structureWeight": 0.55, "analysisSize": "512"},
             {"structure": "mvdino:features", "indices": "indices:features", "dataset": "mask:dataset"}),
        node("save", "export.artifact_to_dataset_version", 1560, 180,
             {"outputDatasetName": "冬小麦分蘖密度分布图"}, {"artifact": "gidvf:artifact"}),
    ]
    edges = [
        edge("e1", "input", "dataset", "mask", "dataset"),
        edge("e2", "mask", "dataset", "mvdino", "dataset"),
        edge("e3", "mask", "dataset", "indices", "dataset"),
        edge("e4", "mvdino", "features", "gidvf", "structure"),
        edge("e5", "indices", "features", "gidvf", "indices"),
        edge("e6", "mask", "dataset", "gidvf", "dataset"),
        edge("e7", "gidvf", "artifact", "save", "artifact"),
    ]
    return WorkflowTemplateDefinition(
        id="research.tiller_pipeline",
        label="科研成果 · 冬小麦分蘖密度估测（3B-SSCL＋MVDINO＋GIDVF）",
        description="多波段无人机影像 → 作物掩膜 → 结构特征与植被指数 → 引导融合回归 → 分蘖密度分布图。",
        tags=["research", "wheat", "tiller"],
        supported_tasks=["research_demo"],
        graph=WorkflowGraph(nodes=nodes, edges=edges),
    )
