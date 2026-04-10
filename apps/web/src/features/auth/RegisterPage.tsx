import { App, Button, Card, Form, Input, Select, Space, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { isApiError } from '@/auth/errors';
import { useAuth } from '@/auth/useAuth';
import { getImageCaptcha, sendEmailVerificationCode } from '@/lib/api';
import { useI18n } from '@/i18n/useI18n';

const { Paragraph, Title, Text } = Typography;

function normalizeEmail(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function RegisterPage() {
  const { message } = App.useApp();
  const { register } = useAuth();
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [captchaKey, setCaptchaKey] = useState('');
  const [captchaImageUrl, setCaptchaImageUrl] = useState('');
  const [loadingCaptcha, setLoadingCaptcha] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [sentEmail, setSentEmail] = useState('');
  const watchedEmail = Form.useWatch('email', form);

  const copy = useMemo(
    () =>
      locale === 'zh-CN'
        ? {
            captchaLabel: '图片验证码',
            captchaPlaceholder: '输入图片中的字符',
            refreshCaptcha: '换一张',
            emailCodeLabel: '邮箱验证码',
            emailCodePlaceholder: '输入邮箱中的 6 位验证码',
            sendCode: '发送邮件验证码',
            resendCode: '重新发送',
            codeSent: '邮件验证码已发送，请检查邮箱。',
            resendIn: (seconds: number) => `${seconds}s 后可重发`,
            emailMismatch: '当前邮箱已变更，请重新发送验证码。',
            verificationHint: '发送邮件验证码前需先完成图片验证码。',
            captchaRequired: '请输入图片验证码。',
            loadCaptchaFailed: '验证码加载失败，请稍后重试。',
            emailVerificationDisabled: '平台未启用邮箱验证，请先配置 SMTP。',
            emailCodeCooldown: '请求过于频繁，请稍后再试。',
            emailCodeInvalid: '邮箱验证码错误或已失效。',
            captchaInvalid: '图片验证码错误或已失效。',
            deliveryFailed: '邮件发送失败，请检查 SMTP 配置。',
          }
        : {
            captchaLabel: 'Image captcha',
            captchaPlaceholder: 'Enter the characters from the image',
            refreshCaptcha: 'Refresh',
            emailCodeLabel: 'Email verification code',
            emailCodePlaceholder: 'Enter the 6-digit code from your email',
            sendCode: 'Send email code',
            resendCode: 'Resend',
            codeSent: 'Verification code sent. Please check your email.',
            resendIn: (seconds: number) => `Resend in ${seconds}s`,
            emailMismatch: 'The email changed. Please send a new verification code.',
            verificationHint: 'Complete the image captcha before requesting an email code.',
            captchaRequired: 'Please enter the image captcha.',
            loadCaptchaFailed: 'Failed to load captcha.',
            emailVerificationDisabled: 'Email verification is not configured on this platform.',
            emailCodeCooldown: 'Too many requests. Please wait before sending again.',
            emailCodeInvalid: 'Email verification code is invalid or expired.',
            captchaInvalid: 'Image captcha is invalid or expired.',
            deliveryFailed: 'Failed to send email. Check SMTP configuration.',
          },
    [locale],
  );

  const refreshCaptcha = async () => {
    try {
      setLoadingCaptcha(true);
      const payload = await getImageCaptcha();
      setCaptchaKey(payload.captchaKey);
      setCaptchaImageUrl(payload.imageDataUrl);
    } catch {
      message.error(copy.loadCaptchaFailed);
    } finally {
      setLoadingCaptcha(false);
      form.setFieldValue('captchaCode', '');
    }
  };

  useEffect(() => {
    void refreshCaptcha();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cooldownSeconds <= 0) {
      return;
    }
    const timer = window.setInterval(() => {
      setCooldownSeconds((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownSeconds]);

  const resolveErrorMessage = (error: unknown): string => {
    if (!isApiError(error)) {
      return t('error.request_failed');
    }
    switch (error.code) {
      case 'email_verification_disabled':
        return copy.emailVerificationDisabled;
      case 'email_code_send_cooldown':
        return copy.emailCodeCooldown;
      case 'email_code_invalid':
      case 'email_code_expired':
      case 'email_code_required':
        return copy.emailCodeInvalid;
      case 'captcha_invalid':
      case 'captcha_expired':
        return copy.captchaInvalid;
      case 'email_delivery_failed':
        return copy.deliveryFailed;
      case 'email_exists':
        return t('error.email_exists');
      default:
        return error.message || t('error.request_failed');
    }
  };

  const onSendEmailCode = async () => {
    const email = normalizeEmail(form.getFieldValue('email'));
    const captchaCode = String(form.getFieldValue('captchaCode') ?? '').trim();
    if (!email) {
      await form.validateFields(['email']);
      return;
    }
    if (!captchaCode) {
      message.warning(copy.captchaRequired);
      return;
    }
    if (!captchaKey) {
      message.warning(copy.loadCaptchaFailed);
      return;
    }

    try {
      setSendingCode(true);
      const result = await sendEmailVerificationCode({
        email,
        scene: 'register',
        captchaKey,
        captchaCode,
      });
      setSentEmail(email);
      setCooldownSeconds(result.resendAfterSeconds);
      form.setFieldValue('emailCode', '');
      message.success(copy.codeSent);
    } catch (error) {
      message.error(resolveErrorMessage(error));
    } finally {
      setSendingCode(false);
      void refreshCaptcha();
    }
  };

  const onFinish = async (values: {
    displayName: string;
    email: string;
    password: string;
    emailCode: string;
    preferredLocale: 'zh-CN' | 'en-US';
  }) => {
    const normalizedEmail = normalizeEmail(values.email);
    if (normalizedEmail !== sentEmail) {
      message.error(copy.emailMismatch);
      return;
    }

    try {
      setSubmitting(true);
      await register({
        displayName: values.displayName,
        email: normalizedEmail,
        password: values.password,
        emailCode: values.emailCode,
        preferredLocale: values.preferredLocale,
      });
      message.success(t('auth.registerSuccess'));
      navigate('/pending', { replace: true, state: { justRegistered: true } });
    } catch (error) {
      message.error(resolveErrorMessage(error));
      void refreshCaptcha();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <Card className="auth-card" variant="borderless">
        <div className="panel-kicker">{t('common.register')}</div>
        <Title level={2}>{t('auth.registerTitle')}</Title>
        <Paragraph>{t('auth.registerSubtitle')}</Paragraph>

        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{ preferredLocale: locale }}
          autoComplete="off"
        >
          <Form.Item name="displayName" label={t('common.displayName')} rules={[{ required: true }]}>
            <Input size="large" />
          </Form.Item>
          <Form.Item
            name="email"
            label={t('common.email')}
            rules={[{ required: true }, { type: 'email' }]}
          >
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

          <Form.Item label={copy.captchaLabel} extra={copy.verificationHint}>
            <div className="auth-verification-row">
              <Form.Item name="captchaCode" noStyle>
                <Input size="large" placeholder={copy.captchaPlaceholder} />
              </Form.Item>
              <div className="auth-captcha-box">
                {captchaImageUrl ? <img src={captchaImageUrl} alt="captcha" className="auth-captcha-image" /> : null}
              </div>
              <Button onClick={() => void refreshCaptcha()} loading={loadingCaptcha}>
                {copy.refreshCaptcha}
              </Button>
            </div>
          </Form.Item>

          <Form.Item
            name="emailCode"
            label={copy.emailCodeLabel}
            rules={[{ required: true }]}
          >
            <Input
              size="large"
              placeholder={copy.emailCodePlaceholder}
              addonAfter={
                <Button
                  type="link"
                  onClick={() => void onSendEmailCode()}
                  loading={sendingCode}
                  disabled={cooldownSeconds > 0 || !watchedEmail}
                >
                  {cooldownSeconds > 0 ? copy.resendIn(cooldownSeconds) : copy.sendCode}
                </Button>
              }
            />
          </Form.Item>

          <Button type="primary" htmlType="submit" block size="large" loading={submitting}>
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
