import type { ModelAlgorithmKey } from '@platform/types';

import type { PlatformDataSnapshot } from '@/lib/api';

import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Form,
  Input,
  Row,
  Select,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';

import { isApiError } from '@/auth/errors';
import { useAuth } from '@/auth/useAuth';
import { useI18n } from '@/i18n/useI18n';
import { uploadModelPackage } from '@/lib/api';

const { Paragraph, Text, Title } = Typography;
const { TextArea } = Input;

const algorithmOptions: { label: string; value: ModelAlgorithmKey }[] = [
  { label: 'Linear Regression', value: 'linear_regression' },
  { label: 'SVM Regression', value: 'svm_regression' },
  { label: 'Random Forest', value: 'random_forest_regression' },
];

const defaultParametersByAlgorithm: Record<ModelAlgorithmKey, Record<string, unknown>> = {
  linear_regression: {
    roundDigits: 4,
  },
  svm_regression: {
    roundDigits: 4,
    cacheSize: 200,
  },
  random_forest_regression: {
    roundDigits: 4,
    nJobs: 1,
  },
};

const exampleByAlgorithm: Record<ModelAlgorithmKey, string> = {
  linear_regression: `{
  "kind": "tabular_model",
  "model_type": "linear_regression",
  "task_type": "regression",
  "features": ["feature_a", "feature_b"],
  "intercept": 1.25,
  "coefficients": {
    "feature_a": 0.8,
    "feature_b": -0.3
  },
  "prediction_column": "prediction",
  "default_parameters": {
    "round_digits": 4
  }
}`,
  svm_regression: `Upload a trained scikit-learn SVR model as .joblib or .pkl.

Required metadata:
- feature names
- default runtime parameters

Example defaults:
{
  "roundDigits": 4,
  "cacheSize": 200
}`,
  random_forest_regression: `Upload a trained scikit-learn RandomForestRegressor model as .joblib or .pkl.

Required metadata:
- feature names
- default runtime parameters

Example defaults:
{
  "roundDigits": 4,
  "nJobs": 1
}`,
};

function algorithmLabel(algorithmKey?: string): string {
  return algorithmOptions.find((item) => item.value === algorithmKey)?.label ?? algorithmKey ?? 'Generic';
}

function inferFramework(file: File, algorithmKey: ModelAlgorithmKey): string {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.json')) {
    return 'json';
  }
  if (lowerName.endsWith('.joblib') || lowerName.endsWith('.pkl')) {
    return 'scikit-learn';
  }
  return algorithmKey === 'linear_regression' ? 'json' : 'scikit-learn';
}

function parseFeatureNames(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function acceptedFilesForAlgorithm(algorithmKey: ModelAlgorithmKey): string {
  if (algorithmKey === 'linear_regression') {
    return '.json,.joblib,.pkl,application/json';
  }
  return '.joblib,.pkl';
}

function buildMetadataTemplate(algorithmKey: ModelAlgorithmKey): Record<string, unknown> {
  return {
    templateKind: 'tabular_model_upload',
    algorithmKey,
    modelName: `sample-${algorithmKey}`,
    version: '1.0.0',
    taskType: 'regression',
    featureNames: ['feature_a', 'feature_b'],
    defaultParameters: defaultParametersByAlgorithm[algorithmKey],
  };
}

function downloadTextFile(fileName: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ModelsPage({
  snapshot,
  onRefresh,
}: {
  snapshot: PlatformDataSnapshot;
  onRefresh: () => Promise<void>;
}) {
  const { message } = App.useApp();
  const { hasPermission, token } = useAuth();
  const { locale, t } = useI18n();
  const [form] = Form.useForm<{
    algorithmKey: ModelAlgorithmKey;
    modelName: string;
    version: string;
    taskType: string;
    featureNames: string;
    defaultParametersJson: string;
  }>();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const skipAutoDefaultsRef = useRef(false);

  const algorithmKey = Form.useWatch('algorithmKey', form) ?? 'linear_regression';
  const copy = useMemo(
    () =>
      locale === 'zh-CN'
        ? {
            uploadTitle: '上传原子化回归模型',
            uploadHint:
              '线性回归支持 JSON 包或 joblib；SVM/随机森林使用 scikit-learn joblib/pkl。特征名和默认运行参数统一随模型版本保存。',
            algorithm: '算法类型',
            modelName: '模型名称',
            version: '版本号',
            taskType: '任务类型',
            featureNames: '特征列',
            featureNamesPlaceholder: 'feature_a, feature_b, feature_c',
            defaultParameters: '默认运行参数 JSON',
            uploadAction: '上传模型',
            uploadSuccess: '模型上传成功',
            fileRequired: '请选择模型文件',
            invalidDefaults: '默认参数必须是 JSON 对象',
            packageFormat: '当前算法支持格式',
            packageMeta: '模型元数据',
            defaultParams: '默认参数',
            featureNamesLabel: '特征列',
            artifactFormat: '制品格式',
            trainingHyperparameters: '训练超参数',
            supportedFormats:
              algorithmKey === 'linear_regression'
                ? 'Linear Regression: .json / .joblib / .pkl'
                : algorithmKey === 'svm_regression'
                  ? 'SVM Regression: .joblib / .pkl'
                  : 'Random Forest: .joblib / .pkl',
          }
        : {
            uploadTitle: 'Upload Atomic Regression Models',
            uploadHint:
              'Linear regression supports JSON packages or joblib. SVM and random forest use scikit-learn joblib/pkl. Feature names and default runtime parameters are stored with each model version.',
            algorithm: 'Algorithm',
            modelName: 'Model name',
            version: 'Version',
            taskType: 'Task type',
            featureNames: 'Feature names',
            featureNamesPlaceholder: 'feature_a, feature_b, feature_c',
            defaultParameters: 'Default runtime parameters JSON',
            uploadAction: 'Upload model',
            uploadSuccess: 'Model uploaded successfully.',
            fileRequired: 'Select a model file.',
            invalidDefaults: 'Default parameters must be a JSON object.',
            packageFormat: 'Supported format',
            packageMeta: 'Model metadata',
            defaultParams: 'Default parameters',
            featureNamesLabel: 'Feature names',
            artifactFormat: 'Artifact format',
            trainingHyperparameters: 'Training hyperparameters',
            supportedFormats:
              algorithmKey === 'linear_regression'
                ? 'Linear Regression: .json / .joblib / .pkl'
                : algorithmKey === 'svm_regression'
                  ? 'SVM Regression: .joblib / .pkl'
                  : 'Random Forest: .joblib / .pkl',
          },
    [algorithmKey, locale],
  );

  useEffect(() => {
    if (skipAutoDefaultsRef.current) {
      skipAutoDefaultsRef.current = false;
      return;
    }
    form.setFieldsValue({
      algorithmKey,
      taskType: 'regression',
      defaultParametersJson: JSON.stringify(
        defaultParametersByAlgorithm[algorithmKey],
        null,
        2,
      ),
    });
  }, [algorithmKey, form]);

  const onDownloadTemplate = () => {
    downloadTextFile(
      `${algorithmKey}-upload-template.json`,
      JSON.stringify(buildMetadataTemplate(algorithmKey), null, 2),
      'application/json;charset=utf-8',
    );
  };

  const onImportTemplate = async (file: File) => {
    const payload = JSON.parse(await file.text()) as Record<string, unknown>;
    if (
      payload.templateKind !== 'tabular_model_upload' ||
      typeof payload.algorithmKey !== 'string' ||
      typeof payload.modelName !== 'string' ||
      typeof payload.version !== 'string' ||
      typeof payload.taskType !== 'string' ||
      !Array.isArray(payload.featureNames) ||
      payload.featureNames.some((item) => typeof item !== 'string') ||
      payload.defaultParameters === null ||
      Array.isArray(payload.defaultParameters) ||
      typeof payload.defaultParameters !== 'object'
    ) {
      throw new Error('Invalid upload template JSON.');
    }

    skipAutoDefaultsRef.current = true;
    form.setFieldsValue({
      algorithmKey: payload.algorithmKey as ModelAlgorithmKey,
      modelName: payload.modelName,
      version: payload.version,
      taskType: payload.taskType,
      featureNames: (payload.featureNames as string[]).join(', '),
      defaultParametersJson: JSON.stringify(payload.defaultParameters, null, 2),
    });
  };

  const onUpload = async () => {
    if (!token || !hasPermission('model.manage')) {
      return;
    }
    if (!selectedFile) {
      message.warning(copy.fileRequired);
      return;
    }

    try {
      setUploading(true);
      const values = await form.validateFields();
      const parsedDefaults = JSON.parse(values.defaultParametersJson) as unknown;
      if (
        parsedDefaults === null ||
        Array.isArray(parsedDefaults) ||
        typeof parsedDefaults !== 'object'
      ) {
        throw new Error(copy.invalidDefaults);
      }

      await uploadModelPackage(token, {
        workspaceId: snapshot.workspace.id,
        modelName: values.modelName,
        version: values.version,
        algorithmKey: values.algorithmKey,
        taskType: values.taskType,
        framework: inferFramework(selectedFile, values.algorithmKey),
        featureNames: parseFeatureNames(values.featureNames),
        defaultParameters: parsedDefaults as Record<string, unknown>,
        file: selectedFile,
      });

      message.success(copy.uploadSuccess);
      form.resetFields();
      form.setFieldsValue({
        algorithmKey: 'linear_regression',
        taskType: 'regression',
        defaultParametersJson: JSON.stringify(
          defaultParametersByAlgorithm.linear_regression,
          null,
          2,
        ),
      });
      setSelectedFile(null);
      await onRefresh();
    } catch (error) {
      message.error(isApiError(error) ? error.message : (error as Error).message || t('error.request_failed'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="page-stack">
      <div className="section-header">
        <div className="panel-kicker">{t('models.kicker')}</div>
        <h2 className="section-title">{t('models.title')}</h2>
        <Paragraph className="section-copy">{t('models.copy')}</Paragraph>
      </div>

      {hasPermission('model.manage') ? (
        <Card className="panel-card" variant="borderless">
          <Row gutter={[20, 20]}>
            <Col xs={24} xl={12}>
              <Title level={4}>{copy.uploadTitle}</Title>
              <Paragraph>{copy.uploadHint}</Paragraph>
              <Alert
                className="panel-alert"
                type="info"
                showIcon
                message={copy.packageFormat}
                description={copy.supportedFormats}
              />
              <div className="section-actions">
                <Button onClick={onDownloadTemplate}>Download upload template</Button>
                <label className="workflow-toolbar-button">
                  Import filled template
                  <input
                    hidden
                    type="file"
                    accept=".json,application/json"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) {
                        return;
                      }
                      void onImportTemplate(file)
                        .then(() => {
                          message.success('Upload template imported.');
                        })
                        .catch((error: unknown) => {
                          message.error((error as Error).message || t('error.request_failed'));
                        });
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
              </div>
              <Form
                form={form}
                layout="vertical"
                initialValues={{
                  algorithmKey: 'linear_regression',
                  taskType: 'regression',
                  defaultParametersJson: JSON.stringify(
                    defaultParametersByAlgorithm.linear_regression,
                    null,
                    2,
                  ),
                }}
              >
                <Form.Item name="algorithmKey" label={copy.algorithm} rules={[{ required: true }]}>
                  <Select options={algorithmOptions} />
                </Form.Item>
                <Form.Item name="modelName" label={copy.modelName} rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="version" label={copy.version} rules={[{ required: true }]}>
                  <Input placeholder="1.0.0" />
                </Form.Item>
                <Form.Item name="taskType" label={copy.taskType} rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="featureNames" label={copy.featureNames}>
                  <TextArea
                    autoSize={{ minRows: 2, maxRows: 4 }}
                    placeholder={copy.featureNamesPlaceholder}
                  />
                </Form.Item>
                <Form.Item
                  name="defaultParametersJson"
                  label={copy.defaultParameters}
                  rules={[{ required: true }]}
                >
                  <TextArea autoSize={{ minRows: 6, maxRows: 10 }} />
                </Form.Item>
                <Form.Item label={t('common.file')} required>
                  <input
                    className="file-picker"
                    type="file"
                    accept={acceptedFilesForAlgorithm(algorithmKey)}
                    onChange={(event) => {
                      setSelectedFile(event.target.files?.[0] ?? null);
                    }}
                  />
                </Form.Item>
                <Button
                  type="primary"
                  loading={uploading}
                  disabled={!selectedFile}
                  onClick={() => void onUpload()}
                >
                  {copy.uploadAction}
                </Button>
              </Form>
            </Col>
            <Col xs={24} xl={12}>
              <Title level={4}>{copy.packageFormat}</Title>
              <pre className="json-block">{exampleByAlgorithm[algorithmKey]}</pre>
            </Col>
          </Row>
        </Card>
      ) : null}

      <Row gutter={[20, 20]}>
        {snapshot.modelVersions.map((modelVersion) => {
          const metadata = modelVersion.metadata ?? {};
          const trainingHyperparameters =
            (metadata.training_hyperparameters as Record<string, unknown> | undefined) ?? {};

          return (
            <Col xs={24} lg={12} key={modelVersion.id}>
              <Card className="panel-card model-card" variant="borderless">
                <div className="model-card-head">
                  <div>
                    <Text className="panel-kicker">{t('models.versionKicker')}</Text>
                    <Title level={3}>
                      {modelVersion.modelName ?? modelVersion.modelId} / {modelVersion.version}
                    </Title>
                  </div>
                  <div className="model-card-tags">
                    <Tag color="blue">{modelVersion.framework}</Tag>
                    {modelVersion.algorithmKey ? (
                      <Tag color="geekblue">{algorithmLabel(modelVersion.algorithmKey)}</Tag>
                    ) : null}
                  </div>
                </div>
                <Paragraph>
                  {t('models.taskType')}: <strong>{modelVersion.taskType}</strong>
                </Paragraph>
                <Paragraph>
                  {copy.artifactFormat}:{' '}
                  <code>{modelVersion.artifactFormat ?? 'unknown'}</code>
                </Paragraph>
                <Paragraph>
                  {t('models.modelId')}: <code>{modelVersion.modelId}</code>
                </Paragraph>
                <Paragraph>
                  {t('models.createdAt')}: <code>{modelVersion.createdAt}</code>
                </Paragraph>

                <div className="page-stack">
                  <div>
                    <Text className="panel-kicker">{copy.featureNamesLabel}</Text>
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
                  <div>
                    <Text className="panel-kicker">{copy.trainingHyperparameters}</Text>
                    <pre className="json-block">
                      {JSON.stringify(trainingHyperparameters, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <Text className="panel-kicker">{copy.packageMeta}</Text>
                    <pre className="json-block">{JSON.stringify(metadata, null, 2)}</pre>
                  </div>
                </div>
              </Card>
            </Col>
          );
        })}
      </Row>
    </div>
  );
}
