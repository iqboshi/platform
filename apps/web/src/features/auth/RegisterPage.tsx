import { App, Button, Card, Form, Input, Select, Space, Typography } from 'antd';
import { Link, useNavigate } from 'react-router-dom';

import { isApiError } from '@/auth/errors';
import { useAuth } from '@/auth/useAuth';
import { useI18n } from '@/i18n/useI18n';
import { apiErrorKey } from '@/lib/i18n-helpers';

const { Paragraph, Title, Text } = Typography;

export function RegisterPage() {
  const { message } = App.useApp();
  const { register } = useAuth();
  const { locale, t } = useI18n();
  const navigate = useNavigate();

  const onFinish = async (values: {
    displayName: string;
    email: string;
    password: string;
    preferredLocale: 'zh-CN' | 'en-US';
  }) => {
    try {
      await register(values);
      message.success(t('auth.registerSuccess'));
      navigate('/pending', { replace: true, state: { justRegistered: true } });
    } catch (error) {
      message.error(t(isApiError(error) ? apiErrorKey(error.code) : 'error.request_failed'));
    }
  };

  return (
    <div className="auth-page">
      <Card className="auth-card" variant="borderless">
        <div className="panel-kicker">{t('common.register')}</div>
        <Title level={2}>{t('auth.registerTitle')}</Title>
        <Paragraph>{t('auth.registerSubtitle')}</Paragraph>

        <Form
          layout="vertical"
          onFinish={onFinish}
          initialValues={{ preferredLocale: locale }}
          autoComplete="off"
        >
          <Form.Item name="displayName" label={t('common.displayName')} rules={[{ required: true }]}>
            <Input size="large" />
          </Form.Item>
          <Form.Item name="email" label={t('common.email')} rules={[{ required: true }]}>
            <Input size="large" />
          </Form.Item>
          <Form.Item
            name="password"
            label={t('common.password')}
            extra={t('auth.passwordHint')}
            rules={[{ required: true, min: 8 }]}
          >
            <Input.Password size="large" />
          </Form.Item>
          <Form.Item
            name="preferredLocale"
            label={t('auth.preferredLocale')}
            rules={[{ required: true }]}
          >
            <Select
              size="large"
              options={[
                { value: 'zh-CN', label: t('locale.zh-CN') },
                { value: 'en-US', label: t('locale.en-US') },
              ]}
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large">
            {t('common.register')}
          </Button>
        </Form>

        <Space direction="vertical" size={4} className="auth-footnote">
          <Text>{t('auth.haveAccount')}</Text>
          <Link to="/login">{t('auth.signInAction')}</Link>
        </Space>
      </Card>
    </div>
  );
}
