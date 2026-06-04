# 遥感数据处理与工作流平台

项目地址：[https://github.com/iqboshi/platform](https://github.com/iqboshi/platform)  
在线预览：[https://iqboshi.github.io/platform/](https://iqboshi.github.io/platform/)

## 项目概述

这是一个面向遥感数据管理、空间分析和流程编排的 Web 平台。页面按数据平台的常见流程组织：数据进入平台后，可以在地图中查看空间范围，进入工作流处理，再把结果放到产品或资产模块中继续管理。

线上预览使用示例数据，打开链接即可浏览主要页面和交互；本地运行时可以连接 FastAPI 后端，体验接口读写、权限状态和工作流运行流程。

## 功能范围

- 数据集管理：整理公开遥感数据集、版本信息、上传入口和表格预览。
- 空间工作台：基于地图完成底图切换、ROI 绘制与编辑、点位标注、空间叠加层和透明度控制。
- 工作流画布：通过节点拖拽、端口连接、参数配置、模板导入导出和图结构校验组织处理流程。
- 模型与产品：管理模型版本、训练产物、产品资料和三维预览。
- 账户与审批：包含登录注册、待审批、权限菜单、用户审批和工作空间设置。
- 资产流转：将数据集、ROI、模型版本、工作流输出等资源整理到统一的资产入口。

## 技术栈

- 前端：React、TypeScript、Vite、Ant Design、OpenLayers、React Flow、Three.js
- 后端：Python、FastAPI、SQLAlchemy、SQLite
- 部署：GitHub Actions、GitHub Pages

## 主要实现

- 前端工程：使用 React Router 组织登录、工作区、管理页和个人中心等路由；页面按业务模块拆分，并通过工作空间模块配置生成侧边栏入口。
- 页面交互：使用 Ant Design 处理表格、表单、抽屉、弹窗、状态提示和权限相关的可见状态，保持不同页面的操作方式一致。
- 地图可视化：使用 OpenLayers 处理底图、GeoJSON、GeoTIFF、ROI 绘制、几何编辑、坐标转换和空间图层叠加。
- 工作流编辑：使用 React Flow 搭建画布，围绕节点类型、输入输出端口、参数表单和校验结果维护图结构。
- 接口设计：后端按认证、数据集、产品、空间资源、工作流、模型、任务和系统设置拆分 FastAPI 路由，并用 service 层承接业务逻辑。
- 预览部署：通过 GitHub Actions 构建前端并发布到 GitHub Pages，预览版本使用示例数据，便于直接查看页面效果。
