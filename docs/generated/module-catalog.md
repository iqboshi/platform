---
source_of_truth: generated
last_verified_at: 2026-04-12
owned_by: platform-web
derived_from:
  - apps/web/src/config/workspace-modules.json
---

# Module Catalog

This file is generated from the frontend workspace module registry.

## Workspace Modules

### `datasets`

- Route: `/datasets`
- Menu key: `menu.datasets`
- Permission: `none`
- Title (ZH): 数据集
- Title (EN): Datasets
- Summary (ZH): 管理数据集、结构化表格和可复用的数据输入。
- Summary (EN): Manage datasets, structured tables, and reusable data inputs.
- Primary action (ZH): 打开数据集
- Primary action (EN): Open datasets
- Cross-page handoff notes (ZH):
  - 结构化数据集可以直接送入工作流作为输入。
  - 支持空间格式的数据集版本可以继续进入地图与叠加层流程。
- Cross-page handoff notes (EN):
  - Structured datasets can flow directly into workflows as inputs.
  - Spatial-ready dataset versions can continue into map and overlay flows.

### `products`

- Route: `/products`
- Menu key: `menu.products`
- Permission: `none`
- Title (ZH): 产品展示
- Title (EN): Products
- Summary (ZH): 查看产品资料、三维预览与可公开展示的产品资产。
- Summary (EN): Browse product records, 3D previews, and publishable showcase assets.
- Primary action (ZH): 打开产品
- Primary action (EN): Open products
- Cross-page handoff notes (ZH):
  - 公开产品可以继续作为对外展示资产复用。
  - 产品文件与元数据仍然应回流到资产中心统一管理。
- Cross-page handoff notes (EN):
  - Published products remain reusable as showcase assets.
  - Product files and metadata should still flow back to the asset hub.

### `spatial`

- Route: `/spatial`
- Menu key: `menu.spatial`
- Permission: `none`
- Title (ZH): 空间工作台
- Title (EN): Spatial Studio
- Summary (ZH): 可视化地图叠加层、ROI 与空间分析结果。
- Summary (EN): Visualize map overlays, ROIs, and spatial analysis outputs.
- Primary action (ZH): 打开空间工作台
- Primary action (EN): Open spatial studio
- Cross-page handoff notes (ZH):
  - 符合 overlay 输入结构的工作流输出应当可以直接在地图中打开。
  - 保存的 ROI 可以继续送入工作流作为空间输入。
- Cross-page handoff notes (EN):
  - Workflow outputs that match the overlay contract should open directly on the map.
  - Saved ROIs can feed workflows as spatial inputs.

### `workflows`

- Route: `/workflows`
- Menu key: `menu.workflows`
- Permission: `none`
- Title (ZH): 工作流
- Title (EN): Workflows
- Summary (ZH): 编排数据处理、模型推理与结果产出链路。
- Summary (EN): Compose data preparation, model inference, and result delivery chains.
- Primary action (ZH): 打开工作流
- Primary action (EN): Open workflows
- Cross-page handoff notes (ZH):
  - 数据集、ROI、模型和个人凭证都应该能直接送入工作流。
  - 符合条件的工作流输出应当直接回流到地图或资产中心。
- Cross-page handoff notes (EN):
  - Datasets, ROIs, models, and personal credentials should all feed workflows.
  - Qualified workflow outputs should hand off directly to maps or the asset hub.

### `models`

- Route: `/models`
- Menu key: `menu.models`
- Permission: `model.view`
- Title (ZH): 模型中心
- Title (EN): Models
- Summary (ZH): 管理模型版本、训练产物和外部 API 模型配置。
- Summary (EN): Inspect model versions, training artifacts, and external API model configs.
- Primary action (ZH): 打开模型中心
- Primary action (EN): Open models
- Cross-page handoff notes (ZH):
  - 模型版本应能够直接进入工作流推理节点。
  - 训练输出应回流为可复用的模型资产。
- Cross-page handoff notes (EN):
  - Model versions should feed workflow inference nodes directly.
  - Training outputs should flow back into reusable model assets.

## Administration Modules

### `approvals`

- Route: `/admin/users`
- Menu key: `menu.approvals`
- Permission: `user.approve`
- Title (ZH): 审批中心
- Title (EN): Approvals
- Summary (ZH): 处理账号审批、角色变更与治理动作。
- Summary (EN): Review account approvals, role changes, and governance actions.
- Primary action (ZH): 打开审批中心
- Primary action (EN): Open approvals
- Cross-page handoff notes (ZH):
  - 审批结果应直接影响总览页可见模块与入口状态。
  - 治理动作完成后也应回写到总览状态。
- Cross-page handoff notes (EN):
  - Approval outcomes should change visible modules and entry points on the overview.
  - Governance actions should also flow back into overview state.

### `workspace-settings`

- Route: `/admin/workspace-settings`
- Menu key: `menu.workspaceSettings`
- Permission: `system.configure`
- Title (ZH): 工作空间设置
- Title (EN): Workspace Settings
- Summary (ZH): 维护总览公告、平台邮件和工作空间级配置。
- Summary (EN): Maintain overview announcements, platform email, and workspace-level settings.
- Primary action (ZH): 打开工作空间设置
- Primary action (EN): Open settings
- Cross-page handoff notes (ZH):
  - 公告内容应直接进入总览页，不再与功能介绍重复堆叠。
  - 系统级配置应继续与账号页、资产页保持边界清晰。
- Cross-page handoff notes (EN):
  - Announcement content should feed the overview directly instead of duplicating feature copy.
  - System settings should stay clearly separated from account and asset pages.

## Personal Modules

### `account`

- Route: `/account`
- Menu key: `menu.account`
- Permission: `none`
- Title (ZH): 账号中心
- Title (EN): Account Center
- Summary (ZH): 管理个人资料、安全设置与账号申请。
- Summary (EN): Manage profile, security settings, and access requests.
- Primary action (ZH): 打开账号中心
- Primary action (EN): Open account
- Cross-page handoff notes (ZH):
  - 账号资料应与可复用资产保持边界清晰，不再混在同一入口。
  - 角色申请与安全设置应直接反馈到账户状态与可见权限。
- Cross-page handoff notes (EN):
  - Account information should stay clearly separated from reusable assets.
  - Access requests and security changes should feed back into account state and permissions.

### `assets`

- Route: `/assets`
- Menu key: `menu.assets`
- Permission: `none`
- Title (ZH): 资产中心
- Title (EN): Asset Hub
- Summary (ZH): 管理可复用输入、流程结果、共享能力与发布状态。
- Summary (EN): Manage reusable inputs, workflow outputs, shared capabilities, and publication state.
- Primary action (ZH): 打开资产中心
- Primary action (EN): Open asset hub
- Cross-page handoff notes (ZH):
  - 资产中心应明确展示每项资产下一步还能送到哪里。
  - 工作流、地图和模型产出的资产，以及 GEE 凭证这类共享能力，都应统一回流到这里。
- Cross-page handoff notes (EN):
  - The asset hub should clearly show what each asset can feed next.
  - Assets produced by workflows, maps, and models, plus shared capabilities such as GEE credentials, should flow back here.
