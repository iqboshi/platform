import type { PlatformDataSnapshot } from '@/lib/api';

import { App, Button, Card, Col, Descriptions, Form, Input, Modal, Row, Select, Table, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';

import { isApiError } from '@/auth/errors';
import { useAuth } from '@/auth/useAuth';
import { MapPreview } from '@/components/MapPreview';
import { useI18n } from '@/i18n/useI18n';
import { getDatasetDownloadUrl, uploadDataset } from '@/lib/api';
import { datasetKindKey, datasetStatusKey } from '@/lib/i18n-helpers';

const { Paragraph } = Typography;

export function DatasetsPage({
  snapshot,
  onRefresh,
}: {
  snapshot: PlatformDataSnapshot;
  onRefresh: () => Promise<void>;
}) {
  const { message } = App.useApp();
  const { currentUser, hasPermission, token } = useAuth();
  const { t } = useI18n();
  const [form] = Form.useForm<{ datasetName: string; kind: PlatformDataSnapshot['datasets'][number]['kind'] }>();
  const [selectedDatasetId, setSelectedDatasetId] = useState(snapshot.datasets[0]?.id);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const selectedDataset = useMemo(
    () => snapshot.datasets.find((item) => item.id === selectedDatasetId) ?? snapshot.datasets[0],
    [selectedDatasetId, snapshot.datasets],
  );
  const selectedVersion = useMemo(
    () => snapshot.datasetVersions.find((item) => item.datasetId === selectedDataset?.id),
    [selectedDataset?.id, snapshot.datasetVersions],
  );

  const onUpload = async () => {
    if (!token || !hasPermission('dataset.manage')) {
      message.warning(t('datasets.uploadDenied'));
      return;
    }
    if (!selectedFile) {
      message.warning(t('datasets.fileRequired'));
      return;
    }
    try {
      setUploading(true);
      const values = await form.validateFields();
      await uploadDataset(token, {
        workspaceId: snapshot.workspace.id,
        datasetName: values.datasetName,
        kind: values.kind,
        file: selectedFile,
      });
      message.success(t('datasets.uploadCreated'));
      setUploadOpen(false);
      form.resetFields();
      setSelectedFile(null);
      await onRefresh();
    } catch (error) {
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="page-stack">
      <div className="section-header">
        <div className="section-header-actions">
          <div>
            <div className="panel-kicker">{t('datasets.kicker')}</div>
            <h2 className="section-title">{t('datasets.title')}</h2>
            <Paragraph className="section-copy">{t('datasets.copy')}</Paragraph>
          </div>
          {currentUser && hasPermission('dataset.manage') ? (
            <Button type="primary" onClick={() => setUploadOpen(true)}>
              {t('datasets.uploadSession')}
            </Button>
          ) : null}
        </div>
      </div>

      <Row gutter={[20, 20]}>
        <Col xs={24} xl={12}>
          <Card className="panel-card" variant="borderless">
            <Table
              rowKey="id"
              dataSource={snapshot.datasets}
              pagination={false}
              onRow={(record) => ({
                onClick: () => setSelectedDatasetId(record.id),
              })}
              columns={[
                { title: t('datasets.table.dataset'), dataIndex: 'name' },
                {
                  title: t('datasets.table.kind'),
                  dataIndex: 'kind',
                  render: (kind: PlatformDataSnapshot['datasets'][number]['kind']) => t(datasetKindKey(kind)),
                },
                {
                  title: t('datasets.table.status'),
                  dataIndex: 'status',
                  render: (status: PlatformDataSnapshot['datasets'][number]['status']) => (
                    <Tag color={status === 'ready' ? 'green' : 'processing'}>
                      {t(datasetStatusKey(status))}
                    </Tag>
                  ),
                },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <MapPreview
            title={selectedDataset?.name ?? t('datasets.previewTitle')}
            subtitle={t('datasets.previewSubtitle')}
            extent={selectedVersion?.bbox}
            previewUrl={selectedVersion?.previewUrl}
          />
        </Col>
      </Row>

      <Card className="panel-card" variant="borderless">
        <Descriptions title={t('datasets.selectedVersion')} column={2}>
          <Descriptions.Item label={t('datasets.version')}>{selectedVersion?.version ?? '-'}</Descriptions.Item>
          <Descriptions.Item label={t('datasets.projection')}>{selectedDataset?.projection ?? '-'}</Descriptions.Item>
          <Descriptions.Item label={t('datasets.assetPath')}>{selectedVersion?.assetPath ?? '-'}</Descriptions.Item>
          <Descriptions.Item label={t('datasets.footprint')}>{selectedDataset?.footprint ?? '-'}</Descriptions.Item>
          <Descriptions.Item label={t('datasets.metadata')}>
            <pre className="json-block">{JSON.stringify(selectedVersion?.metadata ?? {}, null, 2)}</pre>
          </Descriptions.Item>
          <Descriptions.Item label={t('datasets.tileEndpoint')}>{selectedVersion?.previewUrl ?? '-'}</Descriptions.Item>
          <Descriptions.Item label={t('datasets.uploadSession')}>
            {selectedVersion ? (
              <Button type="link" href={getDatasetDownloadUrl(selectedVersion.id)} target="_blank">
                {t('datasets.downloadAsset')}
              </Button>
            ) : (
              '-'
            )}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Modal
        title={t('datasets.uploadSession')}
        open={uploadOpen}
        onCancel={() => {
          setUploadOpen(false);
          setSelectedFile(null);
        }}
        onOk={() => void onUpload()}
        confirmLoading={uploading}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            datasetName: selectedFile?.name ? selectedFile.name.replace(/\.[^.]+$/, '') : '',
            kind: 'raster',
          }}
        >
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
                  form.setFieldValue('datasetName', file.name.replace(/\.[^.]+$/, ''));
                }
              }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
