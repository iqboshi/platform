import type { PlatformDataSnapshot } from '@/lib/api';

import {
  App,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';
import { useMemo, useState } from 'react';

import { isApiError } from '@/auth/errors';
import { useAuth } from '@/auth/useAuth';
import { useI18n } from '@/i18n/useI18n';
import {
  createCustomApiModel,
  deleteModelVersion,
  downloadModelVersion,
} from '@/lib/api';

const { Paragraph, Text, Title } = Typography;
const { TextArea } = Input;

function sourceLabel(sourceType?: string): string {
  if (sourceType === 'trained') return 'Platform Trained';
  if (sourceType === 'custom_api') return 'Custom API';
  if (sourceType === 'seeded') return 'Seeded';
  return 'Uploaded';
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

  const authType = Form.useWatch('authType', form) ?? 'none';
  const copy = useMemo(
    () =>
      locale === 'zh-CN'
        ? {
            customTitle: '创建自定义 API 模型',
            customCopy:
              '复杂模型不部署在平台后端时，可在这里登记外部 HTTP API。工作流里的“自定义 API 预测”节点会统一调用这个模型资产。',
            modelName: '模型名称',
            version: '版本',
            description: '描述',
            endpointUrl: '接口地址',
            timeoutSeconds: '超时（秒）',
            authType: '认证方式',
            authToken: '认证令牌',
            authHeaderName: '自定义请求头',
            responseMode: '响应格式',
            defaultPredictionColumn: '默认预测列',
            defaultParameters: '默认调用参数 JSON',
            createAction: '创建自定义模型',
            createSuccess: '自定义 API 模型已创建。',
            deleteSuccess: '模型资产已删除。',
            invalidDefaults: '默认调用参数必须是 JSON 对象。',
            trainedTitle: '平台模型资产',
            trainedCopy:
              '这里会展示平台训练得到的模型权重和你创建的自定义 API 模型。预测节点只能从这些平台资产中选择。',
            noModels: '当前还没有可用模型资产。',
            download: '下载',
            delete: '删除',
            featureNames: '特征列',
            defaultParams: '默认参数',
            metadata: '元数据',
            metrics: '训练指标',
            owner: '所有者',
            createdAt: '创建时间',
            framework: '框架',
            authNone: '无认证',
            authBearer: 'Bearer',
            authHeader: '自定义请求头',
            responsePredictionValues: '预测值数组',
            responseTableRows: '结果行对象',
          }
        : {
            customTitle: 'Create Custom API Model',
            customCopy:
              'When a complex model is hosted outside this platform, register its HTTP API here. The workflow “Custom API Predict” node will call this saved model asset.',
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
            createSuccess: 'Custom API model created.',
            deleteSuccess: 'Model asset deleted.',
            invalidDefaults: 'Default call parameters must be a JSON object.',
            trainedTitle: 'Platform Model Assets',
            trainedCopy:
              'This page shows platform-trained model weights and your custom API model assets. Prediction nodes can only select from these platform assets.',
            noModels: 'No model assets are available yet.',
            download: 'Download',
            delete: 'Delete',
            featureNames: 'Feature names',
            defaultParams: 'Default parameters',
            metadata: 'Metadata',
            metrics: 'Training metrics',
            owner: 'Owner',
            createdAt: 'Created at',
            framework: 'Framework',
            authNone: 'None',
            authBearer: 'Bearer',
            authHeader: 'Custom header',
            responsePredictionValues: 'Prediction values array',
            responseTableRows: 'Table rows',
          },
    [locale],
  );

  const canManage = hasPermission('model.manage');
  const visibleModelVersions = useMemo(
    () => snapshot.modelVersions,
    [snapshot.modelVersions],
  );

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
      <div className="section-header">
        <div className="panel-kicker">{t('models.kicker')}</div>
        <h2 className="section-title">{t('models.title')}</h2>
        <Paragraph className="section-copy">{t('models.copy')}</Paragraph>
      </div>

      {canManage ? (
        <Card className="panel-card" variant="borderless">
          <Title level={4}>{copy.customTitle}</Title>
          <Paragraph>{copy.customCopy}</Paragraph>
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
            <Form.Item name="modelName" label={copy.modelName} rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="version" label={copy.version} rules={[{ required: true }]}>
              <Input placeholder="1.0.0" />
            </Form.Item>
            <Form.Item name="description" label={copy.description}>
              <TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
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
            <Form.Item
              name="defaultParametersJson"
              label={copy.defaultParameters}
              rules={[{ required: true }]}
            >
              <TextArea autoSize={{ minRows: 4, maxRows: 8 }} />
            </Form.Item>
            <Button
              type="primary"
              loading={submitting}
              onClick={() => void onCreateCustomModel()}
            >
              {copy.createAction}
            </Button>
          </Form>
        </Card>
      ) : null}

      <Card className="panel-card" variant="borderless">
        <Title level={4}>{copy.trainedTitle}</Title>
        <Paragraph>{copy.trainedCopy}</Paragraph>

        {visibleModelVersions.length ? (
          <Row gutter={[20, 20]}>
            {visibleModelVersions.map((modelVersion) => {
              const metadata = modelVersion.metadata ?? {};
              const apiConfig =
                metadata.api_config && typeof metadata.api_config === 'object' && !Array.isArray(metadata.api_config)
                  ? (metadata.api_config as Record<string, unknown>)
                  : undefined;
              const trainingMetrics =
                metadata.training_metrics && typeof metadata.training_metrics === 'object' && !Array.isArray(metadata.training_metrics)
                  ? (metadata.training_metrics as Record<string, unknown>)
                  : {};
              const isOwner = currentUser?.id === modelVersion.ownerUserId;
              const canDelete = canManage && (currentUser?.role === 'ADMIN' || isOwner);

              return (
                <Col xs={24} lg={12} key={modelVersion.id}>
                  <Card className="panel-card model-card" variant="borderless">
                    <div className="model-card-head">
                      <div>
                        <Text className="panel-kicker">
                          {sourceLabel(modelVersion.sourceType)}
                        </Text>
                        <Title level={3}>
                          {modelVersion.modelName ?? modelVersion.modelId} / {modelVersion.version}
                        </Title>
                      </div>
                      <div className="model-card-tags">
                        <Tag color="blue">{modelVersion.framework}</Tag>
                        {modelVersion.algorithmKey ? (
                          <Tag color="geekblue">{modelVersion.algorithmKey}</Tag>
                        ) : null}
                        {modelVersion.sourceType ? (
                          <Tag color={modelVersion.sourceType === 'custom_api' ? 'purple' : 'green'}>
                            {modelVersion.sourceType}
                          </Tag>
                        ) : null}
                      </div>
                    </div>

                    <Paragraph>
                      {copy.framework}: <strong>{modelVersion.framework}</strong>
                    </Paragraph>
                    <Paragraph>
                      {copy.createdAt}: <code>{modelVersion.createdAt}</code>
                    </Paragraph>
                    {modelVersion.ownerDisplayName ? (
                      <Paragraph>
                        {copy.owner}: <strong>{modelVersion.ownerDisplayName}</strong>
                      </Paragraph>
                    ) : null}

                    <Space wrap>
                      <Button onClick={() => token && void downloadModelVersion(token, modelVersion.id)}>
                        {copy.download}
                      </Button>
                      {canDelete ? (
                        <Button danger onClick={() => token && void onDeleteModel(modelVersion.id)}>
                          {copy.delete}
                        </Button>
                      ) : null}
                    </Space>

                    <div className="page-stack" style={{ marginTop: 18 }}>
                      <div>
                        <Text className="panel-kicker">{copy.featureNames}</Text>
                        <div className="workflow-node-parameter-preview">
                          {(modelVersion.featureNames ?? []).length ? (
                            (modelVersion.featureNames ?? []).map((item) => (
                              <Tag key={item} bordered={false} className="workflow-type-tag">
                                {item}
                              </Tag>
                            ))
                          ) : (
                            <Text type="secondary">-</Text>
                          )}
                        </div>
                      </div>
                      <div>
                        <Text className="panel-kicker">{copy.defaultParams}</Text>
                        <pre className="json-block">
                          {JSON.stringify(modelVersion.defaultParameters ?? {}, null, 2)}
                        </pre>
                      </div>
                      {Object.keys(trainingMetrics).length ? (
                        <div>
                          <Text className="panel-kicker">{copy.metrics}</Text>
                          <pre className="json-block">{JSON.stringify(trainingMetrics, null, 2)}</pre>
                        </div>
                      ) : null}
                      {apiConfig ? (
                        <div>
                          <Text className="panel-kicker">API Config</Text>
                          <pre className="json-block">{JSON.stringify(apiConfig, null, 2)}</pre>
                        </div>
                      ) : null}
                      <div>
                        <Text className="panel-kicker">{copy.metadata}</Text>
                        <pre className="json-block">{JSON.stringify(metadata, null, 2)}</pre>
                      </div>
                    </div>
                  </Card>
                </Col>
              );
            })}
          </Row>
        ) : (
          <Paragraph>{copy.noModels}</Paragraph>
        )}
      </Card>
    </div>
  );
}
