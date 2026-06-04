# 遥感数据处理与工作流平台

这是一个面向遥感数据管理、空间分析和流程编排的 Web 平台。
平台包含数据资产、地图可视化、工作流画布、模型产品和账户审批等模块。

在线预览：

[https://iqboshi.github.io/platform/](https://iqboshi.github.io/platform/)

在线预览内置示例数据，打开链接即可浏览主要页面。

## 主要功能

- 平台总览：展示数据集、工作流、工单和空间资源等概览信息。
- 公开数据集：管理和查看遥感数据集、版本和相关说明。
- 产品展示：展示模型或处理流程产出的样例产品。
- 空间工作台：基于地图查看图层、样例点位和空间分析结果。
- 工作流：用画布形式组织数据输入、处理步骤和输出结果。
- 模型页面：展示模型版本、指标和基础运行信息。
- 账户与审批：包含登录、注册、用户审批和个人信息维护等页面。

## 技术栈

- 前端：React、TypeScript、Vite、Ant Design、OpenLayers、React Flow、Three.js
- 后端：Python、FastAPI、SQLAlchemy、SQLite
- 部署：GitHub Actions、GitHub Pages

## 项目结构

```text
platform/
  apps/web      前端页面和交互逻辑
  backend       FastAPI 后端接口
  packages      前端共享类型
  config        本地环境配置模板
  infra         本地服务编排文件
  docs          项目笔记
```

## 本地运行

安装前端依赖：

```powershell
npm install
```

启动前端：

```powershell
npm run dev --workspace @platform/web
```

准备后端环境：

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -e .\backend[dev]
```

启动后端：

```powershell
uvicorn platform_backend.main:app --app-dir .\backend\src --reload
```

## 常用检查

```powershell
npm run lint --workspace @platform/web
npm run build --workspace @platform/web
.venv\Scripts\python.exe -m pytest .\backend\tests
```

## 预览与本地版本

GitHub Pages 版本使用示例数据，适合快速查看界面和交互。
本地运行时可连接 FastAPI 后端，体验数据上传、工作流执行和空间数据服务等功能。
