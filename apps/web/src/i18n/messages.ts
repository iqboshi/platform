import type { LocaleCode } from '@platform/types';

export type TranslationKey =
  | 'app.title'
  | 'common.loading'
  | 'common.login'
  | 'common.register'
  | 'common.logout'
  | 'common.back'
  | 'common.cancel'
  | 'common.submit'
  | 'common.refresh'
  | 'common.approve'
  | 'common.reject'
  | 'common.language'
  | 'common.role'
  | 'common.status'
  | 'common.email'
  | 'common.file'
  | 'common.password'
  | 'common.displayName'
  | 'common.createdAt'
  | 'common.actions'
  | 'common.permissions'
  | 'common.demoAccounts'
  | 'common.yes'
  | 'common.no'
  | 'locale.zh-CN'
  | 'locale.en-US'
  | 'menu.overview'
  | 'menu.datasets'
  | 'menu.workflows'
  | 'menu.models'
  | 'menu.approvals'
  | 'header.workspace'
  | 'header.members'
  | 'header.datasets'
  | 'header.runs'
  | 'header.dataSource'
  | 'header.signedInAs'
  | 'header.readOnly'
  | 'header.manageAccess'
  | 'auth.loginTitle'
  | 'auth.loginSubtitle'
  | 'auth.registerTitle'
  | 'auth.registerSubtitle'
  | 'auth.pendingTitle'
  | 'auth.pendingSubtitle'
  | 'auth.pendingBody'
  | 'auth.pendingRegistered'
  | 'auth.forbiddenTitle'
  | 'auth.forbiddenBody'
  | 'auth.noAccount'
  | 'auth.haveAccount'
  | 'auth.signInAction'
  | 'auth.createAccountAction'
  | 'auth.preferredLocale'
  | 'auth.demoAdmin'
  | 'auth.demoEngineer'
  | 'auth.demoMember'
  | 'auth.demoPending'
  | 'auth.passwordHint'
  | 'auth.loginSuccess'
  | 'auth.registerSuccess'
  | 'auth.logoutSuccess'
  | 'auth.demoHint'
  | 'error.invalid_credentials'
  | 'error.pending_approval'
  | 'error.account_rejected'
  | 'error.email_exists'
  | 'error.permission_denied'
  | 'error.request_failed'
  | 'dashboard.heroKicker'
  | 'dashboard.heroTitle'
  | 'dashboard.heroCopy'
  | 'dashboard.datasetsLabel'
  | 'dashboard.datasetsDetail'
  | 'dashboard.runsLabel'
  | 'dashboard.runsDetail'
  | 'dashboard.modelsLabel'
  | 'dashboard.modelsDetail'
  | 'dashboard.recentRuns'
  | 'dashboard.runId'
  | 'dashboard.submittedBy'
  | 'dashboard.mapSubtitle'
  | 'datasets.kicker'
  | 'datasets.title'
  | 'datasets.copy'
  | 'datasets.uploadSession'
  | 'datasets.uploadCreated'
  | 'datasets.uploadDenied'
  | 'datasets.fileRequired'
  | 'datasets.downloadAsset'
  | 'datasets.table.dataset'
  | 'datasets.table.kind'
  | 'datasets.table.status'
  | 'datasets.previewTitle'
  | 'datasets.previewSubtitle'
  | 'datasets.selectedVersion'
  | 'datasets.version'
  | 'datasets.projection'
  | 'datasets.assetPath'
  | 'datasets.footprint'
  | 'datasets.metadata'
  | 'datasets.tileEndpoint'
  | 'workflows.kicker'
  | 'workflows.title'
  | 'workflows.copy'
  | 'workflows.nodesLabel'
  | 'workflows.nodesDetail'
  | 'workflows.edgesLabel'
  | 'workflows.edgesDetail'
  | 'workflows.categoriesLabel'
  | 'workflows.categoriesDetail'
  | 'workflows.validate'
  | 'workflows.run'
  | 'workflows.validateSuccess'
  | 'workflows.validateFailure'
  | 'workflows.saveSuccess'
  | 'workflows.runQueued'
  | 'workflows.runCompleted'
  | 'workflows.runHistory'
  | 'workflows.runId'
  | 'workflows.workflowVersion'
  | 'workflows.submittedBy'
  | 'workflows.nodeLibrary'
  | 'workflows.nodeLibraryCopy'
  | 'workflows.readOnlyHint'
  | 'workflows.centerView'
  | 'workflows.inspector'
  | 'workflows.inspectorCopy'
  | 'workflows.selectNode'
  | 'workflows.nodeId'
  | 'workflows.nodeType'
  | 'workflows.inputsLabel'
  | 'workflows.outputsLabel'
  | 'workflows.parametersLabel'
  | 'workflows.noParameters'
  | 'workflows.unbound'
  | 'workflows.deleteNode'
  | 'workflows.nodeRemoved'
  | 'workflows.invalidConnection'
  | 'workflows.category.source'
  | 'workflows.category.preprocess'
  | 'workflows.category.split'
  | 'workflows.category.inference'
  | 'workflows.category.postprocess'
  | 'workflow.node.source.dataset.label'
  | 'workflow.node.source.dataset.description'
  | 'workflow.node.preprocess.cog.label'
  | 'workflow.node.preprocess.cog.description'
  | 'workflow.node.split.grid.label'
  | 'workflow.node.split.grid.description'
  | 'workflow.node.inference.segmentation.label'
  | 'workflow.node.inference.segmentation.description'
  | 'workflow.node.postprocess.export.label'
  | 'workflow.node.postprocess.export.description'
  | 'models.kicker'
  | 'models.title'
  | 'models.copy'
  | 'models.versionKicker'
  | 'models.taskType'
  | 'models.modelId'
  | 'models.createdAt'
  | 'approvals.kicker'
  | 'approvals.title'
  | 'approvals.copy'
  | 'approvals.empty'
  | 'approvals.pendingUsers'
  | 'approvals.roleToGrant'
  | 'approvals.approved'
  | 'approvals.rejected'
  | 'role.ADMIN'
  | 'role.ML_ENGINEER'
  | 'role.MEMBER'
  | 'dataset.kind.raster'
  | 'dataset.kind.vector'
  | 'dataset.kind.table'
  | 'dataset.kind.artifact'
  | 'dataset.status.uploaded'
  | 'dataset.status.processing'
  | 'dataset.status.ready'
  | 'dataset.status.failed'
  | 'workflow.status.draft'
  | 'workflow.status.queued'
  | 'workflow.status.running'
  | 'workflow.status.succeeded'
  | 'workflow.status.failed'
  | 'map.preview'
  | 'map.tilejson'
  | 'workspace.loadFailedTitle'
  | 'workspace.loadFailedBody';

type TranslationMap = Record<TranslationKey, string>;

export const messages: Record<LocaleCode, TranslationMap> = {
  'en-US': {
    'app.title': 'Platform RS Studio',
    'common.loading': 'Loading',
    'common.login': 'Log in',
    'common.register': 'Register',
    'common.logout': 'Log out',
    'common.back': 'Back',
    'common.cancel': 'Cancel',
    'common.submit': 'Submit',
    'common.refresh': 'Refresh',
    'common.approve': 'Approve',
    'common.reject': 'Reject',
    'common.language': 'Language',
    'common.role': 'Role',
    'common.status': 'Status',
    'common.email': 'Email',
    'common.file': 'File',
    'common.password': 'Password',
    'common.displayName': 'Display name',
    'common.createdAt': 'Created at',
    'common.actions': 'Actions',
    'common.permissions': 'Permissions',
    'common.demoAccounts': 'Demo accounts',
    'common.yes': 'Yes',
    'common.no': 'No',
    'locale.zh-CN': 'Chinese',
    'locale.en-US': 'English',
    'menu.overview': 'Overview',
    'menu.datasets': 'Datasets',
    'menu.workflows': 'Workflows',
    'menu.models': 'Models',
    'menu.approvals': 'Approvals',
    'header.workspace': 'Workspace',
    'header.members': 'members',
    'header.datasets': 'datasets',
    'header.runs': 'runs',
    'header.dataSource': 'Data Source',
    'header.signedInAs': 'Signed in as',
    'header.readOnly': 'Read-only access',
    'header.manageAccess': 'Manage access',
    'auth.loginTitle': 'Sign in to the remote-sensing workspace',
    'auth.loginSubtitle':
      'Use an approved account to access datasets, workflows, and model operations.',
    'auth.registerTitle': 'Create an account and wait for approval',
    'auth.registerSubtitle':
      'New registrations stay pending until an administrator approves access.',
    'auth.pendingTitle': 'Account pending approval',
    'auth.pendingSubtitle':
      'Your account exists, but an administrator has not approved it yet.',
    'auth.pendingBody':
      'Contact a platform administrator if access is urgent. You can return to the login screen once your account is approved.',
    'auth.pendingRegistered':
      'Registration submitted successfully. Approval is required before the first login.',
    'auth.forbiddenTitle': 'You do not have access to this page',
    'auth.forbiddenBody': 'Your current role does not include the required permission.',
    'auth.noAccount': "Don't have an account?",
    'auth.haveAccount': 'Already have an account?',
    'auth.signInAction': 'Go to login',
    'auth.createAccountAction': 'Create account',
    'auth.preferredLocale': 'Preferred language',
    'auth.demoAdmin': 'Admin account',
    'auth.demoEngineer': 'Engineer account',
    'auth.demoMember': 'Member account',
    'auth.demoPending': 'Pending account',
    'auth.passwordHint': 'Use at least 8 characters.',
    'auth.loginSuccess': 'Login successful.',
    'auth.registerSuccess': 'Registration submitted.',
    'auth.logoutSuccess': 'Logged out.',
    'auth.demoHint': 'Demo passwords are seeded by the backend for local testing.',
    'error.invalid_credentials': 'Email or password is incorrect.',
    'error.pending_approval': 'This account is pending approval.',
    'error.account_rejected': 'This account registration was rejected.',
    'error.email_exists': 'This email address is already registered.',
    'error.permission_denied': 'You do not have permission for this action.',
    'error.request_failed': 'The request failed. Please try again.',
    'dashboard.heroKicker': 'Operations Overview',
    'dashboard.heroTitle':
      'Dataset ingestion, workflow orchestration, and result review in one workspace.',
    'dashboard.heroCopy':
      'The platform now supports authentication, role-aware access, and language switching across the main UI.',
    'dashboard.datasetsLabel': 'Datasets',
    'dashboard.datasetsDetail':
      'Versioned assets across raster, vector, and result artifacts.',
    'dashboard.runsLabel': 'Workflow Runs',
    'dashboard.runsDetail':
      'Queued, running, and completed executions remain traceable.',
    'dashboard.modelsLabel': 'Model Versions',
    'dashboard.modelsDetail':
      'Inference adapters stay versioned and workspace-scoped.',
    'dashboard.recentRuns': 'Recent Workflow Runs',
    'dashboard.runId': 'Run',
    'dashboard.submittedBy': 'Submitted By',
    'dashboard.mapSubtitle':
      'OpenLayers preview with AOI overlay. Replace the placeholder TileJSON with TiTiler-backed tiles as ingestion is wired up.',
    'datasets.kicker': 'Datasets',
    'datasets.title': 'Upload, version, preview, and split remote-sensing assets.',
    'datasets.copy':
      'Dataset pages now support real file upload and persisted dataset versions. Members can browse, while managers can upload.',
    'datasets.uploadSession': 'Upload dataset',
    'datasets.uploadCreated': 'Dataset uploaded successfully.',
    'datasets.uploadDenied': 'Only dataset managers can upload datasets.',
    'datasets.fileRequired': 'Select a file before uploading.',
    'datasets.downloadAsset': 'Download asset',
    'datasets.table.dataset': 'Dataset',
    'datasets.table.kind': 'Kind',
    'datasets.table.status': 'Status',
    'datasets.previewTitle': 'Dataset Preview',
    'datasets.previewSubtitle':
      'AOI preview reuses the same map component embedded in dataset detail and result review screens.',
    'datasets.selectedVersion': 'Selected Dataset Version',
    'datasets.version': 'Version',
    'datasets.projection': 'Projection',
    'datasets.assetPath': 'Asset Path',
    'datasets.footprint': 'Footprint',
    'datasets.metadata': 'Metadata',
    'datasets.tileEndpoint': 'Tile Endpoint',
    'workflows.kicker': 'Workflow Orchestration',
    'workflows.title':
      'Design versioned DAGs for preprocessing, splitting, inference, and export.',
    'workflows.copy':
      'Editors with workflow management permission can validate and save the graph. Users with run permission can execute it with a dataset and model version.',
    'workflows.nodesLabel': 'Nodes',
    'workflows.nodesDetail': 'Versioned graph nodes stored in workflow JSON.',
    'workflows.edgesLabel': 'Edges',
    'workflows.edgesDetail': 'Directed edges define execution dependencies.',
    'workflows.categoriesLabel': 'Categories',
    'workflows.categoriesDetail':
      'Source, preprocess, split, inference, and export blocks.',
    'workflows.validate': 'Validate workflow',
    'workflows.run': 'Run workflow',
    'workflows.validateSuccess': 'Workflow graph is valid.',
    'workflows.validateFailure': 'Workflow validation returned errors.',
    'workflows.saveSuccess': 'Workflow version saved.',
    'workflows.runQueued': 'Workflow run was queued.',
    'workflows.runCompleted': 'Workflow run completed and produced a result dataset.',
    'workflows.runHistory': 'Run History',
    'workflows.runId': 'Run ID',
    'workflows.workflowVersion': 'Workflow Version',
    'workflows.submittedBy': 'Submitted By',
    'workflows.nodeLibrary': 'Node Library',
    'workflows.nodeLibraryCopy':
      'Compose preprocessing, split, inference, and export jobs.',
    'workflows.readOnlyHint':
      'Your current role can view the workflow graph but cannot add or edit nodes.',
    'workflows.centerView': 'Center graph',
    'workflows.inspector': 'Node Inspector',
    'workflows.inspectorCopy':
      'Select a node to edit parameters, review port bindings, and remove it from the graph.',
    'workflows.selectNode': 'Select a node from the canvas to edit it.',
    'workflows.nodeId': 'Node ID',
    'workflows.nodeType': 'Node Type',
    'workflows.inputsLabel': 'Inputs',
    'workflows.outputsLabel': 'Outputs',
    'workflows.parametersLabel': 'Parameters',
    'workflows.noParameters': 'This node has no editable parameters.',
    'workflows.unbound': 'Unbound',
    'workflows.deleteNode': 'Delete node',
    'workflows.nodeRemoved': 'Node removed.',
    'workflows.invalidConnection':
      'Connect from an output port to an input port to create a binding.',
    'workflows.category.source': 'Source',
    'workflows.category.preprocess': 'Preprocess',
    'workflows.category.split': 'Split',
    'workflows.category.inference': 'Inference',
    'workflows.category.postprocess': 'Postprocess',
    'workflow.node.source.dataset.label': 'Dataset Source',
    'workflow.node.source.dataset.description':
      'Bind a dataset version as the workflow input.',
    'workflow.node.preprocess.cog.label': 'Raster Preprocess',
    'workflow.node.preprocess.cog.description':
      'Prepare raster inputs, normalize, or build COG derivatives.',
    'workflow.node.split.grid.label': 'Tile Split',
    'workflow.node.split.grid.description':
      'Generate fixed-size tiles or train/val/test derivatives.',
    'workflow.node.inference.segmentation.label': 'Model Inference',
    'workflow.node.inference.segmentation.description':
      'Run model inference against tiles or full-scene windows.',
    'workflow.node.postprocess.export.label': 'Export Artifact',
    'workflow.node.postprocess.export.description':
      'Export predictions or derived products for delivery.',
    'models.kicker': 'Models',
    'models.title': 'Register inference adapters and bind them to workflow versions.',
    'models.copy':
      'Model registry views are available only to engineering and admin roles.',
    'models.versionKicker': 'Model Version',
    'models.taskType': 'Task type',
    'models.modelId': 'Bound model id',
    'models.createdAt': 'Created at',
    'approvals.kicker': 'Approvals',
    'approvals.title': 'Review new user registrations and grant the right role.',
    'approvals.copy':
      'Only administrators can approve or reject pending accounts.',
    'approvals.empty': 'No pending users.',
    'approvals.pendingUsers': 'Pending users',
    'approvals.roleToGrant': 'Role to grant',
    'approvals.approved': 'User approved.',
    'approvals.rejected': 'User rejected.',
    'role.ADMIN': 'Administrator',
    'role.ML_ENGINEER': 'ML Engineer',
    'role.MEMBER': 'Member',
    'dataset.kind.raster': 'Raster',
    'dataset.kind.vector': 'Vector',
    'dataset.kind.table': 'Table',
    'dataset.kind.artifact': 'Artifact',
    'dataset.status.uploaded': 'Uploaded',
    'dataset.status.processing': 'Processing',
    'dataset.status.ready': 'Ready',
    'dataset.status.failed': 'Failed',
    'workflow.status.draft': 'Draft',
    'workflow.status.queued': 'Queued',
    'workflow.status.running': 'Running',
    'workflow.status.succeeded': 'Succeeded',
    'workflow.status.failed': 'Failed',
    'map.preview': 'Map Preview',
    'map.tilejson': 'TileJSON',
    'workspace.loadFailedTitle': 'Workspace load failed',
    'workspace.loadFailedBody':
      'The workspace snapshot could not be loaded. Check the backend service and try again.',
  },
  'zh-CN': {
    'app.title': '遥感数据平台',
    'common.loading': '加载中',
    'common.login': '登录',
    'common.register': '注册',
    'common.logout': '退出登录',
    'common.back': '返回',
    'common.cancel': '取消',
    'common.submit': '提交',
    'common.refresh': '刷新',
    'common.approve': '通过',
    'common.reject': '拒绝',
    'common.language': '语言',
    'common.role': '角色',
    'common.status': '状态',
    'common.email': '邮箱',
    'common.file': '文件',
    'common.password': '密码',
    'common.displayName': '显示名称',
    'common.createdAt': '创建时间',
    'common.actions': '操作',
    'common.permissions': '权限',
    'common.demoAccounts': '演示账号',
    'common.yes': '是',
    'common.no': '否',
    'locale.zh-CN': '中文',
    'locale.en-US': '英文',
    'menu.overview': '总览',
    'menu.datasets': '数据集',
    'menu.workflows': '工作流',
    'menu.models': '模型',
    'menu.approvals': '审批',
    'header.workspace': '工作空间',
    'header.members': '成员',
    'header.datasets': '数据集',
    'header.runs': '运行任务',
    'header.dataSource': '数据来源',
    'header.signedInAs': '当前账号',
    'header.readOnly': '只读权限',
    'header.manageAccess': '权限管理',
    'auth.loginTitle': '登录遥感数据与工作流平台',
    'auth.loginSubtitle': '使用已审批账号访问数据集、工作流和模型能力。',
    'auth.registerTitle': '注册账号并等待管理员审批',
    'auth.registerSubtitle': '新注册账号会先进入待审批状态，审批通过后才可登录。',
    'auth.pendingTitle': '账号等待审批',
    'auth.pendingSubtitle': '你的账号已经创建，但管理员尚未审批通过。',
    'auth.pendingBody':
      '如果需要尽快开通，请联系平台管理员。审批通过后可返回登录页重新登录。',
    'auth.pendingRegistered': '注册提交成功，首次登录前需要管理员审批。',
    'auth.forbiddenTitle': '你没有访问此页面的权限',
    'auth.forbiddenBody': '当前角色不包含访问该页面所需的权限。',
    'auth.noAccount': '还没有账号？',
    'auth.haveAccount': '已经有账号？',
    'auth.signInAction': '前往登录',
    'auth.createAccountAction': '创建账号',
    'auth.preferredLocale': '偏好语言',
    'auth.demoAdmin': '管理员账号',
    'auth.demoEngineer': '算法工程师账号',
    'auth.demoMember': '成员账号',
    'auth.demoPending': '待审批账号',
    'auth.passwordHint': '密码至少 8 位。',
    'auth.loginSuccess': '登录成功。',
    'auth.registerSuccess': '注册已提交。',
    'auth.logoutSuccess': '已退出登录。',
    'auth.demoHint': '本地测试环境已预置演示账号密码。',
    'error.invalid_credentials': '邮箱或密码不正确。',
    'error.pending_approval': '该账号正在等待审批。',
    'error.account_rejected': '该账号注册申请已被拒绝。',
    'error.email_exists': '该邮箱已被注册。',
    'error.permission_denied': '你没有执行该操作的权限。',
    'error.request_failed': '请求失败，请稍后重试。',
    'dashboard.heroKicker': '平台总览',
    'dashboard.heroTitle': '在一个工作空间中完成数据入库、工作流编排和结果查看。',
    'dashboard.heroCopy':
      '当前版本已经支持登录鉴权、按角色控制权限，以及主界面的中英文切换。',
    'dashboard.datasetsLabel': '数据集',
    'dashboard.datasetsDetail': '统一管理栅格、矢量和结果产物等版本化资产。',
    'dashboard.runsLabel': '工作流运行',
    'dashboard.runsDetail': '排队、执行中和已完成任务都可追踪。',
    'dashboard.modelsLabel': '模型版本',
    'dashboard.modelsDetail': '推理模型及版本在工作空间内统一管理。',
    'dashboard.recentRuns': '最近运行记录',
    'dashboard.runId': '运行编号',
    'dashboard.submittedBy': '提交人',
    'dashboard.mapSubtitle':
      '使用 OpenLayers 预览 AOI 范围。接入 TiTiler 后可替换为真实瓦片流。',
    'datasets.kicker': '数据集',
    'datasets.title': '上传、版本化、预览并管理遥感数据资产。',
    'datasets.copy':
      '数据集页面现在支持真实文件上传和持久化版本记录。成员可查看，具备权限的角色可上传。',
    'datasets.uploadSession': '上传数据集',
    'datasets.uploadCreated': '数据集上传成功。',
    'datasets.uploadDenied': '只有具备数据集管理权限的账号可以上传数据集。',
    'datasets.fileRequired': '请先选择要上传的文件。',
    'datasets.downloadAsset': '下载文件',
    'datasets.table.dataset': '数据集',
    'datasets.table.kind': '类型',
    'datasets.table.status': '状态',
    'datasets.previewTitle': '数据预览',
    'datasets.previewSubtitle': 'AOI 预览组件可复用到数据详情和结果查看页面。',
    'datasets.selectedVersion': '当前选中版本',
    'datasets.version': '版本',
    'datasets.projection': '投影',
    'datasets.assetPath': '资产路径',
    'datasets.footprint': '覆盖范围',
    'datasets.metadata': '元数据',
    'datasets.tileEndpoint': '瓦片地址',
    'workflows.kicker': '工作流编排',
    'workflows.title': '为预处理、切片、推理和导出设计可版本化 DAG。',
    'workflows.copy':
      '具备工作流管理权限的账号可校验并保存图结构；具备运行权限的账号可结合数据集与模型版本执行。',
    'workflows.nodesLabel': '节点数',
    'workflows.nodesDetail': '工作流 JSON 中定义的版本化节点数量。',
    'workflows.edgesLabel': '连线数',
    'workflows.edgesDetail': '节点之间的有向依赖关系。',
    'workflows.categoriesLabel': '节点类别',
    'workflows.categoriesDetail': '来源、预处理、切分、推理与导出等类别。',
    'workflows.validate': '校验工作流',
    'workflows.run': '运行工作流',
    'workflows.validateSuccess': '工作流校验通过。',
    'workflows.validateFailure': '工作流校验返回错误。',
    'workflows.saveSuccess': '工作流版本已保存。',
    'workflows.runQueued': '工作流运行已进入队列。',
    'workflows.runCompleted': '工作流运行完成，并生成了结果数据集。',
    'workflows.runHistory': '运行历史',
    'workflows.runId': '运行编号',
    'workflows.workflowVersion': '工作流版本',
    'workflows.submittedBy': '提交人',
    'workflows.nodeLibrary': '节点库',
    'workflows.nodeLibraryCopy': '组合预处理、切分、推理和导出节点。',
    'workflows.readOnlyHint': '当前账号只能查看工作流图，不能新增或编辑节点。',
    'workflows.centerView': '定位到流程图',
    'workflows.inspector': '节点配置',
    'workflows.inspectorCopy': '选中节点后可编辑参数、查看端口绑定，并可删除该节点。',
    'workflows.selectNode': '请先在画布中选中一个节点。',
    'workflows.nodeId': '节点编号',
    'workflows.nodeType': '节点类型',
    'workflows.inputsLabel': '输入端口',
    'workflows.outputsLabel': '输出端口',
    'workflows.parametersLabel': '参数',
    'workflows.noParameters': '该节点没有可编辑参数。',
    'workflows.unbound': '未绑定',
    'workflows.deleteNode': '删除节点',
    'workflows.nodeRemoved': '节点已删除。',
    'workflows.invalidConnection': '请从输出端口连到输入端口，才能建立节点绑定。',
    'workflows.category.source': '数据源',
    'workflows.category.preprocess': '预处理',
    'workflows.category.split': '切分',
    'workflows.category.inference': '推理',
    'workflows.category.postprocess': '后处理',
    'workflow.node.source.dataset.label': '数据集输入',
    'workflow.node.source.dataset.description': '选择一个数据集版本作为工作流输入。',
    'workflow.node.preprocess.cog.label': '栅格预处理',
    'workflow.node.preprocess.cog.description': '执行归一化、投影准备或 COG 预处理。',
    'workflow.node.split.grid.label': '网格切片',
    'workflow.node.split.grid.description': '生成固定大小切片或训练/验证/测试拆分。',
    'workflow.node.inference.segmentation.label': '模型推理',
    'workflow.node.inference.segmentation.description': '对切片或整幅影像执行推理。',
    'workflow.node.postprocess.export.label': '结果导出',
    'workflow.node.postprocess.export.description': '导出预测结果或派生产物用于下载。',
    'models.kicker': '模型',
    'models.title': '注册推理适配器并绑定到工作流版本。',
    'models.copy': '模型管理页面仅对算法工程师和管理员开放。',
    'models.versionKicker': '模型版本',
    'models.taskType': '任务类型',
    'models.modelId': '关联模型编号',
    'models.createdAt': '创建时间',
    'approvals.kicker': '账号审批',
    'approvals.title': '审核新注册用户并授予合适角色。',
    'approvals.copy': '只有管理员可以通过或拒绝待审批账号。',
    'approvals.empty': '当前没有待审批用户。',
    'approvals.pendingUsers': '待审批用户',
    'approvals.roleToGrant': '通过后角色',
    'approvals.approved': '用户已通过审批。',
    'approvals.rejected': '用户已被拒绝。',
    'role.ADMIN': '管理员',
    'role.ML_ENGINEER': '算法工程师',
    'role.MEMBER': '成员',
    'dataset.kind.raster': '栅格',
    'dataset.kind.vector': '矢量',
    'dataset.kind.table': '表格',
    'dataset.kind.artifact': '产物',
    'dataset.status.uploaded': '已上传',
    'dataset.status.processing': '处理中',
    'dataset.status.ready': '可用',
    'dataset.status.failed': '失败',
    'workflow.status.draft': '草稿',
    'workflow.status.queued': '已排队',
    'workflow.status.running': '运行中',
    'workflow.status.succeeded': '成功',
    'workflow.status.failed': '失败',
    'map.preview': '地图预览',
    'map.tilejson': '瓦片配置',
    'workspace.loadFailedTitle': '工作区加载失败',
    'workspace.loadFailedBody': '无法加载当前工作区快照，请检查后端服务后重试。',
  },
};
