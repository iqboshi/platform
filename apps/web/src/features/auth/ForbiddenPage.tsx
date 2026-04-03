import { Button, Card, Typography } from 'antd';
import { Link } from 'react-router-dom';

import { useI18n } from '@/i18n/useI18n';

const { Paragraph, Title } = Typography;

export function ForbiddenPage() {
  const { t } = useI18n();

  return (
    <div className="auth-page">
      <Card className="auth-card auth-card-wide" variant="borderless">
        <div className="panel-kicker">403</div>
        <Title level={2}>{t('auth.forbiddenTitle')}</Title>
        <Paragraph>{t('auth.forbiddenBody')}</Paragraph>
        <Link to="/">
          <Button type="primary">{t('common.back')}</Button>
        </Link>
      </Card>
    </div>
  );
}
