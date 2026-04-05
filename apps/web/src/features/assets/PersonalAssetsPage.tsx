import type { AssetOverview, PlatformDataSnapshot } from '@/lib/api';
import type { AssetScope, DatasetKind } from '@platform/types';

import {
  App,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { isApiError } from '@/auth/errors';
import { useAuth } from '@/auth/useAuth';
import { useI18n } from '@/i18n/useI18n';
import {
  deleteDataset,
  deleteGeeCredential,
  deleteModelVersion,
  deleteWorkflowVersion,
  setPlatformDefaultGeeCredential,
  downloadDatasetVersion,
  downloadModelVersion,
  downloadWorkflowVersion,
  createGeeCredential,
  importWorkflowVersion,
  loadAssetOverview,
  updateDataset,
  uploadDataset,
} from '@/lib/api';
import { datasetKindKey, datasetStatusKey, workflowRunStatusKey } from '@/lib/i18n-helpers';
import { parseImportedWorkflowGraph } from '@/lib/workflow-import';
import { downloadUploadTemplate } from '../datasets/upload-templates';

const { Paragraph } = Typography;

function getMetadataString(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key];
  return typeof value === 'string' ? value : '';
}

function getMetadataNumber(metadata: Record<string, unknown>, key: string): number | undefined {
  const value = metadata[key];
  return typeof value === 'number' ? value : undefined;
}

function getMetadataStringList(metadata: Record<string, unknown>, key: string): string[] {
  const value = metadata[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function getSampleRecord(metadata: Record<string, unknown>): Record<string, unknown> | undefined {
  const direct = metadata.sample_record;
  if (typeof direct === 'object' && direct !== null && !Array.isArray(direct)) {
    return direct as Record<string, unknown>;
  }

  const rows = metadata.sample_rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return undefined;
  }
  const first = rows[0];
  return typeof first === 'object' && first !== null && !Array.isArray(first)
    ? (first as Record<string, unknown>)
    : undefined;
}

interface UploadFormValues {
  datasetName: string;
  description?: string;
  kind: DatasetKind;
}

interface RenameFormValues {
  datasetName: string;
  description?: string;
  originalFileName?: string;
  contentType?: string;
  rowCount?: string;
  columnsText?: string;
  sampleRecordJson?: string;
}

interface GeeCredentialFormValues {
  name: string;
  description?: string;
  projectId?: string;
  serviceAccountJson: string;
}

export function PersonalAssetsPage({
  snapshot,
  onRefresh,
}: {
  snapshot: PlatformDataSnapshot;
  onRefresh: () => Promise<void>;
}) {
  const { message, modal } = App.useApp();
  const { currentUser, token } = useAuth();
  const { locale, t } = useI18n();
  const [scope, setScope] = useState<AssetScope>('mine');
  const [overview, setOverview] = useState<AssetOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [credentialOpen, setCredentialOpen] = useState(false);
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadForm] = Form.useForm<UploadFormValues>();
  const [credentialForm] = Form.useForm<GeeCredentialFormValues>();
  const [renameForm] = Form.useForm<RenameFormValues>();
  const selectedUploadKind = Form.useWatch('kind', uploadForm) ?? 'table';

  const isAdmin = currentUser?.role === 'ADMIN';
  const geeCopy =
    locale === 'zh-CN'
      ? {
          tab: 'GEE 凭据',
          add: '新增 GEE 凭据',
          name: '名称',
          project: '项目 ID',
          email: '服务账号',
          description: '说明',
          serviceAccountJson: 'Service Account JSON',
          createTitle: '新增 GEE 凭据',
          createSuccess: 'GEE 凭据已保存。',
          deleteTitle: '删除 GEE 凭据',
          deleteBody: '删除后，该凭据将不能再被工作流节点引用。',
          deleteSuccess: 'GEE 凭据已删除。',
          empty: '当前范围下没有 GEE 凭据。',
        }
      : {
          tab: 'GEE Credentials',
          add: 'Add GEE Credential',
          name: 'Name',
          project: 'Project ID',
          email: 'Service Account',
          description: 'Description',
          serviceAccountJson: 'Service Account JSON',
          createTitle: 'Create GEE Credential',
          createSuccess: 'GEE credential saved.',
          deleteTitle: 'Delete GEE credential',
          deleteBody: 'After deletion, workflow nodes can no longer use this credential.',
          deleteSuccess: 'GEE credential deleted.',
          empty: 'No GEE credentials found for the current scope.',
        };
  const geePlatformCopy =
    locale === 'zh-CN'
      ? {
          platformDefault: '平台默认',
          setPlatformDefault: '设为平台默认',
          platformDefaultSet: '已设为平台默认凭据。',
        }
      : {
          platformDefault: 'Platform Default',
          setPlatformDefault: 'Set As Platform Default',
          platformDefaultSet: 'Platform default GEE credential updated.',
        };

  const refreshAssets = useCallback(
    async (nextScope: AssetScope = scope) => {
      if (!token) {
        return;
      }

      try {
        setLoading(true);
        const payload = await loadAssetOverview(token, nextScope);
        setOverview(payload);
      } catch (error) {
        message.error(isApiError(error) ? error.message : t('error.request_failed'));
      } finally {
        setLoading(false);
      }
    },
    [message, scope, t, token],
  );

  useEffect(() => {
    if (!token) {
      return;
    }
    void refreshAssets(scope);
  }, [refreshAssets, scope, token]);

  const latestVersionByDatasetId = useMemo(() => {
    const map = new Map<string, AssetOverview['datasetVersions'][number]>();
    overview?.datasets.forEach((dataset) => {
      const version =
        overview.datasetVersions.find((item) => item.id === dataset.latestVersionId) ??
        overview.datasetVersions.find((item) => item.datasetId === dataset.id);
      if (version) {
        map.set(dataset.id, version);
      }
    });
    return map;
  }, [overview]);

  const datasetRows = useMemo(() => {
    if (!overview) {
      return [];
    }
    return overview.datasets.map((dataset) => {
      const latestVersion = latestVersionByDatasetId.get(dataset.id);
      const isResult = Boolean(
        latestVersion?.metadata['workflow_run_id'] || latestVersion?.metadata['source_run_id'],
      );
      return {
        ...dataset,
        assetType: isResult ? 'result' : 'dataset',
        latestVersion,
      };
    });
  }, [latestVersionByDatasetId, overview]);

  const openRenameModal = (record: (typeof datasetRows)[number]) => {
    const metadata = (record.latestVersion?.metadata as Record<string, unknown> | undefined) ?? {};
    const sampleRecord = getSampleRecord(metadata);

    renameForm.setFieldsValue({
      datasetName: record.name,
      description: record.description ?? '',
      originalFileName: getMetadataString(metadata, 'original_file_name'),
      contentType: getMetadataString(metadata, 'content_type'),
      rowCount:
        getMetadataNumber(metadata, 'row_count') !== undefined
          ? String(getMetadataNumber(metadata, 'row_count'))
          : '',
      columnsText: getMetadataStringList(metadata, 'columns').join('\n'),
      sampleRecordJson: sampleRecord ? JSON.stringify(sampleRecord, null, 2) : '',
    });
    setRenameTargetId(record.id);
  };

  const handleUpload = async () => {
    if (!token || !selectedFile) {
      message.warning(t('datasets.fileRequired'));
      return;
    }

    try {
      setSubmitting(true);
      const values = await uploadForm.validateFields();
      await uploadDataset(token, {
        workspaceId: snapshot.workspace.id,
        datasetName: values.datasetName,
        description: values.description,
        kind: values.kind,
        file: selectedFile,
      });
      message.success(t('assets.datasetUploaded'));
      setUploadOpen(false);
      setSelectedFile(null);
      uploadForm.resetFields();
      await Promise.all([refreshAssets(), onRefresh()]);
    } catch (error) {
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateGeeCredential = async () => {
    if (!token) {
      return;
    }

    try {
      setSubmitting(true);
      const values = await credentialForm.validateFields();
      await createGeeCredential(token, {
        workspaceId: snapshot.workspace.id,
        name: values.name,
        description: values.description,
        projectId: values.projectId,
        serviceAccountJson: values.serviceAccountJson,
      });
      message.success(geeCopy.createSuccess);
      setCredentialOpen(false);
      credentialForm.resetFields();
      await Promise.all([refreshAssets(), onRefresh()]);
    } catch (error) {
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRename = async () => {
    if (!token || !renameTargetId) {
      return;
    }

    try {
      setSubmitting(true);
      const values = await renameForm.validateFields();
      const rowCountText = values.rowCount?.trim() ?? '';
      if (rowCountText && !/^\d+$/.test(rowCountText)) {
        message.error(t('assets.rowCountInvalid'));
        return;
      }

      const columns = (values.columnsText ?? '')
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);

      const sampleRecordText = values.sampleRecordJson?.trim() ?? '';
      let sampleRecord: Record<string, unknown> | undefined;
      if (sampleRecordText) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(sampleRecordText);
        } catch {
          message.error(t('assets.sampleRecordInvalid'));
          return;
        }
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          message.error(t('assets.sampleRecordInvalid'));
          return;
        }
        sampleRecord = parsed as Record<string, unknown>;
      }

      await updateDataset(token, renameTargetId, {
        name: values.datasetName,
        description: values.description,
        originalFileName: values.originalFileName ?? '',
        contentType: values.contentType ?? '',
        rowCount: rowCountText ? Number(rowCountText) : undefined,
        columns,
        sampleRecord: sampleRecordText ? sampleRecord : {},
      });
      message.success(t('assets.datasetRenamed'));
      setRenameTargetId(null);
      await Promise.all([refreshAssets(), onRefresh()]);
    } catch (error) {
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteDataset = async (datasetId: string) => {
    if (!token) {
      return;
    }

    modal.confirm({
      title: t('assets.deleteDatasetTitle'),
      content: t('assets.deleteDatasetBody'),
      okButtonProps: { danger: true },
      onOk: async () => {
        await deleteDataset(token, datasetId);
        message.success(t('assets.datasetDeleted'));
        await Promise.all([refreshAssets(), onRefresh()]);
      },
    });
  };

  const handleDeleteGeeCredential = async (credentialId: string) => {
    if (!token) {
      return;
    }

    modal.confirm({
      title: geeCopy.deleteTitle,
      content: geeCopy.deleteBody,
      okButtonProps: { danger: true },
      onOk: async () => {
        await deleteGeeCredential(token, credentialId);
        message.success(geeCopy.deleteSuccess);
        await Promise.all([refreshAssets(), onRefresh()]);
      },
    });
  };

  const handleSetPlatformDefaultGeeCredential = async (credentialId: string) => {
    if (!token) {
      return;
    }

    try {
      await setPlatformDefaultGeeCredential(token, credentialId);
      message.success(geePlatformCopy.platformDefaultSet);
      await Promise.all([refreshAssets(), onRefresh()]);
    } catch (error) {
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    }
  };

  const handleToggleVisibility = async (datasetId: string, nextVisibility: 'public' | 'private') => {
    if (!token) {
      return;
    }

    try {
      await updateDataset(token, datasetId, { visibility: nextVisibility });
      message.success(t('assets.visibilityUpdated'));
      await Promise.all([refreshAssets(), onRefresh()]);
    } catch (error) {
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    }
  };

  const handleImportWorkflow = async (file: File) => {
    if (!token) {
      return;
    }

    try {
      const text = await file.text();
      const graph = parseImportedWorkflowGraph(text);
      await importWorkflowVersion(token, graph);
      message.success(t('assets.workflowImported'));
      await Promise.all([refreshAssets(), onRefresh()]);
    } catch {
      message.error(t('assets.workflowImportInvalid'));
    }
  };

  const datasetColumns = [
    { title: t('datasets.table.dataset'), dataIndex: 'name' },
    {
      title: t('assets.assetType'),
      dataIndex: 'assetType',
      render: (assetType: 'dataset' | 'result') => (
        <Tag color={assetType === 'result' ? 'purple' : 'green'}>
          {assetType === 'result' ? t('assets.assetTypeResult') : t('assets.assetTypeDataset')}
        </Tag>
      ),
    },
    {
      title: t('datasets.table.kind'),
      dataIndex: 'kind',
      render: (kind: DatasetKind) => t(datasetKindKey(kind)),
    },
    {
      title: t('assets.visibility'),
      dataIndex: 'visibility',
      render: (visibility: string | undefined) => (
        <Tag color={visibility === 'public' ? 'blue' : 'default'}>
          {visibility === 'public' ? t('assets.visibilityPublic') : t('assets.visibilityPrivate')}
        </Tag>
      ),
    },
    ...(isAdmin || scope === 'all'
      ? [
          {
            title: t('assets.owner'),
            dataIndex: 'ownerDisplayName',
            render: (value: string | undefined) => value ?? '-',
          },
        ]
      : []),
    {
      title: t('datasets.table.status'),
      dataIndex: 'status',
      render: (status: PlatformDataSnapshot['datasets'][number]['status']) => (
        <Tag color={status === 'ready' ? 'green' : 'processing'}>{t(datasetStatusKey(status))}</Tag>
      ),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: (typeof datasetRows)[number]) => {
        const latestVersionId = record.latestVersion?.id;
        return (
          <Space wrap>
            {latestVersionId ? (
              <Button type="link" onClick={() => token && void downloadDatasetVersion(token, latestVersionId)}>
                {t('common.download')}
              </Button>
            ) : null}
            <Button type="link" onClick={() => openRenameModal(record)}>
              {t('common.edit')}
            </Button>
            {isAdmin ? (
              <Button
                type="link"
                onClick={() =>
                  void handleToggleVisibility(
                    record.id,
                    record.visibility === 'public' ? 'private' : 'public',
                  )
                }
              >
                {record.visibility === 'public' ? t('assets.unpublish') : t('assets.publish')}
              </Button>
            ) : null}
            <Button danger type="link" onClick={() => void handleDeleteDataset(record.id)}>
              {t('common.delete')}
            </Button>
          </Space>
        );
      },
    },
  ];

  const workflowColumns = [
    { title: t('workflows.workflowVersion'), dataIndex: 'version' },
    ...(isAdmin || scope === 'all'
      ? [
          {
            title: t('assets.owner'),
            dataIndex: 'ownerDisplayName',
            render: (value: string | undefined) => value ?? '-',
          },
        ]
      : []),
    { title: t('common.createdAt'), dataIndex: 'createdAt' },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: NonNullable<typeof overview>['workflowVersions'][number]) => (
        <Space wrap>
          <Button
            type="link"
            onClick={() => token && void downloadWorkflowVersion(token, record.id)}
          >
            {t('common.download')}
          </Button>
          <Button
            danger
            type="link"
            onClick={() =>
              token &&
              void deleteWorkflowVersion(token, record.id)
                .then(async () => {
                  message.success(t('assets.workflowDeleted'));
                  await Promise.all([refreshAssets(), onRefresh()]);
                })
                .catch((error) => {
                  message.error(isApiError(error) ? error.message : t('error.request_failed'));
                })
            }
          >
            {t('common.delete')}
          </Button>
        </Space>
      ),
    },
  ];

  const runColumns = [
    { title: t('workflows.runId'), dataIndex: 'id' },
    {
      title: t('common.status'),
      dataIndex: 'status',
      render: (status: PlatformDataSnapshot['workflowRuns'][number]['status']) => (
        <Tag color={status === 'succeeded' ? 'green' : status === 'running' ? 'processing' : 'default'}>
          {t(workflowRunStatusKey(status))}
        </Tag>
      ),
    },
    { title: t('workflows.submittedBy'), dataIndex: 'submittedBy' },
    {
      title: t('assets.resultDataset'),
      dataIndex: 'resultDatasetVersionId',
      render: (value: string | undefined) =>
        value && token ? (
          <Button type="link" onClick={() => void downloadDatasetVersion(token, value)}>
            {t('common.download')}
          </Button>
        ) : (
          '-'
        ),
    },
  ];

  const modelColumns = [
    { title: t('datasets.table.dataset'), dataIndex: 'modelName', render: (value: string | undefined, record: NonNullable<typeof overview>['modelVersions'][number]) => value ?? record.modelId },
    {
      title: t('assets.assetType'),
      dataIndex: 'sourceType',
      render: (sourceType: string | undefined) => (
        <Tag color={sourceType === 'custom_api' ? 'purple' : sourceType === 'trained' ? 'green' : 'default'}>
          {sourceType ?? 'uploaded'}
        </Tag>
      ),
    },
    {
      title: t('assets.owner'),
      dataIndex: 'ownerDisplayName',
      render: (value: string | undefined) => value ?? '-',
    },
    { title: t('common.createdAt'), dataIndex: 'createdAt' },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: NonNullable<typeof overview>['modelVersions'][number]) => {
        const canDeleteModel = isAdmin || currentUser?.id === record.ownerUserId;
        return (
          <Space wrap>
            <Button
              type="link"
              onClick={() => token && void downloadModelVersion(token, record.id)}
            >
              {t('common.download')}
            </Button>
            {canDeleteModel ? (
              <Button
                danger
                type="link"
                onClick={() =>
                  token &&
                  void deleteModelVersion(token, record.id)
                    .then(async () => {
                      message.success(t('assets.modelDeleted'));
                      await Promise.all([refreshAssets(), onRefresh()]);
                    })
                    .catch((error) => {
                      message.error(isApiError(error) ? error.message : t('error.request_failed'));
                    })
                }
              >
                {t('common.delete')}
              </Button>
            ) : null}
          </Space>
        );
      },
    },
  ];

  const geeCredentialColumns = [
    {
      title: geeCopy.name,
      dataIndex: 'name',
      render: (
        value: string,
        record: NonNullable<typeof overview>['geeCredentials'][number],
      ) => (
        <Space wrap size={[8, 8]}>
          <span>{value}</span>
          {record.isPlatformDefault ? (
            <Tag color="gold">{geePlatformCopy.platformDefault}</Tag>
          ) : null}
        </Space>
      ),
    },
    { title: geeCopy.project, dataIndex: 'projectId', render: (value: string | undefined) => value ?? '-' },
    {
      title: geeCopy.email,
      dataIndex: 'serviceAccountEmail',
      render: (value: string | undefined) => value ?? '-',
    },
    ...(isAdmin || scope === 'all'
      ? [
          {
            title: t('assets.owner'),
            dataIndex: 'ownerDisplayName',
            render: (value: string | undefined) => value ?? '-',
          },
        ]
      : []),
    { title: t('common.createdAt'), dataIndex: 'createdAt' },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: NonNullable<typeof overview>['geeCredentials'][number]) => (
        <Space wrap>
          {isAdmin ? (
            <Button
              type="link"
              disabled={record.isPlatformDefault}
              onClick={() => void handleSetPlatformDefaultGeeCredential(record.id)}
            >
              {geePlatformCopy.setPlatformDefault}
            </Button>
          ) : null}
          <Button danger type="link" onClick={() => void handleDeleteGeeCredential(record.id)}>
            {t('common.delete')}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="page-stack">
      <div className="section-header">
        <div className="section-header-actions">
          <div>
            <div className="panel-kicker">{t('assets.kicker')}</div>
            <h2 className="section-title">{t('assets.title')}</h2>
            <Paragraph className="section-copy">{t('assets.copy')}</Paragraph>
          </div>
          <Space wrap className="section-actions">
            {isAdmin ? (
              <Select
                value={scope}
                onChange={(value) => setScope(value as AssetScope)}
                style={{ width: 180 }}
                options={[
                  { value: 'mine', label: t('assets.scopeMine') },
                  { value: 'all', label: t('assets.scopeAll') },
                ]}
              />
            ) : null}
            <Button onClick={() => setUploadOpen(true)}>{t('common.upload')}</Button>
            <Button onClick={() => setCredentialOpen(true)}>{geeCopy.add}</Button>
            <Button onClick={() => importInputRef.current?.click()}>{t('assets.importWorkflow')}</Button>
            <Button onClick={() => void refreshAssets()}>{t('common.refresh')}</Button>
          </Space>
        </div>
      </div>

      <input
        ref={importInputRef}
        hidden
        type="file"
        accept=".json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void handleImportWorkflow(file);
          }
          event.currentTarget.value = '';
        }}
      />

      <Card className="panel-card" variant="borderless">
        {overview ? (
          <Tabs
            items={[
              {
                key: 'datasets',
                label: t('assets.tabDatasets'),
                children: datasetRows.length ? (
                  <Table rowKey="id" loading={loading} pagination={false} columns={datasetColumns} dataSource={datasetRows} />
                ) : (
                  <Empty description={t('assets.empty')} />
                ),
              },
              {
                key: 'workflows',
                label: t('assets.tabWorkflows'),
                children: overview.workflowVersions.length ? (
                  <Table
                    rowKey="id"
                    loading={loading}
                    pagination={false}
                    columns={workflowColumns}
                    dataSource={overview.workflowVersions}
                  />
                ) : (
                  <Empty description={t('assets.empty')} />
                ),
              },
              {
                key: 'runs',
                label: t('assets.tabRuns'),
                children: overview.workflowRuns.length ? (
                  <Table
                    rowKey="id"
                    loading={loading}
                    pagination={false}
                    columns={runColumns}
                    dataSource={overview.workflowRuns}
                  />
                ) : (
                  <Empty description={t('assets.empty')} />
                ),
              },
              {
                key: 'models',
                label: t('assets.tabModels'),
                children: overview.modelVersions.length ? (
                  <Table
                    rowKey="id"
                    loading={loading}
                    pagination={false}
                    columns={modelColumns}
                    dataSource={overview.modelVersions}
                  />
                ) : (
                  <Empty description={t('assets.empty')} />
                ),
              },
              {
                key: 'gee-credentials',
                label: geeCopy.tab,
                children: overview.geeCredentials.length ? (
                  <Table
                    rowKey="id"
                    loading={loading}
                    pagination={false}
                    columns={geeCredentialColumns}
                    dataSource={overview.geeCredentials}
                  />
                ) : (
                  <Empty description={geeCopy.empty} />
                ),
              },
            ]}
          />
        ) : (
          <Empty description={t('common.loading')} />
        )}
      </Card>

      <Modal
        title={t('assets.uploadDataset')}
        open={uploadOpen}
        onCancel={() => {
          setUploadOpen(false);
          setSelectedFile(null);
        }}
        onOk={() => void handleUpload()}
        confirmLoading={submitting}
      >
        <Form
          form={uploadForm}
          layout="vertical"
          initialValues={{ datasetName: '', description: '', kind: 'table' }}
        >
          <div className="section-actions">
            <Button onClick={() => downloadUploadTemplate(selectedUploadKind)}>
              {t('assets.downloadTemplate')}
            </Button>
          </div>
          <Form.Item name="datasetName" label={t('datasets.table.dataset')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label={t('datasets.description')}>
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item name="kind" label={t('datasets.table.kind')} rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'raster', label: t('dataset.kind.raster') },
                { value: 'vector', label: t('dataset.kind.vector') },
                { value: 'table', label: t('dataset.kind.table') },
                { value: 'artifact', label: t('dataset.kind.artifact') },
              ]}
            />
          </Form.Item>
          <Form.Item label={t('common.file')} required>
            <input
              className="file-picker"
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setSelectedFile(file);
                if (file) {
                  uploadForm.setFieldValue('datasetName', file.name.replace(/\.[^.]+$/, ''));
                }
              }}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={geeCopy.createTitle}
        open={credentialOpen}
        onCancel={() => setCredentialOpen(false)}
        onOk={() => void handleCreateGeeCredential()}
        confirmLoading={submitting}
      >
        <Form
          form={credentialForm}
          layout="vertical"
          initialValues={{ name: '', description: '', projectId: '', serviceAccountJson: '' }}
        >
          <Form.Item name="name" label={geeCopy.name} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label={geeCopy.description}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="projectId" label={geeCopy.project}>
            <Input />
          </Form.Item>
          <Form.Item
            name="serviceAccountJson"
            label={geeCopy.serviceAccountJson}
            rules={[{ required: true }]}
          >
            <Input.TextArea rows={12} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('assets.editDataset')}
        className="asset-editor-modal"
        width={920}
        open={Boolean(renameTargetId)}
        onCancel={() => setRenameTargetId(null)}
        onOk={() => void handleRename()}
        confirmLoading={submitting}
      >
        <Form form={renameForm} layout="vertical">
          <div className="asset-editor-layout">
            <section className="asset-editor-section">
              <div className="asset-editor-section-title">{t('assets.basicInfoSection')}</div>
              <Paragraph className="asset-editor-section-copy">
                {t('assets.basicInfoCopy')}
              </Paragraph>
              <Form.Item
                name="datasetName"
                label={t('datasets.table.dataset')}
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>
              <Form.Item name="description" label={t('datasets.description')}>
                <Input.TextArea rows={5} />
              </Form.Item>
              <Form.Item name="originalFileName" label={t('datasets.originalFileName')}>
                <Input />
              </Form.Item>
              <Form.Item name="contentType" label={t('datasets.contentType')}>
                <Input />
              </Form.Item>
            </section>

            <section className="asset-editor-section">
              <div className="asset-editor-section-title">{t('assets.profileInfoSection')}</div>
              <Paragraph className="asset-editor-section-copy">
                {t('assets.profileInfoCopy')}
              </Paragraph>
              <Form.Item
                name="rowCount"
                label={t('datasets.rowCount')}
                extra={t('assets.rowCountHint')}
              >
                <Input />
              </Form.Item>
              <Form.Item
                name="columnsText"
                label={t('datasets.fields')}
                extra={t('assets.columnsHint')}
              >
                <Input.TextArea rows={5} />
              </Form.Item>
              <Form.Item
                name="sampleRecordJson"
                label={t('datasets.sampleRecord')}
                extra={t('assets.sampleRecordHint')}
              >
                <Input.TextArea rows={8} />
              </Form.Item>
            </section>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
