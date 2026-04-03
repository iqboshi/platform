import type { PlatformDataSnapshot } from '@/lib/api';

import { Card, Col, Row, Table, Tag, Typography } from 'antd';

import { StatCard } from '@/components/StatCard';
import { WorkflowCanvas } from '@/components/WorkflowCanvas';
import { buildWorkflowStats } from './workflow-utils';

const { Paragraph } = Typography;

export function WorkflowsPage({ snapshot }: { snapshot: PlatformDataSnapshot }) {
  const stats = buildWorkflowStats(snapshot.workflowCatalog, snapshot.workflowVersion);

  return (
    <div className="page-stack">
      <div className="section-header">
        <div className="panel-kicker">Workflow Orchestration</div>
        <h2 className="section-title">Design versioned DAGs for preprocessing, splitting, inference, and export.</h2>
        <Paragraph className="section-copy">
          Nodes are draggable in the canvas and new nodes can be appended from the library. The backend already validates the same graph shape through `/api/v1/workflows/validate`.
        </Paragraph>
      </div>

      <Row gutter={[20, 20]}>
        <Col xs={24} md={8}>
          <StatCard label="Nodes" value={String(stats.nodeCount)} detail="Versioned graph nodes stored in workflow JSON." />
        </Col>
        <Col xs={24} md={8}>
          <StatCard label="Edges" value={String(stats.edgeCount)} detail="Directed edges define execution dependencies." />
        </Col>
        <Col xs={24} md={8}>
          <StatCard label="Categories" value={String(stats.categoryCount)} detail="Source, preprocess, split, inference, and export blocks." />
        </Col>
      </Row>

      <WorkflowCanvas catalog={snapshot.workflowCatalog} workflowVersion={snapshot.workflowVersion} />

      <Card className="panel-card" bordered={false}>
        <div className="panel-kicker">Run History</div>
        <Table
          rowKey="id"
          pagination={false}
          dataSource={snapshot.workflowRuns}
          columns={[
            { title: 'Run ID', dataIndex: 'id' },
            { title: 'Workflow Version', dataIndex: 'workflowVersionId' },
            {
              title: 'Status',
              dataIndex: 'status',
              render: (status: string) => (
                <Tag color={status === 'running' ? 'processing' : status === 'succeeded' ? 'green' : 'default'}>
                  {status}
                </Tag>
              ),
            },
            { title: 'Submitted By', dataIndex: 'submittedBy' },
          ]}
        />
      </Card>
    </div>
  );
}
