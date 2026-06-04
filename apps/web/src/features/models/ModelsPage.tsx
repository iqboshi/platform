import type { PlatformDataSnapshot } from '@/lib/api';
import type { ModelVersionSummary } from '@platform/types';

import {
  App,
  Button,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';
import { useMemo, useState } from 'react';

import { isApiError } from '@/auth/errors';
import { LayeredPanelCard } from '@/components/LayeredPanelCard';
import { StatCard } from '@/components/StatCard';
import { useAuth } from '@/auth/useAuth';
import { useI18n } from '@/i18n/useI18n';
import {
  createCustomApiModel,
  deleteModelVersion,
  downloadModelVersion,
} from '@/lib/api';

const { Paragraph, Text, Title } = Typography;
const { TextArea } = Input;

type ModelsCopy = {
  heroKicker: string;
  heroTitle: string;
  heroCopy: string;
  totalModels: string;
  totalModelsDetail: string;
  customModels: string;
  customModelsDetail: string;
  publishedModels: string;
  publishedModelsDetail: string;
  customTitle: string;
  customCopy: string;
  libraryTitle: string;
  libraryCopy: string;
  modelName: string;
  version: string;
  description: string;
  endpointUrl: string;
  timeoutSeconds: string;
  authType: string;
  authToken: string;
  authHeaderName: string;
  responseMode: string;
  defaultPredictionColumn: string;
  defaultParameters: string;
  createAction: string;
  createSuccess: string;
  deleteSuccess: string;
  invalidDefaults: string;
  noModels: string;
  noDescription: string;
  download: string;
  delete: string;
  featureNames: string;
  metadata: string;
  metrics: string;
  apiConfig: string;
  owner: string;
  createdAt: string;
  framework: string;
  algorithm: string;
  visibility: string;
  taskType: string;
  executionMode: string;
  artifactFormat: string;
  source: string;
  authNone: string;
  authBearer: string;
  authHeader: string;
  responsePredictionValues: string;
  responseTableRows: string;
  sourceUploaded: string;
  sourceTrained: string;
  sourceSeeded: string;
  sourceCustomApi: string;
  visibilityPublic: string;
  visibilityPrivate: string;
  visibilityWorkspace: string;
  executionInProcess: string;
  executionExternalApi: string;
  expandDetails: string;
  collapseDetails: string;
};

const MODEL_COPY: Record<'zh-CN' | 'en-US', ModelsCopy> = {
  'zh-CN': {
    heroKicker: '模型资产中台',
    heroTitle: '把训练产物、上传模型和外部 API 模型整理成统一可复用的模型资产。',
    heroCopy:
      '模型资产记录来源、可见性、执行方式和关联工作流，便于在推理节点中复用。',
    totalModels: '模型总数',
    totalModelsDetail: '当前工作空间中可访问的模型版本。',
    customModels: '外部 API',
    customModelsDetail: '通过 HTTP 接口接入的模型资产。',
    publishedModels: '已共享',
    publishedModelsDetail: '对团队公开或工作空间可见的模型版本。',
    customTitle: '注册外部 API 模型',
    customCopy:
      '当模型托管在平台之外时，在这里登记它的 HTTP API。工作流中的推理节点将直接复用这份模型资产配置，而不是重复填写接口信息。',
    libraryTitle: '模型资产库',
    libraryCopy:
      '每个模型卡片现在都强调“来源、可见性、执行方式、可下游使用方式”，减少只能看见一堆 JSON 但无法判断如何接入工作流的问题。',
    modelName: '模型名称',
    version: '版本',
    description: '说明',
    endpointUrl: '接口地址',
    timeoutSeconds: '超时时间（秒）',
    authType: '鉴权方式',
    authToken: '鉴权令牌',
    authHeaderName: '自定义请求头名称',
    responseMode: '响应格式',
    defaultPredictionColumn: '默认预测列',
    defaultParameters: '默认调用参数 JSON',
    createAction: '创建 API 模型',
    createSuccess: '外部 API 模型已创建。',
    deleteSuccess: '模型资产已删除。',
    invalidDefaults: '默认调用参数必须是一个 JSON 对象。',
    noModels: '当前还没有可访问的模型资产。',
    noDescription: '暂无模型说明。',
    download: '下载',
    delete: '删除',
    featureNames: '特征字段',
    metadata: '元数据',
    metrics: '训练指标',
    apiConfig: 'API 配置',
    owner: '所有者',
    createdAt: '创建时间',
    framework: '框架',
    algorithm: '算法',
    visibility: '可见性',
    taskType: '任务类型',
    executionMode: '执行方式',
    artifactFormat: '产物格式',
    source: '来源',
    authNone: '无',
    authBearer: 'Bearer',
    authHeader: '自定义 Header',
    responsePredictionValues: '预测值数组',
    responseTableRows: '表格行',
    sourceUploaded: '上传模型',
    sourceTrained: '平台训练',
    sourceSeeded: '预置模型',
    sourceCustomApi: '外部 API',
    visibilityPublic: '公开',
    visibilityPrivate: '私有',
    visibilityWorkspace: '工作空间',
    executionInProcess: '平台内执行',
    executionExternalApi: '外部 API 调用',
    expandDetails: '展开详情',
    collapseDetails: '收起详情',
  },
  'en-US': {
    heroKicker: 'Model Asset Center',
    heroTitle: 'Treat trained artifacts, uploaded models, and external APIs as one reusable model layer.',
    heroCopy:
      'Model records show source, visibility, execution mode, and workflow readiness for reuse in inference steps.',
    totalModels: 'Models',
    totalModelsDetail: 'Accessible model versions in the current workspace.',
    customModels: 'External APIs',
    customModelsDetail: 'Models registered through HTTP endpoints.',
    publishedModels: 'Shared models',
    publishedModelsDetail: 'Model versions visible to the workspace or published publicly.',
    customTitle: 'Register External API Model',
    customCopy:
      'When a model runs outside the platform, save its HTTP API here. Workflow inference nodes can then reuse this model asset directly instead of repeating endpoint settings.',
    libraryTitle: 'Model Library',
    libraryCopy:
      'Each model card now emphasizes source, visibility, execution mode, and downstream workflow usage instead of burying everything in one long card.',
    modelName: 'Model name',
    version: 'Version',
    description: 'Description',
    endpointUrl: 'Endpoint URL',
    timeoutSeconds: 'Timeout (seconds)',
    authType: 'Auth type',
    authToken: 'Auth token',
    authHeaderName: 'Custom header name',
    responseMode: 'Response mode',
    defaultPredictionColumn: 'Default prediction column',
    defaultParameters: 'Default call parameters JSON',
    createAction: 'Create custom model',
    createSuccess: 'External API model created.',
    deleteSuccess: 'Model asset deleted.',
    invalidDefaults: 'Default call parameters must be a JSON object.',
    noModels: 'No model assets are available yet.',
    noDescription: 'No model description was provided.',
    download: 'Download',
    delete: 'Delete',
    featureNames: 'Feature names',
    metadata: 'Metadata',
    metrics: 'Training metrics',
    apiConfig: 'API config',
    owner: 'Owner',
    createdAt: 'Created at',
    framework: 'Framework',
    algorithm: 'Algorithm',
    visibility: 'Visibility',
    taskType: 'Task type',
    executionMode: 'Execution mode',
    artifactFormat: 'Artifact format',
    source: 'Source',
    authNone: 'None',
    authBearer: 'Bearer',
    authHeader: 'Custom header',
    responsePredictionValues: 'Prediction values array',
    responseTableRows: 'Table rows',
    sourceUploaded: 'Uploaded',
    sourceTrained: 'Platform trained',
    sourceSeeded: 'Seeded',
    sourceCustomApi: 'External API',
    visibilityPublic: 'Public',
    visibilityPrivate: 'Private',
    visibilityWorkspace: 'Workspace',
    executionInProcess: 'In-platform',
    executionExternalApi: 'External API',
    expandDetails: 'Expand details',
    collapseDetails: 'Collapse details',
  },
};

function formatDateTime(locale: string, value: string | undefined): string {
  if (!value) {
    return '-';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function sourceLabel(sourceType: ModelVersionSummary['sourceType'], copy: ModelsCopy): string {
  switch (sourceType) {
    case 'trained':
      return copy.sourceTrained;
    case 'custom_api':
      return copy.sourceCustomApi;
    case 'seeded':
      return copy.sourceSeeded;
    default:
      return copy.sourceUploaded;
  }
}

function sourceColor(sourceType: ModelVersionSummary['sourceType']): string {
  switch (sourceType) {
    case 'custom_api':
      return 'purple';
    case 'trained':
      return 'green';
    case 'seeded':
      return 'geekblue';
    default:
      return 'gold';
  }
}

function visibilityLabel(
  visibility: ModelVersionSummary['visibility'],
  copy: ModelsCopy,
): string {
  switch (visibility) {
    case 'public':
      return copy.visibilityPublic;
    case 'workspace':
      return copy.visibilityWorkspace;
    default:
      return copy.visibilityPrivate;
  }
}

function visibilityColor(visibility: ModelVersionSummary['visibility']): string {
  switch (visibility) {
    case 'public':
      return 'blue';
    case 'workspace':
      return 'cyan';
    default:
      return 'default';
  }
}

function executionModeLabel(
  executionMode: ModelVersionSummary['executionMode'],
  copy: ModelsCopy,
): string {
  switch (executionMode) {
    case 'external_api':
      return copy.executionExternalApi;
    default:
      return copy.executionInProcess;
  }
}

function metadataObject(
  metadata: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const value = metadata[key];
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function metadataString(metadata: Record<string, unknown>, key: string): string | undefined {
  const value = metadata[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

export function ModelsPage({
  snapshot,
  onRefresh,
}: {
  snapshot: PlatformDataSnapshot;
  onRefresh: () => Promise<void>;
}) {
  const { message } = App.useApp();
  const { hasPermission, token, currentUser } = useAuth();
  const { locale, t } = useI18n();
  const [form] = Form.useForm<{
    modelName: string;
    version: string;
    description?: string;
    endpointUrl: string;
    timeoutSeconds: number;
    authType: 'none' | 'bearer' | 'header';
    authToken?: string;
    authHeaderName?: string;
    responseMode: 'prediction_values' | 'table_rows';
    defaultPredictionColumn: string;
    defaultParametersJson: string;
  }>();
  const [submitting, setSubmitting] = useState(false);

  const copy = MODEL_COPY[locale === 'zh-CN' ? 'zh-CN' : 'en-US'];
  const authType = Form.useWatch('authType', form) ?? 'none';
  const canManage = hasPermission('model.manage');
  const platformOwnerLabel = t('assets.platformOwner');

  const visibleModelVersions = useMemo(
    () =>
      [...snapshot.modelVersions].sort((left, right) =>
        String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? '')),
      ),
    [snapshot.modelVersions],
  );

  const modelStats = useMemo(() => {
    const customApiCount = visibleModelVersions.filter(
      (item) => item.sourceType === 'custom_api',
    ).length;
    const publishedCount = visibleModelVersions.filter(
      (item) => item.visibility === 'public' || item.visibility === 'workspace',
    ).length;
    return {
      total: visibleModelVersions.length,
      customApiCount,
      publishedCount,
    };
  }, [visibleModelVersions]);

  const onCreateCustomModel = async () => {
    if (!token || !canManage) {
      return;
    }

    try {
      setSubmitting(true);
      const values = await form.validateFields();
      const parsedDefaults = JSON.parse(values.defaultParametersJson) as unknown;
      if (
        parsedDefaults === null ||
        Array.isArray(parsedDefaults) ||
        typeof parsedDefaults !== 'object'
      ) {
        throw new Error(copy.invalidDefaults);
      }

      await createCustomApiModel(token, {
        workspaceId: snapshot.workspace.id,
        modelName: values.modelName,
        version: values.version,
        taskType: 'regression',
        description: values.description,
        endpointUrl: values.endpointUrl,
        timeoutSeconds: values.timeoutSeconds,
        authType: values.authType,
        authToken: values.authToken,
        authHeaderName: values.authHeaderName,
        responseMode: values.responseMode,
        defaultPredictionColumn: values.defaultPredictionColumn,
        defaultParameters: parsedDefaults as Record<string, unknown>,
      });

      message.success(copy.createSuccess);
      form.resetFields();
      form.setFieldsValue({
        version: '1.0.0',
        timeoutSeconds: 30,
        authType: 'none',
        responseMode: 'prediction_values',
        defaultPredictionColumn: 'prediction',
        defaultParametersJson: '{}',
      });
      await onRefresh();
    } catch (error) {
      message.error(
        isApiError(error)
          ? error.message
          : (error as Error).message || t('error.request_failed'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const onDeleteModel = async (modelVersionId: string) => {
    if (!token) {
      return;
    }
    try {
      await deleteModelVersion(token, modelVersionId);
      message.success(copy.deleteSuccess);
      await onRefresh();
    } catch (error) {
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    }
  };

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div className="hero-kicker">{copy.heroKicker}</div>
        <Title className="hero-title">{copy.heroTitle}</Title>
        <Paragraph className="hero-copy">{copy.heroCopy}</Paragraph>
      </section>

      <div className="model-overview-grid">
        <StatCard
          label={copy.totalModels}
          value={String(modelStats.total)}
          detail={copy.totalModelsDetail}
        />
        <StatCard
          label={copy.customModels}
          value={String(modelStats.customApiCount)}
          detail={copy.customModelsDetail}
        />
        <StatCard
          label={copy.publishedModels}
          value={String(modelStats.publishedCount)}
          detail={copy.publishedModelsDetail}
        />
      </div>

      {canManage ? (
        <LayeredPanelCard
          className="panel-card"
          kicker={copy.customTitle}
          title={copy.customTitle}
          summary={<div>{copy.customCopy}</div>}
          defaultExpanded
          expandLabel={copy.expandDetails}
          collapseLabel={copy.collapseDetails}
        >
          <Form
            form={form}
            layout="vertical"
            initialValues={{
              version: '1.0.0',
              timeoutSeconds: 30,
              authType: 'none',
              responseMode: 'prediction_values',
              defaultPredictionColumn: 'prediction',
              defaultParametersJson: '{}',
            }}
          >
            <div className="model-form-grid">
              <Form.Item name="modelName" label={copy.modelName} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="version" label={copy.version} rules={[{ required: true }]}>
                <Input placeholder="1.0.0" />
              </Form.Item>
              <Form.Item name="endpointUrl" label={copy.endpointUrl} rules={[{ required: true }]}>
                <Input placeholder="https://example.com/predict" />
              </Form.Item>
              <Form.Item
                name="timeoutSeconds"
                label={copy.timeoutSeconds}
                rules={[{ required: true }]}
              >
                <InputNumber min={1} max={600} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="authType" label={copy.authType} rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'none', label: copy.authNone },
                    { value: 'bearer', label: copy.authBearer },
                    { value: 'header', label: copy.authHeader },
                  ]}
                />
              </Form.Item>
              {authType !== 'none' ? (
                <Form.Item name="authToken" label={copy.authToken}>
                  <Input.Password />
                </Form.Item>
              ) : null}
              {authType === 'header' ? (
                <Form.Item
                  name="authHeaderName"
                  label={copy.authHeaderName}
                  rules={[{ required: true }]}
                >
                  <Input placeholder="X-API-Key" />
                </Form.Item>
              ) : null}
              <Form.Item
                name="responseMode"
                label={copy.responseMode}
                rules={[{ required: true }]}
              >
                <Select
                  options={[
                    { value: 'prediction_values', label: copy.responsePredictionValues },
                    { value: 'table_rows', label: copy.responseTableRows },
                  ]}
                />
              </Form.Item>
              <Form.Item
                name="defaultPredictionColumn"
                label={copy.defaultPredictionColumn}
                rules={[{ required: true }]}
              >
                <Input placeholder="prediction" />
              </Form.Item>
            </div>
            <Form.Item name="description" label={copy.description}>
              <TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
            </Form.Item>
            <Form.Item
              name="defaultParametersJson"
              label={copy.defaultParameters}
              rules={[{ required: true }]}
            >
              <TextArea autoSize={{ minRows: 4, maxRows: 8 }} />
            </Form.Item>
            <Button type="primary" loading={submitting} onClick={() => void onCreateCustomModel()}>
              {copy.createAction}
            </Button>
          </Form>
        </LayeredPanelCard>
      ) : null}

      <LayeredPanelCard
        className="panel-card"
        kicker={copy.libraryTitle}
        title={copy.libraryTitle}
        summary={<div>{copy.libraryCopy}</div>}
        defaultExpanded
        expandLabel={copy.expandDetails}
        collapseLabel={copy.collapseDetails}
      >
        {visibleModelVersions.length ? (
          <div className="model-catalog-grid">
            {visibleModelVersions.map((modelVersion) => {
              const metadata = modelVersion.metadata ?? {};
              const apiConfig = metadataObject(metadata, 'api_config');
              const trainingMetrics = metadataObject(metadata, 'training_metrics');
              const isOwner = currentUser?.id === modelVersion.ownerUserId;
              const canDelete = canManage && (currentUser?.role === 'ADMIN' || isOwner);
              const featureNames = modelVersion.featureNames ?? [];
              const description =
                metadataString(metadata, 'description') ??
                metadataString(metadata, 'summary') ??
                copy.noDescription;

              return (
                <LayeredPanelCard
                  key={modelVersion.id}
                  className="model-card model-asset-card"
                  kicker={sourceLabel(modelVersion.sourceType, copy)}
                  title={`${modelVersion.modelName ?? modelVersion.modelId} / ${modelVersion.version}`}
                  summary={
                    <div className="model-card-summary">
                      <Paragraph className="model-card-description">{description}</Paragraph>
                      <Space wrap size={[8, 8]}>
                        <Tag color="blue">{modelVersion.framework}</Tag>
                        {modelVersion.algorithmKey ? (
                          <Tag color="geekblue">{modelVersion.algorithmKey}</Tag>
                        ) : null}
                        <Tag color={sourceColor(modelVersion.sourceType)}>
                          {sourceLabel(modelVersion.sourceType, copy)}
                        </Tag>
                        <Tag color={visibilityColor(modelVersion.visibility)}>
                          {visibilityLabel(modelVersion.visibility, copy)}
                        </Tag>
                      </Space>
                      <div className="model-card-keyfacts">
                        <div className="model-keyfact">
                          <Text type="secondary">{copy.taskType}</Text>
                          <strong>{modelVersion.taskType || '-'}</strong>
                        </div>
                        <div className="model-keyfact">
                          <Text type="secondary">{copy.executionMode}</Text>
                          <strong>{executionModeLabel(modelVersion.executionMode, copy)}</strong>
                        </div>
                        <div className="model-keyfact">
                          <Text type="secondary">{copy.createdAt}</Text>
                          <strong>{formatDateTime(locale, modelVersion.createdAt)}</strong>
                        </div>
                      </div>
                    </div>
                  }
                  extra={
                    <Space wrap>
                      <Button
                        onClick={() => token && void downloadModelVersion(token, modelVersion.id)}
                      >
                        {copy.download}
                      </Button>
                      {canDelete ? (
                        <Button danger onClick={() => token && void onDeleteModel(modelVersion.id)}>
                          {copy.delete}
                        </Button>
                      ) : null}
                    </Space>
                  }
                  expandLabel={copy.expandDetails}
                  collapseLabel={copy.collapseDetails}
                >
                  <div className="model-detail-stack">
                    <Descriptions
                      size="small"
                      column={1}
                      items={[
                        {
                          key: 'owner',
                          label: copy.owner,
                          children: modelVersion.ownerDisplayName ?? platformOwnerLabel,
                        },
                        {
                          key: 'framework',
                          label: copy.framework,
                          children: modelVersion.framework || '-',
                        },
                        {
                          key: 'algorithm',
                          label: copy.algorithm,
                          children: modelVersion.algorithmKey || '-',
                        },
                        {
                          key: 'visibility',
                          label: copy.visibility,
                          children: visibilityLabel(modelVersion.visibility, copy),
                        },
                        {
                          key: 'artifactFormat',
                          label: copy.artifactFormat,
                          children: modelVersion.artifactFormat || '-',
                        },
                        {
                          key: 'source',
                          label: copy.source,
                          children: sourceLabel(modelVersion.sourceType, copy),
                        },
                      ]}
                    />

                    <div className="model-section-block">
                      <Text className="panel-kicker">{copy.featureNames}</Text>
                      <div className="model-feature-list">
                        {featureNames.length ? (
                          featureNames.map((item) => (
                            <Tag key={`${modelVersion.id}-${item}`} bordered={false} className="workflow-type-tag">
                              {item}
                            </Tag>
                          ))
                        ) : (
                          <Text type="secondary">-</Text>
                        )}
                      </div>
                    </div>

                    <div className="model-json-grid">
                      <div className="model-json-panel">
                        <Text className="panel-kicker">{copy.defaultParameters}</Text>
                        <pre className="json-block">
                          {JSON.stringify(modelVersion.defaultParameters ?? {}, null, 2)}
                        </pre>
                      </div>
                      {trainingMetrics ? (
                        <div className="model-json-panel">
                          <Text className="panel-kicker">{copy.metrics}</Text>
                          <pre className="json-block">{JSON.stringify(trainingMetrics, null, 2)}</pre>
                        </div>
                      ) : null}
                      {apiConfig ? (
                        <div className="model-json-panel">
                          <Text className="panel-kicker">{copy.apiConfig}</Text>
                          <pre className="json-block">{JSON.stringify(apiConfig, null, 2)}</pre>
                        </div>
                      ) : null}
                      <div className="model-json-panel model-json-panel-wide">
                        <Text className="panel-kicker">{copy.metadata}</Text>
                        <pre className="json-block">{JSON.stringify(metadata, null, 2)}</pre>
                      </div>
                    </div>
                  </div>
                </LayeredPanelCard>
              );
            })}
          </div>
        ) : (
          <Empty description={copy.noModels} />
        )}
      </LayeredPanelCard>
    </div>
  );
}
