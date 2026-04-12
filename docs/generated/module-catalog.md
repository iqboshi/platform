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
- Summary (ZH): 管理数据集、结构化表格和可复用的数据输入。
- Summary (EN): Manage datasets, structured tables, and reusable data inputs.
- Cross-page handoff notes:
  - Structured datasets can flow directly into workflows as inputs.
  - Spatial-ready dataset versions can continue into map and overlay flows.

### `products`

- Route: `/products`
- Menu key: `menu.products`
- Permission: `none`
- Summary (ZH): 查看产品资料、三维预览与可公开展示的产品资产。
- Summary (EN): Browse product records, 3D previews, and publishable showcase assets.
- Cross-page handoff notes:
  - Published products remain reusable as showcase assets.
  - Product files and metadata should still flow back to the asset hub.

### `spatial`

- Route: `/spatial`
- Menu key: `menu.spatial`
- Permission: `none`
- Summary (ZH): 可视化地图叠加层、ROI 与空间分析结果。
- Summary (EN): Visualize map overlays, ROIs, and spatial analysis outputs.
- Cross-page handoff notes:
  - Workflow outputs that match the overlay contract should open directly on the map.
  - Saved ROIs can feed workflows as spatial inputs.

### `workflows`

- Route: `/workflows`
- Menu key: `menu.workflows`
- Permission: `none`
- Summary (ZH): 编排数据处理、模型推理与结果产出链路。
- Summary (EN): Compose data preparation, model inference, and result delivery chains.
- Cross-page handoff notes:
  - Datasets, ROIs, models, and personal credentials should all feed workflows.
  - Qualified workflow outputs should hand off directly to maps or the asset hub.

### `models`

- Route: `/models`
- Menu key: `menu.models`
- Permission: `model.view`
- Summary (ZH): 管理模型版本、训练产物和外部 API 模型配置。
- Summary (EN): Inspect model versions, training artifacts, and external API model configs.
- Cross-page handoff notes:
  - Model versions should feed workflow inference nodes directly.
  - Training outputs should flow back into reusable model assets.

## Administration Modules

### `approvals`

- Route: `/admin/users`
- Menu key: `menu.approvals`
- Permission: `user.approve`
- Summary (ZH): 处理账号审批、角色变更与治理动作。
- Summary (EN): Review account approvals, role changes, and governance actions.
- Cross-page handoff notes:
  - Approval outcomes should change visible modules and entry points on the overview.
  - Governance actions should also flow back into overview state.

### `workspace-settings`

- Route: `/admin/workspace-settings`
- Menu key: `menu.workspaceSettings`
- Permission: `system.configure`
- Summary (ZH): 维护首页公告、平台邮件和工作空间级配置。
- Summary (EN): Maintain overview announcements, platform email, and workspace-level settings.
- Cross-page handoff notes:
  - Announcement content should feed the overview directly instead of duplicating feature copy.
  - System settings should stay clearly separated from account and asset pages.

## Personal Modules

### `account`

- Route: `/account`
- Menu key: `menu.account`
- Permission: `none`
- Summary (ZH): 管理个人资料、安全设置与个人集成凭证。
- Summary (EN): Manage profile, security settings, and personal integration credentials.
- Cross-page handoff notes:
  - Personal credentials should be reusable from workflows and spatial modules.
  - Account information should stay separate from asset content.

### `assets`

- Route: `/assets`
- Menu key: `menu.assets`
- Permission: `none`
- Summary (ZH): 管理可复用输入、流程结果与共享发布状态。
- Summary (EN): Manage reusable inputs, workflow outputs, and shared publication state.
- Cross-page handoff notes:
  - The asset hub should clearly show what each asset can feed next.
  - Assets produced by workflows, maps, and models should flow back here.
