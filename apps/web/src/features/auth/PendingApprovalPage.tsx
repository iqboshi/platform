import { Button, Card, Space, Typography } from 'antd';
import { Link, useLocation } from 'react-router-dom';

import { useI18n } from '@/i18n/useI18n';

const { Paragraph, Title } = Typography;

export function PendingApprovalPage() {
  const { t } = useI18n();
  const location = useLocation();
  const justRegistered = Boolean(
    (location.state as { justRegistered?: boolean } | null)?.justRegistered,
  );

  return (
    <div className="auth-page">
      <Card className="auth-card auth-card-wide" variant="borderless">
        <div className="panel-kicker">{t('auth.pendingTitle')}</div>
        <Title level={2}>{t('auth.pendingSubtitle')}</Title>
        <Paragraph>{t('auth.pendingBody')}</Paragraph>
        {justRegistered ? <Paragraph>{t('auth.pendingRegistered')}</Paragraph> : null}
        <Space>
          <Link to="/login">
            <Button type="primary">{t('auth.signInAction')}</Button>
          </Link>
          <Link to="/register">
            <Button>{t('common.register')}</Button>
          </Link>
        </Space>
      </Card>
    </div>
  );
}
