import type { PlatformDataSnapshot } from '@/lib/api';

import { Card, Col, Row, Tag, Typography } from 'antd';

import { useI18n } from '@/i18n/useI18n';

const { Paragraph, Text, Title } = Typography;

export function ModelsPage({ snapshot }: { snapshot: PlatformDataSnapshot }) {
  const { t } = useI18n();
  return (
    <div className="page-stack">
      <div className="section-header">
        <div className="panel-kicker">{t('models.kicker')}</div>
        <h2 className="section-title">{t('models.title')}</h2>
        <Paragraph className="section-copy">{t('models.copy')}</Paragraph>
      </div>

      <Row gutter={[20, 20]}>
        {snapshot.modelVersions.map((modelVersion) => (
          <Col xs={24} lg={12} key={modelVersion.id}>
            <Card className="panel-card model-card" variant="borderless">
              <div className="model-card-head">
                <div>
                  <Text className="panel-kicker">{t('models.versionKicker')}</Text>
                  <Title level={3}>{modelVersion.version}</Title>
                </div>
                <Tag color="blue">{modelVersion.framework}</Tag>
              </div>
              <Paragraph>
                {t('models.taskType')}: <strong>{modelVersion.taskType}</strong>
              </Paragraph>
              <Paragraph>
                {t('models.modelId')}: <code>{modelVersion.modelId}</code>
              </Paragraph>
              <Paragraph>
                {t('models.createdAt')}: <code>{modelVersion.createdAt}</code>
              </Paragraph>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
