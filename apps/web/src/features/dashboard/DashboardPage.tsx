import type { PlatformDataSnapshot } from '@/lib/api';

import { Col, Row, Table, Tag, Typography } from 'antd';

import { MapPreview } from '@/components/MapPreview';
import { StatCard } from '@/components/StatCard';
import { useI18n } from '@/i18n/useI18n';
import { workflowRunStatusKey } from '@/lib/i18n-helpers';

const { Paragraph } = Typography;

export function DashboardPage({ snapshot }: { snapshot: PlatformDataSnapshot }) {
  const { t } = useI18n();
  const primaryDataset = snapshot.datasets[0];
  const primaryVersion = snapshot.datasetVersions[0];

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <div className="hero-kicker">{t('dashboard.heroKicker')}</div>
          <h1 className="hero-title">{t('dashboard.heroTitle')}</h1>
          <Paragraph className="hero-copy">{t('dashboard.heroCopy')}</Paragraph>
        </div>
      </section>

      <Row gutter={[20, 20]}>
        <Col xs={24} md={8}>
          <StatCard
            label={t('dashboard.datasetsLabel')}
            value={String(snapshot.datasets.length)}
            detail={t('dashboard.datasetsDetail')}
          />
        </Col>
        <Col xs={24} md={8}>
          <StatCard
            label={t('dashboard.runsLabel')}
            value={String(snapshot.workflowRuns.length)}
            detail={t('dashboard.runsDetail')}
          />
        </Col>
        <Col xs={24} md={8}>
          <StatCard
            label={t('dashboard.modelsLabel')}
            value={String(snapshot.modelVersions.length)}
            detail={t('dashboard.modelsDetail')}
          />
        </Col>
      </Row>

      <Row gutter={[20, 20]}>
        <Col xs={24} xl={14}>
          <MapPreview
            title={primaryDataset?.name ?? t('datasets.previewTitle')}
            subtitle={t('dashboard.mapSubtitle')}
            extent={primaryVersion?.bbox}
            previewUrl={primaryVersion?.previewUrl}
          />
        </Col>
        <Col xs={24} xl={10}>
          <div className="panel-card">
            <div className="panel-kicker">{t('dashboard.recentRuns')}</div>
            <Table
              pagination={false}
              rowKey="id"
              dataSource={snapshot.workflowRuns}
              columns={[
                { title: t('dashboard.runId'), dataIndex: 'id' },
                {
                  title: t('common.status'),
                  dataIndex: 'status',
                  render: (status: PlatformDataSnapshot['workflowRuns'][number]['status']) => (
                    <Tag color={status === 'running' ? 'processing' : status === 'succeeded' ? 'success' : 'default'}>
                      {t(workflowRunStatusKey(status))}
                    </Tag>
                  ),
                },
                { title: t('dashboard.submittedBy'), dataIndex: 'submittedBy' },
              ]}
            />
          </div>
        </Col>
      </Row>
    </div>
  );
}
