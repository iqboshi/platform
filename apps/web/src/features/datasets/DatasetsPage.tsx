import type { PlatformDataSnapshot } from '@/lib/api';

import { App, Button, Card, Col, Descriptions, Empty, Row, Table, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';

import { isApiError } from '@/auth/errors';
import { useAuth } from '@/auth/useAuth';
import { MapPreview } from '@/components/MapPreview';
import { useI18n } from '@/i18n/useI18n';
import { downloadDatasetVersion, updateDataset } from '@/lib/api';
import { datasetKindKey, datasetStatusKey } from '@/lib/i18n-helpers';

const { Paragraph, Text } = Typography;

export function DatasetsPage({
  snapshot,
  onRefresh,
}: {
  snapshot: PlatformDataSnapshot;
  onRefresh: () => Promise<void>;
}) {
  const { message } = App.useApp();
  const { currentUser, token } = useAuth();
  const { t } = useI18n();
  const publicDatasets = useMemo(
    () => snapshot.datasets.filter((item) => item.visibility === 'public'),
    [snapshot.datasets],
  );
  const publicDatasetVersions = useMemo(
    () => snapshot.datasetVersions.filter((item) => item.visibility === 'public'),
    [snapshot.datasetVersions],
  );
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | undefined>(
    publicDatasets[0]?.id,
  );

  useEffect(() => {
    setSelectedDatasetId((current) => {
      if (current && publicDatasets.some((item) => item.id === current)) {
        return current;
      }
      return publicDatasets[0]?.id;
    });
  }, [publicDatasets]);

  const selectedDataset = useMemo(
    () => publicDatasets.find((item) => item.id === selectedDatasetId) ?? publicDatasets[0],
    [publicDatasets, selectedDatasetId],
  );
  const selectedVersion = useMemo(() => {
    if (!selectedDataset) {
      return undefined;
    }
    return (
      publicDatasetVersions.find((item) => item.id === selectedDataset.latestVersionId) ??
      publicDatasetVersions.find((item) => item.datasetId === selectedDataset.id)
    );
  }, [publicDatasetVersions, selectedDataset]);

  const onDownloadSelectedVersion = async () => {
    if (!token || !selectedVersion) {
      return;
    }

    try {
      await downloadDatasetVersion(token, selectedVersion.id);
    } catch (error) {
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    }
  };

  const onUnpublishSelectedDataset = async () => {
    if (!token || !selectedDataset || currentUser?.role !== 'ADMIN') {
      return;
    }

    try {
      await updateDataset(token, selectedDataset.id, { visibility: 'private' });
      message.success(t('datasets.unpublished'));
      await onRefresh();
    } catch (error) {
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
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
          {currentUser?.role === 'ADMIN' && selectedDataset ? (
            <Button onClick={() => void onUnpublishSelectedDataset()}>{t('datasets.unpublish')}</Button>
          ) : null}
        </div>
      </div>

      {publicDatasets.length === 0 ? (
        <Card className="panel-card" variant="borderless">
          <Empty description={t('datasets.emptyPublic')} />
        </Card>
      ) : (
        <>
          <Row gutter={[20, 20]}>
            <Col xs={24} xl={12}>
              <Card className="panel-card" variant="borderless">
                <Table
                  rowKey="id"
                  dataSource={publicDatasets}
                  pagination={false}
                  onRow={(record) => ({
                    onClick: () => setSelectedDatasetId(record.id),
                  })}
                  columns={[
                    { title: t('datasets.table.dataset'), dataIndex: 'name' },
                    {
                      title: t('datasets.table.kind'),
                      dataIndex: 'kind',
                      render: (kind: PlatformDataSnapshot['datasets'][number]['kind']) =>
                        t(datasetKindKey(kind)),
                    },
                    {
                      title: t('datasets.owner'),
                      dataIndex: 'ownerDisplayName',
                      render: (value: string | undefined) => value ?? '-',
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
              <Descriptions.Item label={t('datasets.version')}>
                {selectedVersion?.version ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label={t('datasets.owner')}>
                {selectedDataset?.ownerDisplayName ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label={t('datasets.projection')}>
                {selectedDataset?.projection ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label={t('datasets.visibility')}>
                <Tag color="blue">{t('datasets.visibilityPublic')}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('datasets.assetPath')}>
                {selectedVersion?.assetPath ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label={t('datasets.footprint')}>
                {selectedDataset?.footprint ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label={t('datasets.metadata')}>
                <pre className="json-block">{JSON.stringify(selectedVersion?.metadata ?? {}, null, 2)}</pre>
              </Descriptions.Item>
              <Descriptions.Item label={t('datasets.tileEndpoint')}>
                {selectedVersion?.previewUrl ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label={t('datasets.downloadAsset')}>
                {selectedVersion ? (
                  <Button type="link" onClick={() => void onDownloadSelectedVersion()}>
                    {t('datasets.downloadAsset')}
                  </Button>
                ) : (
                  <Text>-</Text>
                )}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </>
      )}
    </div>
  );
}
