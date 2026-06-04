# 后端说明

后端使用 FastAPI 编写，提供用户、数据集、工作流、空间图层和产品展示相关接口。

本地安装：

```powershell
python -m pip install -e .\backend[dev]
```

启动服务：

```powershell
uvicorn platform_backend.main:app --app-dir .\backend\src --reload
```

健康检查：

```text
GET /healthz
```
