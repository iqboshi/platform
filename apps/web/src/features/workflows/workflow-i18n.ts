import type {
  LocaleCode,
  WorkflowNodeCatalogItem,
  WorkflowParamDefinition,
  WorkflowPortContract,
  WorkflowTemplateDefinition,
  WorkflowValidationIssue,
} from '@platform/types';

const DATASET_VERSION_KEY = 'Dataset Version';

const ZH_TEXT: Record<string, string> = {
  'Dataset Version': '数据集版本',
  'Sentinel-2 GEE Download': 'Sentinel-2 GEE 下载',
  'GEE NEE Map Export': 'GEE NEE 空间分布导出',
  'GEE NEE Point Time Series Export': 'GEE NEE 点位时间序列导出',
  'Model Version': '模型版本',
  'Define BBox ROI': '定义 BBox ROI',
  'Load Saved ROI': '加载已保存 ROI',
  'Query Raster Collection': '查询栅格集合',
  'Filter Scene Collection': '过滤场景集合',
  'Sort Scene Collection': '场景集合排序',
  'Select Scene': '选择场景',
  'Fetch Scene As Dataset': '获取场景为数据集',
  'Load Geo Raster': '加载地理栅格',
  'Load Mask Raster': '加载掩膜栅格',
  'Load Image Collection': '加载图像集合',
  'Load Features': '加载要素',
  'Load Mask Collection': '加载掩膜集合',
  'Clip Raster By ROI': '按 ROI 裁剪栅格',
  'Reproject Raster': '栅格重投影',
  'Merge Rasters': '合并栅格',
  'Sample Raster Metadata': '采样栅格元数据',
  'Patchify Raster': '栅格切块',
  'Patchify Image Collection': '图像集合切块',
  'Rasterize Features To Tiles': '要素栅格化到切片',
  'Reproject Mask Raster To Tiles': '掩膜栅格重投影到切片',
  'Crop Mask Collection To Tiles': '裁剪掩膜集合到切片',
  'Filter Labels By Coverage': '按覆盖率过滤标签',
  'Project Features To Tile Classes': '要素映射为切片类别',
  'Project Features To Tile BBoxes': '要素映射为切片框',
  'Project Features To Tile Polygons': '要素映射为切片多边形',
  'Build Samples': '构建样本集',
  'Split Samples': '拆分样本集',
  'Build Manifest': '构建清单',
  'Package Dataset Bundle': '打包数据集包',
  'Artifact To Dataset Version': '工件转数据集版本',
  'Prediction Set To Dataset Version': '预测集转数据集版本',
  'Boolean Literal': '布尔字面量',
  'List Literal': '列表字面量',
  'Compare Values': '比较值',
  'Boolean Not': '布尔非',
  'Guard Payload': '条件放行载荷',
  'Coalesce Payload': '合并载荷',
  'Call Subgraph': '调用子流程',
  'For Each': '逐项循环',
  'Subgraph Input': '子流程输入',
  'Subgraph Output': '子流程输出',
  'Load CSV Table': '加载 CSV 表',
  'Train/Test Split': '训练/测试拆分',
  'Train Regression Model': '训练回归模型',
  'Linear Regression Train': '线性回归训练',
  'SVM Regression Train': 'SVM 回归训练',
  'Random Forest Regression Train': '随机森林回归训练',
  'Predict Model': '模型预测',
  'Linear Regression Predict': '线性回归预测',
  'SVM Regression Predict': 'SVM 回归预测',
  'Random Forest Regression Predict': '随机森林回归预测',
  'Custom API Predict': '自定义 API 预测',
  'Custom API Train Samples': '自定义 API 训练样本',
  'Custom API Predict Samples': '自定义 API 样本预测',
  'Regression Validation': '回归验证',
  'Save Trained Model': '保存训练模型',
  'Export Table': '导出表',
  'Export Metrics': '导出指标',
  'Select a dataset version and expose it as a workflow input handle.': '选择一个数据集版本，并将其暴露为工作流输入句柄。',
  'Query and download a Sentinel-2 scene directly from Google Earth Engine into a raster dataset version.':
    '直接从 Google Earth Engine 查询并下载 Sentinel-2 场景，生成一个栅格数据集版本。',
  'Estimate farmland NEE over an ROI in Google Earth Engine and export the result as a raster dataset version.':
    '在 Google Earth Engine 中估算 ROI 范围内农田 NEE，并将结果导出为栅格数据集版本。',
  'Evaluate a point-based NEE time series in Google Earth Engine and export the result as a CSV dataset version.':
    '在 Google Earth Engine 中计算点位 NEE 时间序列，并将结果导出为 CSV 数据集版本。',
  'Select a saved model version and expose it as a workflow input handle.': '选择一个已保存模型版本，并将其暴露为工作流输入句柄。',
  'Define an EPSG:4326 bounding box ROI inside the workflow.': '在工作流内定义一个 EPSG:4326 的边界框 ROI。',
  'Load a saved ROI asset and expose it as a workflow ROI object.': '加载一个已保存的 ROI 资产，并将其暴露为工作流 ROI 对象。',
  'Query a provider collection over an ROI and materialize a scene collection.': '在 ROI 上查询提供方数据集合，并生成一个场景集合。',
  'Filter a scene collection with JSON comparison rules.': '使用 JSON 比较规则过滤场景集合。',
  'Sort a scene collection by a metadata field.': '按元数据字段对场景集合排序。',
  'Select one scene from an ordered scene collection.': '从有序场景集合中选择一个场景。',
  'Fetch a selected scene and persist it as a raster dataset version.': '获取选中的场景，并将其持久化为栅格数据集版本。',
  'Decode a raster dataset version as a geospatial raster object.': '将栅格数据集版本解码为地理栅格对象。',
  'Decode a raster dataset version as a mask raster object.': '将栅格数据集版本解码为掩膜栅格对象。',
  'Decode a dataset version as a normal image file or image collection.': '将数据集版本解码为普通图像文件或图像集合。',
  'Decode a vector dataset version as a feature collection.': '将矢量数据集版本解码为要素集合。',
  'Decode a dataset version as a normal mask image collection.': '将数据集版本解码为普通掩膜图像集合。',
  'Clip a geospatial raster with a workflow ROI.': '使用工作流 ROI 裁剪地理栅格。',
  'Reproject a geospatial raster to a target CRS and optional resolution.': '将地理栅格重投影到目标 CRS，并可选指定分辨率。',
  'Merge two geospatial rasters into one raster mosaic.': '将两个地理栅格合并成一个镶嵌栅格。',
  'Export a raster metadata summary as a JSON artifact.': '将栅格元数据摘要导出为 JSON 工件。',
  'Cut a geospatial raster into RGB image tiles.': '将地理栅格切分为 RGB 图像切片。',
  'Cut a normal image or image collection into RGB image tiles.': '将普通图像或图像集合切分为 RGB 图像切片。',
  'Rasterize a feature collection onto an RGB tile grid.': '将要素集合栅格化到 RGB 切片网格上。',
  'Reproject a geospatial mask raster onto an RGB tile grid.': '将地理掩膜栅格重投影到 RGB 切片网格上。',
  'Crop a normal mask image collection onto an RGB tile grid.': '将普通掩膜图像集合裁剪到 RGB 切片网格上。',
  'Filter aligned labels by empty-mask and coverage thresholds.': '按空标签和覆盖率阈值过滤已对齐标签。',
  'Project feature properties onto a tile grid as one class-label annotation per tile.':
    '将要素属性投影到切片网格上，为每个切片生成一个类别标注。',
  'Project vector features onto a tile grid as bounding-box annotations.': '将矢量要素投影到切片网格上，生成框标注。',
  'Project vector features onto a tile grid as polygon annotations.': '将矢量要素投影到切片网格上，生成多边形标注。',
  'Bind RGB tiles with optional aligned labels into a sample set.': '将 RGB 切片与可选的对齐标签绑定为样本集。',
  'Split a sample set into train, validation, and test sample sets.': '将样本集拆分为训练、验证和测试样本集。',
  'Export a sample set manifest without packaging the dataset files.': '导出样本集清单，而不打包数据集文件。',
  'Package sample files into a dataset bundle zip with optional split groups and manifest.':
    '将样本文件连同可选的拆分分组和清单打包成数据集 zip 包。',
  'Persist an artifact file as a private dataset version.': '将工件文件持久化为私有数据集版本。',
  'Persist a prediction set as a private dataset version artifact.': '将预测集持久化为私有数据集版本工件。',
  'Emit a boolean control value.': '输出一个布尔控制值。',
  'Emit an ordered list of structured values from JSON.': '从 JSON 输出一个有序的结构化值列表。',
  'Compare two values and emit a boolean result.': '比较两个值并输出布尔结果。',
  'Invert a boolean control value.': '反转一个布尔控制值。',
  'Pass a payload through only when the boolean condition is true; otherwise skip the branch.':
    '仅当布尔条件为真时放行载荷，否则跳过该分支。',
  'Return the first active payload, allowing branches to merge back into one downstream path.':
    '返回第一个有效载荷，使多个分支重新汇合到同一下游路径。',
  'Execute a nested acyclic subgraph whose external interface is declared by subgraph boundary nodes.':
    '执行一个嵌套的无环子流程，其外部接口由子流程边界节点声明。',
  'Execute a nested acyclic loop body once for each item in an ordered list and aggregate each body output into a value_list.':
    '对有序列表中的每一项执行一次嵌套的无环循环体，并将每次输出聚合为 value_list。',
  'Declare one external input port for a nested subgraph and expose it inside the subgraph body.':
    '为嵌套子流程声明一个外部输入端口，并在子流程内部暴露出来。',
  'Declare one external output port for a nested subgraph and bind it to an internal upstream value.':
    '为嵌套子流程声明一个外部输出端口，并将其绑定到内部上游值。',
  'Decode a CSV dataset version into an in-memory table.': '将 CSV 数据集版本解码为内存表。',
  'Split a table into train and test tables.': '将一张表拆分为训练表和测试表。',
  'Train a regression model with a chosen algorithm from a table.': '从表数据中使用指定算法训练一个回归模型。',
  'Convenience alias for the generic regression training node with algorithm-specific parameters.':
    '通用回归训练节点的便捷别名，带有算法特定参数。',
  'Run a saved tabular model against a table and append predictions.': '对表数据运行已保存的表格模型，并追加预测结果。',
  'Convenience alias for the generic regression prediction node with algorithm-specific defaults.':
    '通用回归预测节点的便捷别名，带有算法特定默认值。',
  'Send a table to an external HTTP API model and merge the prediction result back.':
    '将表数据发送到外部 HTTP API 模型，并合并返回的预测结果。',
  'Send training samples to an external HTTP API and persist the returned model as a reusable custom API model version.':
    '将训练样本发送到外部 HTTP API，并将返回模型持久化为可复用的自定义 API 模型版本。',
  'Send a sample set to an external HTTP API model and return a prediction set.':
    '将样本集发送到外部 HTTP API 模型，并返回预测集。',
  'Compare prediction and ground-truth tables and compute regression metrics.': '比较预测表和真值表，并计算回归指标。',
  'Persist a trained model into private model assets.': '将训练后的模型持久化到私有模型资产中。',
  'Write the current table to CSV and optionally persist it back to the platform.': '将当前表写出为 CSV，并可选保存回平台。',
  'Write a metrics report to JSON or CSV and optionally persist it back to the platform.':
    '将指标报告写出为 JSON 或 CSV，并可选保存回平台。',
  'Sentinel-2 Single Scene Download': 'Sentinel-2 单场景下载',
  'Query And Fetch Scene': '查询并获取场景',
  'Geo Raster Samples With Vector Labels': '带矢量标签的地理栅格样本',
  'Image Collection Patch Dataset': '图像集合切块数据集',
  'Image Classification Samples From Features': '基于要素的图像分类样本',
  'Instance Polygon Samples From Features': '基于要素的实例多边形样本',
  'Custom API Semantic Segmentation Train And Predict': '自定义 API 语义分割训练与预测',
  'Conditional Table Source': '条件表数据源',
  'Subgraph Table Gate': '子流程表分支门',
  'For Each Collect Values': '逐项循环收集值',
  'If Else Table Subgraphs': 'If Else 表子流程',
  'If Else Sample Prediction Subgraphs': 'If Else 样本预测子流程',
  'Linear Regression Training': '线性回归训练',
  'Linear Regression Prediction': '线性回归预测',
  'SVM Regression Prediction': 'SVM 回归预测',
  'Random Forest Prediction': '随机森林预测',
  'Custom API Prediction': '自定义 API 预测',
  'Tabular Train And Validate': '表格训练与验证',
  'Download a Sentinel-2 scene into a private raster dataset version.': '将 Sentinel-2 场景下载为私有栅格数据集版本。',
  'Define an ROI, query a raster collection, select a scene, and fetch it as a dataset.':
    '定义一个 ROI，查询栅格集合，选择场景，并将其获取为数据集。',
  'Load a geo raster and vector labels, patchify them, split samples, and package a dataset bundle.':
    '加载地理栅格和矢量标签，切块、拆分样本，并打包为数据集包。',
  'Load normal RGB images, cut them into tiles, and package them as a dataset bundle.':
    '加载普通 RGB 图像，切分为切片，并打包为数据集包。',
  'Load RGB images, patchify them, project feature class labels to tiles, and package a classification sample dataset.':
    '加载 RGB 图像并切块，将要素类别标签投影到切片上，并打包为分类样本数据集。',
  'Load RGB images, patchify them, project feature polygons to tiles, and package an instance-segmentation sample dataset.':
    '加载 RGB 图像并切块，将要素多边形投影到切片上，并打包为实例分割样本数据集。',
  'Build segmentation samples, train a reusable custom API model, then run prediction on a separate raster dataset and export the predictions.':
    '构建分割样本，训练一个可复用的自定义 API 模型，然后在另一份栅格数据集上执行预测并导出结果。',
  'Use compare, not, guard, and coalesce primitives to choose one of two table datasets before loading and exporting the selected table.':
    '使用 compare、not、guard 和 coalesce 原子节点在两个表数据集之间做选择，再加载并导出选中的表。',
  'Wrap a guarded dataset branch inside workflow.call_subgraph, then load and export the selected table through the derived subgraph interface.':
    '将受保护的数据集分支封装进 workflow.call_subgraph，再通过导出的子流程接口加载并导出选中的表。',
  'Iterate over a JSON value list with control.for_each and inspect the aggregated item and index outputs from the loop body.':
    '使用 control.for_each 遍历 JSON 值列表，并查看循环体聚合后的 item 与 index 输出。',
  'Use two workflow.call_subgraph branches to model a strict if/else table selection before loading and exporting the chosen table.':
    '使用两个 workflow.call_subgraph 分支建模严格的 if/else 表选择，再加载并导出选中的表。',
  'Choose between two raster-to-prediction subgraphs, then merge the selected exported prediction dataset handle.':
    '在两个“栅格到预测”的子流程之间做选择，再合并被选中的已导出预测数据集句柄。',
  'Load a CSV table, split it, train a linear regression model, and save the trained model.':
    '加载 CSV 表，拆分数据，训练线性回归模型，并保存训练后的模型。',
  'Load a CSV table, run a linear regression model, and export prediction output.':
    '加载 CSV 表，运行线性回归模型，并导出预测结果。',
  'Load a CSV table, run an SVM regression model, and export prediction output.':
    '加载 CSV 表，运行 SVM 回归模型，并导出预测结果。',
  'Load a CSV table, run a random forest regression model, and export prediction output.':
    '加载 CSV 表，运行随机森林回归模型，并导出预测结果。',
  'Load prediction and ground-truth CSV tables, compute regression metrics, and export the report.':
    '加载预测 CSV 表和真值 CSV 表，计算回归指标，并导出报告。',
  'Load a CSV table, call a custom API model, and export prediction output.':
    '加载 CSV 表，调用自定义 API 模型，并导出预测结果。',
  'Load a CSV table, split it, train a regression model, validate, and export outputs.':
    '加载 CSV 表，拆分数据，训练回归模型，执行验证，并导出输出。',
  Annotations: '标注',
  Artifact: '工件',
  'Custom Model': '自定义模型',
  [DATASET_VERSION_KEY.toString()]: '数据集版本',
  Enabled: '启用',
  'Fallback Payload': '回退载荷',
  'Feature Collection': '要素集合',
  'Geo Raster': '地理栅格',
  'Ground Truth Table': '真值表',
  'Image Collection': '图像集合',
  'Input Table': '输入表',
  Items: '项目列表',
  'Label Set': '标签集',
  'Labels Or Annotations': '标签或标注',
  'Left Value': '左值',
  Manifest: '清单',
  'Mask Collection': '掩膜集合',
  'Mask Raster': '掩膜栅格',
  'Metrics Input': '指标输入',
  'Metrics Report': '指标报告',
  Payload: '载荷',
  'Prediction Set': '预测集',
  'Prediction Table': '预测表',
  'Primary Payload': '主载荷',
  'Primary Raster': '主栅格',
  Result: '结果',
  'Right Value': '右值',
  'Sample Set': '样本集',
  Scene: '场景',
  'Scene Collection': '场景集合',
  'Secondary Raster': '次栅格',
  Table: '表',
  'Table Input': '表输入',
  'Test Samples': '测试样本',
  'Test Table': '测试表',
  'Tile Set': '切片集',
  'Train Samples': '训练样本',
  'Train Table': '训练表',
  'Trained Model': '训练模型',
  'Training Metrics': '训练指标',
  'Val Samples': '验证样本',
  'Validation Samples': '验证样本',
  Value: '值',
  Algorithm: '算法',
  'Archive Name': '归档名称',
  'Auth Header Name': '认证头名称',
  'Auth Token': '认证令牌',
  'Auth Type': '认证类型',
  BBox: 'BBox',
  Band: '波段',
  Bands: '波段',
  'Buffer Meters': '缓冲距离（米）',
  C: 'C',
  'Cache Size': '缓存大小',
  'Call Parameters JSON': '调用参数 JSON',
  'Class Property': '类别属性',
  'Clip Max': '裁剪上限',
  'Clip Min': '裁剪下限',
  Collection: '集合',
  'Credential Mode': '凭据模式',
  'China Training Asset ID': '中国训练资产 ID',
  'Corn Training Asset ID': '玉米训练资产 ID',
  'Cropland Mask Asset ID': '耕地掩膜资产 ID',
  'Default Prediction Column': '默认预测列',
  Delimiter: '分隔符',
  'Edge Policy': '边界策略',
  'End Date': '结束日期',
  Epsilon: 'Epsilon',
  'Feature Columns': '特征列',
  Field: '字段',
  'Filters JSON': '过滤条件 JSON',
  'Fit Intercept': '拟合截距',
  Format: '格式',
  Gamma: 'Gamma',
  'Ground Truth Column': '真值列',
  'Hyperparameters JSON': '超参数 JSON',
  Index: '索引',
  'Items JSON': '项目 JSON',
  Kernel: '核函数',
  Latitude: '纬度',
  Limit: '限制数量',
  Longitude: '经度',
  'Max Cloud Cover': '最大云量',
  'Max Depth': '最大深度',
  Metrics: '指标',
  'Min Label Coverage': '最小标签覆盖率',
  'Min Samples Leaf': '最小叶子样本数',
  'Min Samples Split': '最小拆分样本数',
  'N Estimators': '树数量',
  'N Jobs': '并行任务数',
  Operator: '运算符',
  Order: '排序',
  'Output Dataset Name': '输出数据集名称',
  'Output Image Format': '输出图像格式',
  'Output Mask Format': '输出掩膜格式',
  'Output Model Name': '输出模型名称',
  'Output Model Version': '输出模型版本',
  'Personal Credential': '个人凭据',
  'Positive Coefficients': '正系数约束',
  'Prediction Column': '预测列',
  'Prediction Endpoint URL': '预测接口 URL',
  Provider: '提供方',
  'ROI Mode': 'ROI 模式',
  'Random Seed': '随机种子',
  'Random State': '随机状态',
  Resampling: '重采样方式',
  Resolution: '分辨率',
  'Response Mode': '响应模式',
  'Right Value JSON': '右值 JSON',
  'Round Digits': '保留位数',
  'Runtime Parameters JSON': '运行参数 JSON',
  'Save To Platform': '保存到平台',
  'Saved ROI': '已保存 ROI',
  Scale: '尺度',
  'Scale Meters': '分辨率（米）',
  Satellite: '卫星',
  'Selection Mode': '选择模式',
  Shuffle: '打乱',
  'Skip Empty Label': '跳过空标签',
  'Start Date': '开始日期',
  Strategy: '策略',
  'Stride X': '步长 X',
  'Stride Y': '步长 Y',
  'Target CRS': '目标 CRS',
  'Target Column': '目标列',
  'Task Type': '任务类型',
  'Test Ratio': '测试比例',
  'Test Size': '测试集比例',
  'Tile Height': '切片高度',
  'Tile Width': '切片宽度',
  'Timeout Seconds': '超时秒数',
  'Train Ratio': '训练比例',
  'Training Preset': '训练预设',
  'Training Endpoint URL': '训练接口 URL',
  'Val Ratio': '验证比例',
  'Wheat Training Asset ID': '小麦训练资产 ID',
  Comma: '逗号',
  Semicolon: '分号',
  Tab: '制表符',
  'Skip Partial': '跳过残片',
  'Pad Partial': '填充残片',
  'Linear Regression': '线性回归',
  'SVM Regression': 'SVM 回归',
  'Random Forest Regression': '随机森林回归',
  Linear: '线性',
  Polynomial: '多项式',
  JSON: 'JSON',
  CSV: 'CSV',
  'Image Classification': '图像分类',
  'Semantic Segmentation': '语义分割',
  'Instance Segmentation': '实例分割',
  'Object Detection': '目标检测',
  Dataset: '数据集',
  Raster: '栅格',
  Vector: '矢量',
  Tiles: '切片',
  Labels: '标签',
  Predictions: '预测',
  Samples: '样本',
  Mask: '掩膜',
  'Value List': '值列表',
  'Pred Vector': '预测矢量',
  'Loop body': '循环体',
  'Loop Body': '循环体',
  'Nested flow': '嵌套流程',
  'Nested node': '嵌套节点',
  Node: '节点',
  Loop: '循环',
  Subgraph: '子流程',
  Subflow: '子流程',
  'Boundary input': '边界输入',
  'Boundary output': '边界输出',
  'Boundary Input': '边界输入',
  'Boundary Output': '边界输出',
  'Scoped interface': '作用域接口',
  'Double-click to open': '双击打开',
  'Nested steps': '嵌套步骤',
  'Nested flow preview': '嵌套流程预览',
  'Drop node here': '拖到这里',
  'Drag nodes here to build the nested flow.': '将节点拖到这里以构建嵌套流程。',
  'Drag from library or from the parent canvas': '可从节点库或父画布拖入',
  'Expose parent input': '暴露父级输入',
  'Return child output': '返回子流程输出',
  'Entry port': '入口端口',
  'Exit port': '出口端口',
  'Boundary Interface': '边界接口',
  'Port Key': '端口键',
  Label: '标签',
  Required: '必需',
  'Require this port to be bound before execution.': '执行前必须绑定该端口。',
  'Contract summary': '契约摘要',
  'Open Loop Body Editor': '打开循环体编辑器',
  'Open Subgraph Editor': '打开子流程编辑器',
  'Parent Graph': '父级画布',
  'Release to move selected nested nodes back to the parent graph': '松开即可把选中的嵌套节点移回父级画布',
  'Drag selected nested nodes here to move them back to the parent graph':
    '将选中的嵌套节点拖到这里以移回父级画布',
  'Click to add to the current graph, or drag onto the canvas or a nested node body to place it.':
    '点击可直接加入当前流程，也可以拖到画布或结构节点内部放置。',
  'Subgraph Editor': '子流程编辑器',
  Input: '输入',
  Output: '输出',
  On: '开',
  Off: '关',
  rows: '行',
  columns: '列',
  metrics: '指标',
  features: '特征',
  table: '表',
  json: 'JSON',
  text: '文本',
  error: '错误',
  warning: '警告',
  image_tile: '图像切片',
  geospatial_tile: '地理切片',
  class_label: '类别标签',
  bbox: '边界框',
  polygon: '多边形',
  mask: '掩膜',
  boolean: '布尔值',
  array: '数组',
  image_classification: '图像分类',
  semantic_segmentation: '语义分割',
  instance_segmentation: '实例分割',
  object_detection: '目标检测',
  dataset_version: '数据集版本',
  model_version: '模型版本',
  model_ref: '模型引用',
  metrics_report: '指标报告',
  artifact_file: '工件文件',
  sample_set: '样本集',
  prediction_set: '预测集',
  annotation_set: '标注集',
  label_set: '标签集',
  feature_collection: '要素集合',
  image_collection: '图像集合',
  geo_raster: '地理栅格',
  mask_raster: '掩膜栅格',
  mask_collection: '掩膜集合',
  scene_collection: '场景集合',
  tile_set: '切片集',
  prediction_mask: '预测掩膜',
  prediction_vector: '预测矢量',
  value_list: '值列表',
  'Labeled sample set matching the configured training task semantics.': '符合当前训练任务语义的已标注样本集。',
  'Optional labeled sample set matching the configured training task semantics.':
    '符合当前训练任务语义的可选已标注样本集。',
  'Prediction table containing the configured prediction column.': '包含已配置预测列的预测表。',
  'Ground-truth table containing the configured target column.': '包含已配置目标列的真值表。',
  'Sample set built from an RGB tile grid and optional aligned annotations.':
    '由 RGB 切片网格和可选对齐标注构成的样本集。',
  'Training sample split preserving upstream sample semantics.': '保留上游样本语义的训练样本切分。',
  'Validation sample split preserving upstream sample semantics.': '保留上游样本语义的验证样本切分。',
  'Test sample split preserving upstream sample semantics.': '保留上游样本语义的测试样本切分。',
  'Prediction set preserving the upstream sample grid and task semantics.':
    '保留上游样本网格与任务语义的预测集。',
  'In-memory table decoded from the bound CSV dataset version.': '从已绑定 CSV 数据集版本解码得到的内存表。',
  'Training table split preserving the upstream table schema.': '保留上游表结构的训练表切分。',
  'Test table split preserving the upstream table schema.': '保留上游表结构的测试表切分。',
  'Prediction table preserving upstream columns and appending the configured prediction column.':
    '保留上游列并追加已配置预测列的预测表。',
  'Choose a compatible dataset version or reconnect this input to a compatible upstream node.':
    '请选择兼容的数据集版本，或将该输入重新连接到兼容的上游节点。',
  'Replace the upstream node or insert a compatible transform before this input.':
    '请替换上游节点，或在该输入前插入兼容的转换节点。',
  'A nested subgraph is required.': '必须提供一个嵌套子流程。',
  'A model input or modelVersionId is required.': '必须提供模型输入或 modelVersionId。',
  'itemsJson must be valid JSON.': 'itemsJson 必须是有效的 JSON。',
  'rightValueJson must be valid JSON.': 'rightValueJson 必须是有效的 JSON。',
  'Boundary nodes must stay inside the nested flow.': '边界节点必须保留在嵌套流程内部。',
  'Boundary nodes were kept inside the nested flow.': '边界节点已保留在嵌套流程内部。',
};

function translatePattern(locale: LocaleCode, value: string): string {
  if (locale !== 'zh-CN') {
    return value;
  }

  const requiredMatch = value.match(/^(.+) is required\.$/);
  if (requiredMatch) {
    return `${localizeWorkflowText(locale, requiredMatch[1]) ?? requiredMatch[1]}为必填项。`;
  }

  const missingMatch = value.match(/^(.+) does not exist\.$/);
  if (missingMatch) {
    return `${localizeWorkflowText(locale, missingMatch[1]) ?? missingMatch[1]}不存在。`;
  }

  const jsonMatch = value.match(/^(.+) must be valid JSON\.$/);
  if (jsonMatch) {
    return `${localizeWorkflowText(locale, jsonMatch[1]) ?? jsonMatch[1]}必须是有效的 JSON。`;
  }

  const positiveNumberMatch = value.match(/^(.+) must be a positive number\.$/);
  if (positiveNumberMatch) {
    return `${localizeWorkflowText(locale, positiveNumberMatch[1]) ?? positiveNumberMatch[1]}必须为正数。`;
  }

  const incompatibleMatch = value.match(/^(.+) is connected to an incompatible output type\.$/);
  if (incompatibleMatch) {
    return `${localizeWorkflowText(locale, incompatibleMatch[1]) ?? incompatibleMatch[1]}连接到了不兼容的输出类型。`;
  }

  const expectsMatch = value.match(/^(.+) expects (.+)\.$/);
  if (expectsMatch) {
    return `${localizeWorkflowText(locale, expectsMatch[1]) ?? expectsMatch[1]}需要${localizeWorkflowText(locale, expectsMatch[2]) ?? expectsMatch[2]}。`;
  }

  const movedNodeMatch = value.match(/^(\d+) nodes? moved to parent graph$/);
  if (movedNodeMatch) {
    return `${movedNodeMatch[1]} 个节点已移回父级画布。`;
  }

  return value;
}

export function localizeWorkflowText(
  locale: LocaleCode,
  value: string | undefined | null,
): string | undefined {
  if (!value) {
    return value ?? undefined;
  }
  if (locale !== 'zh-CN') {
    return value;
  }
  return ZH_TEXT[value] ?? translatePattern(locale, value);
}

function t(locale: LocaleCode, value: string | undefined | null): string | undefined {
  return localizeWorkflowText(locale, value);
}

export function localizeWorkflowContract(
  locale: LocaleCode,
  contract: WorkflowPortContract,
): WorkflowPortContract {
  return {
    ...contract,
    summary: t(locale, contract.summary) ?? contract.summary,
    notes: (contract.notes ?? []).map((note) => t(locale, note) ?? note),
  };
}

export function localizeWorkflowIssue(
  locale: LocaleCode,
  issue: WorkflowValidationIssue,
): WorkflowValidationIssue {
  return {
    ...issue,
    message: t(locale, issue.message) ?? issue.message,
    suggestion: t(locale, issue.suggestion),
    expected: t(locale, issue.expected),
    actual: t(locale, issue.actual),
  };
}

function localizeParam(locale: LocaleCode, param: WorkflowParamDefinition): WorkflowParamDefinition {
  return {
    ...param,
    label: t(locale, param.label) ?? param.label,
    description: t(locale, param.description),
    placeholder: t(locale, param.placeholder),
    options: (param.options ?? []).map((option) => ({
      ...option,
      label: t(locale, option.label) ?? option.label,
    })),
  };
}

export function localizeWorkflowCatalog(
  locale: LocaleCode,
  catalog: WorkflowNodeCatalogItem[],
): WorkflowNodeCatalogItem[] {
  if (locale !== 'zh-CN') {
    return catalog;
  }

  return catalog.map((item) => ({
    ...item,
    label: t(locale, item.label) ?? item.label,
    description: t(locale, item.description) ?? item.description,
    inputs: (item.inputs ?? []).map((port) => ({
      ...port,
      label: t(locale, port.label) ?? port.label,
      description: t(locale, port.description),
    })),
    outputs: (item.outputs ?? []).map((port) => ({
      ...port,
      label: t(locale, port.label) ?? port.label,
      description: t(locale, port.description),
    })),
    params: (item.params ?? []).map((param) => localizeParam(locale, param)),
    inputContracts: (item.inputContracts ?? []).map((contract) => localizeWorkflowContract(locale, contract)),
    outputContracts: (item.outputContracts ?? []).map((contract) => localizeWorkflowContract(locale, contract)),
    exampleInputs: (item.exampleInputs ?? []).map((example) => ({
      ...example,
      title: t(locale, example.title) ?? example.title,
      content: t(locale, example.content),
    })),
    exampleOutputs: (item.exampleOutputs ?? []).map((example) => ({
      ...example,
      title: t(locale, example.title) ?? example.title,
      content: t(locale, example.content),
    })),
    commonErrors: (item.commonErrors ?? []).map((text) => t(locale, text) ?? text),
    outputBehaviors: (item.outputBehaviors ?? []).map((behavior) => ({
      ...behavior,
      usages: (behavior.usages ?? []).map((usage) => ({
        ...usage,
        label: t(locale, usage.label),
      })),
    })),
  }));
}

export function localizeWorkflowTemplates(
  locale: LocaleCode,
  templates: WorkflowTemplateDefinition[],
): WorkflowTemplateDefinition[] {
  if (locale !== 'zh-CN') {
    return templates;
  }

  return templates.map((template) => ({
    ...template,
    label: t(locale, template.label) ?? template.label,
    description: t(locale, template.description) ?? template.description,
  }));
}



