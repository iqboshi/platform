import { App, Button, Card, Form, Input, List, Space, Typography } from 'antd';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { isApiError } from '@/auth/errors';
import { useAuth } from '@/auth/useAuth';
import { useI18n } from '@/i18n/useI18n';
import { apiErrorKey } from '@/lib/i18n-helpers';
import type { TranslationKey } from '@/i18n/messages';

const { Paragraph, Title, Text } = Typography;

type DemoAccount = {
  key: TranslationKey;
  email: string;
  password: string;
};

const demoAccounts: DemoAccount[] = [
  { key: 'auth.demoAdmin', email: 'admin@platform.local', password: 'Admin123!' },
  { key: 'auth.demoEngineer', email: 'engineer@platform.local', password: 'Engineer123!' },
  { key: 'auth.demoMember', email: 'member@platform.local', password: 'Member123!' },
  { key: 'auth.demoPending', email: 'pending@platform.local', password: 'Pending123!' },
];

export function LoginPage() {
  const { message } = App.useApp();
  const { login } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();

  const onFinish = async (values: { email: string; password: string }) => {
    try {
      await login(values);
      message.success(t('auth.loginSuccess'));
      const nextPath = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      navigate(nextPath ?? '/', { replace: true });
    } catch (error) {
      if (isApiError(error) && error.code === 'pending_approval') {
        navigate('/pending', { replace: true });
        return;
      }
      message.error(t(isApiError(error) ? apiErrorKey(error.code) : 'error.request_failed'));
    }
  };

  return (
    <div className="auth-page">
      <Card className="auth-card" variant="borderless">
        <div className="panel-kicker">{t('common.login')}</div>
        <Title level={2}>{t('auth.loginTitle')}</Title>
        <Paragraph>{t('auth.loginSubtitle')}</Paragraph>

        <Form layout="vertical" onFinish={onFinish} autoComplete="off">
          <Form.Item name="email" label={t('common.email')} rules={[{ required: true }]}>
            <Input size="large" />
          </Form.Item>
          <Form.Item name="password" label={t('common.password')} rules={[{ required: true }]}>
            <Input.Password size="large" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large">
            {t('common.login')}
          </Button>
        </Form>

        <Space direction="vertical" size={4} className="auth-footnote">
          <Text>{t('auth.noAccount')}</Text>
          <Link to="/register">{t('auth.createAccountAction')}</Link>
        </Space>
      </Card>

      <Card className="auth-card auth-side-card" variant="borderless">
        <Title level={4}>{t('common.demoAccounts')}</Title>
        <Paragraph>{t('auth.demoHint')}</Paragraph>
        <List<DemoAccount>
          dataSource={demoAccounts}
          renderItem={(item) => (
            <List.Item>
              <div className="demo-account-row">
                <div>
                  <strong>{t(item.key)}</strong>
                  <div>{item.email}</div>
                </div>
                <code>{item.password}</code>
              </div>
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
}
