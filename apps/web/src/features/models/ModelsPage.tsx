import type { PlatformDataSnapshot } from '@/lib/api';

import { Card, Col, Row, Tag, Typography } from 'antd';

const { Paragraph, Text, Title } = Typography;

export function ModelsPage({ snapshot }: { snapshot: PlatformDataSnapshot }) {
  return (
    <div className="page-stack">
      <div className="section-header">
        <div className="panel-kicker">Models</div>
        <h2 className="section-title">Register inference adapters and bind them to workflow versions.</h2>
        <Paragraph className="section-copy">
          The current backend exposes model versions separately so the UI can stay close to a future registry or plugin management flow.
        </Paragraph>
      </div>

      <Row gutter={[20, 20]}>
        {snapshot.modelVersions.map((modelVersion) => (
          <Col xs={24} lg={12} key={modelVersion.id}>
            <Card className="panel-card model-card" bordered={false}>
              <div className="model-card-head">
                <div>
                  <Text className="panel-kicker">Model Version</Text>
                  <Title level={3}>{modelVersion.version}</Title>
                </div>
                <Tag color="blue">{modelVersion.framework}</Tag>
              </div>
              <Paragraph>
                Task type: <strong>{modelVersion.taskType}</strong>
              </Paragraph>
              <Paragraph>
                Bound model id: <code>{modelVersion.modelId}</code>
              </Paragraph>
              <Paragraph>
                Created at: <code>{modelVersion.createdAt}</code>
              </Paragraph>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
