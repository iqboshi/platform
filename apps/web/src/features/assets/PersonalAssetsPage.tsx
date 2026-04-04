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
  deleteWorkflowVersion,
  downloadDatasetVersion,
  downloadWorkflowVersion,
  importWorkflowVersion,
  loadAssetOverview,
  updateDataset,
  uploadDataset,
} from '@/lib/api';
import { datasetKindKey, datasetStatusKey, workflowRunStatusKey } from '@/lib/i18n-helpers';
import { parseImportedWorkflowGraph } from '@/lib/workflow-import';
import { downloadUploadTemplate } from '../datasets/upload-templates';

const { Paragraph } = Typography;

interface UploadFormValues {
  datasetName: string;
  kind: DatasetKind;
}

interface RenameFormValues {
  datasetName: string;
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
  const { t } = useI18n();
  const [scope, setScope] = useState<AssetScope>('mine');
  const [overview, setOverview] = useState<AssetOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadForm] = Form.useForm<UploadFormValues>();
  const [renameForm] = Form.useForm<RenameFormValues>();
  const selectedUploadKind = Form.useWatch('kind', uploadForm) ?? 'table';

  const isAdmin = currentUser?.role === 'ADMIN';

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

  const openRenameModal = (datasetId: string, datasetName: string) => {
    renameForm.setFieldsValue({ datasetName });
    setRenameTargetId(datasetId);
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

  const handleRename = async () => {
    if (!token || !renameTargetId) {
      return;
    }

    try {
      setSubmitting(true);
      const values = await renameForm.validateFields();
      await updateDataset(token, renameTargetId, { name: values.datasetName });
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
            <Button type="link" onClick={() => openRenameModal(record.id, record.name)}>
              {t('common.rename')}
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
          initialValues={{ datasetName: '', kind: 'table' }}
        >
          <div className="section-actions">
            <Button onClick={() => downloadUploadTemplate(selectedUploadKind)}>
              {t('assets.downloadTemplate')}
            </Button>
          </div>
          <Form.Item name="datasetName" label={t('datasets.table.dataset')} rules={[{ required: true }]}>
            <Input />
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
        title={t('assets.renameDataset')}
        open={Boolean(renameTargetId)}
        onCancel={() => setRenameTargetId(null)}
        onOk={() => void handleRename()}
        confirmLoading={submitting}
      >
        <Form form={renameForm} layout="vertical">
          <Form.Item name="datasetName" label={t('datasets.table.dataset')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
