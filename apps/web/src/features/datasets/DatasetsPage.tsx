import type { PlatformDataSnapshot } from '@/lib/api';

import { Card, Col, Descriptions, Row, Table, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';

import { MapPreview } from '@/components/MapPreview';

const { Paragraph } = Typography;

export function DatasetsPage({ snapshot }: { snapshot: PlatformDataSnapshot }) {
  const [selectedDatasetId, setSelectedDatasetId] = useState(snapshot.datasets[0]?.id);

  const selectedDataset = useMemo(
    () => snapshot.datasets.find((item) => item.id === selectedDatasetId) ?? snapshot.datasets[0],
    [selectedDatasetId, snapshot.datasets],
  );
  const selectedVersion = useMemo(
    () => snapshot.datasetVersions.find((item) => item.datasetId === selectedDataset?.id),
    [selectedDataset?.id, snapshot.datasetVersions],
  );

  return (
    <div className="page-stack">
      <div className="section-header">
        <div className="panel-kicker">Datasets</div>
        <h2 className="section-title">Upload, version, preview, and split remote-sensing assets.</h2>
        <Paragraph className="section-copy">
          The current view is wired to the backend contract for dataset and version listing. Upload-session and confirm endpoints are already scaffolded.
        </Paragraph>
      </div>

      <Row gutter={[20, 20]}>
        <Col xs={24} xl={12}>
          <Card className="panel-card" bordered={false}>
            <Table
              rowKey="id"
              dataSource={snapshot.datasets}
              pagination={false}
              onRow={(record) => ({
                onClick: () => setSelectedDatasetId(record.id),
              })}
              columns={[
                { title: 'Dataset', dataIndex: 'name' },
                { title: 'Kind', dataIndex: 'kind' },
                {
                  title: 'Status',
                  dataIndex: 'status',
                  render: (status: string) => <Tag color={status === 'ready' ? 'green' : 'processing'}>{status}</Tag>,
                },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <MapPreview
            title={selectedDataset?.name ?? 'Dataset Preview'}
            subtitle="AOI preview reuses the same map component that can be embedded in dataset detail and result review screens."
            extent={selectedVersion?.bbox}
            previewUrl={selectedVersion?.previewUrl}
          />
        </Col>
      </Row>

      <Card className="panel-card" bordered={false}>
        <Descriptions title="Selected Dataset Version" column={2}>
          <Descriptions.Item label="Version">{selectedVersion?.version ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Projection">{selectedDataset?.projection ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Asset Path">{selectedVersion?.assetPath ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Footprint">{selectedDataset?.footprint ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Metadata">
            <pre className="json-block">{JSON.stringify(selectedVersion?.metadata ?? {}, null, 2)}</pre>
          </Descriptions.Item>
          <Descriptions.Item label="Tile Endpoint">{selectedVersion?.previewUrl ?? '-'}</Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
}
