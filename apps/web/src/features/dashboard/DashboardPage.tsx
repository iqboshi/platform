import type { PlatformDataSnapshot } from '@/lib/api';

import { Col, Row, Table, Tag, Typography } from 'antd';

import { MapPreview } from '@/components/MapPreview';
import { StatCard } from '@/components/StatCard';

const { Paragraph } = Typography;

export function DashboardPage({ snapshot }: { snapshot: PlatformDataSnapshot }) {
  const primaryVersion = snapshot.datasetVersions[0];

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <div className="hero-kicker">Operations Overview</div>
          <h1 className="hero-title">Dataset ingestion, workflow orchestration, and result review in one workspace.</h1>
          <Paragraph className="hero-copy">
            The current scaffold already exposes versioned datasets, workflow definitions, model versions, and map preview boundaries.
          </Paragraph>
        </div>
      </section>

      <Row gutter={[20, 20]}>
        <Col xs={24} md={8}>
          <StatCard label="Datasets" value={String(snapshot.datasets.length)} detail="Versioned assets across raster, vector, and result artifacts." />
        </Col>
        <Col xs={24} md={8}>
          <StatCard label="Workflow Runs" value={String(snapshot.workflowRuns.length)} detail="Queued, running, and completed executions remain traceable." />
        </Col>
        <Col xs={24} md={8}>
          <StatCard label="Model Versions" value={String(snapshot.modelVersions.length)} detail="Inference adapters stay versioned and workspace-scoped." />
        </Col>
      </Row>

      <Row gutter={[20, 20]}>
        <Col xs={24} xl={14}>
          <MapPreview
            title={snapshot.datasets[0].name}
            subtitle="OpenLayers preview with AOI overlay. Replace the placeholder TileJSON with TiTiler-backed tiles as ingestion is wired up."
            extent={primaryVersion?.bbox}
            previewUrl={primaryVersion?.previewUrl}
          />
        </Col>
        <Col xs={24} xl={10}>
          <div className="panel-card">
            <div className="panel-kicker">Recent Workflow Runs</div>
            <Table
              pagination={false}
              rowKey="id"
              dataSource={snapshot.workflowRuns}
              columns={[
                { title: 'Run', dataIndex: 'id' },
                {
                  title: 'Status',
                  dataIndex: 'status',
                  render: (status: string) => <Tag color={status === 'running' ? 'processing' : 'success'}>{status}</Tag>,
                },
                { title: 'Submitted By', dataIndex: 'submittedBy' },
              ]}
            />
          </div>
        </Col>
      </Row>
    </div>
  );
}
