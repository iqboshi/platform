import type { EmailSettingsSummary } from '@platform/types';

import { Button, Card, Form, Input, InputNumber, Space, Switch, Typography } from 'antd';
import type { FormInstance } from 'antd';
import { useState } from 'react';

const { Paragraph } = Typography;

interface WorkspaceEmailSettingsCopy {
  title: string;
  copy: string;
  exampleTitle: string;
  exampleBody: string;
  enabledLabel: string;
  enabledHelp: string;
  sslLabel: string;
  sslHelp: string;
  hostLabel: string;
  hostHelp: string;
  portLabel: string;
  portHelp: string;
  usernameLabel: string;
  usernameHelp: string;
  passwordLabel: string;
  passwordConfigured: string;
  passwordHint: string;
  passwordHelp: string;
  clearPasswordLabel: string;
  clearPasswordHelp: string;
  fromEmailLabel: string;
  fromEmailHelp: string;
  fromNameLabel: string;
  fromNameHelp: string;
  timeoutLabel: string;
  timeoutHelp: string;
  codeExpireLabel: string;
  codeExpireHelp: string;
  resendLabel: string;
  resendHelp: string;
  captchaExpireLabel: string;
  captchaExpireHelp: string;
  save: string;
  deliverySectionTitle?: string;
  deliverySectionCopy?: string;
  identitySectionTitle?: string;
  identitySectionCopy?: string;
  policySectionTitle?: string;
  policySectionCopy?: string;
  expandLabel?: string;
  collapseLabel?: string;
}

interface WorkspaceEmailSettingsCardProps {
  form: FormInstance;
  emailSettings: EmailSettingsSummary | null;
  copy: WorkspaceEmailSettingsCopy;
  loading: boolean;
  saving: boolean;
  onSave: () => void;
}

export function WorkspaceEmailSettingsCard({
  form,
  emailSettings,
  copy,
  loading,
  saving,
  onSave,
}: WorkspaceEmailSettingsCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isChineseCopy = /[\u4e00-\u9fff]/.test(copy.title);
  const sectionCopy = {
    deliverySectionTitle: copy.deliverySectionTitle ?? (isChineseCopy ? 'SMTP 通道' : 'Delivery channel'),
    deliverySectionCopy:
      copy.deliverySectionCopy ??
      (isChineseCopy
        ? '配置 SMTP 开关、SSL、主机、端口和超时，用于平台验证码邮件发送。'
        : 'Configure enablement, SSL, host, port, and timeout for SMTP transport.'),
    identitySectionTitle: copy.identitySectionTitle ?? (isChineseCopy ? '发件身份' : 'Sender identity'),
    identitySectionCopy:
      copy.identitySectionCopy ??
      (isChineseCopy
        ? '维护登录账号、存储密码以及收件人实际看到的发件信息。'
        : 'Maintain the sign-in account, stored credential, and sender information.'),
    policySectionTitle: copy.policySectionTitle ?? (isChineseCopy ? '验证策略' : 'Verification policy'),
    policySectionCopy:
      copy.policySectionCopy ??
      (isChineseCopy
        ? '统一设置邮箱验证码和图形验证码的有效期与重发节流。'
        : 'Control expiry and resend timing for email codes and image captcha challenges.'),
  };
  const expandLabel = copy.expandLabel ?? (isChineseCopy ? '展开设置' : 'Show settings');
  const collapseLabel = copy.collapseLabel ?? (isChineseCopy ? '收起设置' : 'Collapse');

  return (
    <div className="workspace-settings-stack">
      <Card className="panel-card" variant="borderless">
        <div className="workspace-settings-header">
          <div className="workspace-settings-intro">
            <div className="panel-kicker">{copy.title}</div>
            <Paragraph className="section-copy">{copy.copy}</Paragraph>
          </div>
          <Space wrap className="workspace-settings-header-actions">
            <Button
              className="workspace-settings-toggle"
              onClick={() => setExpanded((current) => !current)}
              aria-expanded={expanded}
            >
              {expanded ? collapseLabel : expandLabel}
            </Button>
            {expanded ? (
              <Button type="primary" onClick={onSave} loading={saving || loading}>
                {copy.save}
              </Button>
            ) : null}
          </Space>
        </div>

        <div className="workspace-settings-body">
          <div className="profile-config-tip workspace-settings-example">
            <strong>{copy.exampleTitle}</strong>
            <div>{copy.exampleBody}</div>
          </div>

          {expanded ? (
            <Form form={form} layout="vertical">
              <div className="workspace-settings-form">
                <section className="workspace-settings-group">
                  <div className="workspace-settings-group-head">
                    <div className="panel-kicker">{sectionCopy.deliverySectionTitle}</div>
                    <Paragraph className="workspace-settings-group-copy">
                      {sectionCopy.deliverySectionCopy}
                    </Paragraph>
                  </div>
                  <div className="profile-email-config-grid">
                    <Form.Item
                      name="emailEnabled"
                      label={copy.enabledLabel}
                      valuePropName="checked"
                      extra={copy.enabledHelp}
                    >
                      <Switch />
                    </Form.Item>
                    <Form.Item
                      name="smtpUseSsl"
                      label={copy.sslLabel}
                      valuePropName="checked"
                      extra={copy.sslHelp}
                    >
                      <Switch />
                    </Form.Item>
                    <Form.Item
                      name="smtpHost"
                      label={copy.hostLabel}
                      rules={[{ required: true }]}
                      extra={copy.hostHelp}
                    >
                      <Input />
                    </Form.Item>
                    <Form.Item
                      name="smtpPort"
                      label={copy.portLabel}
                      rules={[{ required: true }]}
                      extra={copy.portHelp}
                    >
                      <InputNumber min={1} max={65535} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item
                      name="smtpTimeoutSeconds"
                      label={copy.timeoutLabel}
                      rules={[{ required: true }]}
                      extra={copy.timeoutHelp}
                    >
                      <InputNumber min={1} max={120} style={{ width: '100%' }} />
                    </Form.Item>
                  </div>
                </section>

                <section className="workspace-settings-group">
                  <div className="workspace-settings-group-head">
                    <div className="panel-kicker">{sectionCopy.identitySectionTitle}</div>
                    <Paragraph className="workspace-settings-group-copy">
                      {sectionCopy.identitySectionCopy}
                    </Paragraph>
                  </div>
                  <div className="profile-email-config-grid">
                    <Form.Item name="smtpUsername" label={copy.usernameLabel} extra={copy.usernameHelp}>
                      <Input />
                    </Form.Item>
                    <Form.Item
                      name="smtpPassword"
                      label={copy.passwordLabel}
                      extra={
                        emailSettings?.smtpPasswordConfigured
                          ? `${copy.passwordConfigured} ${copy.passwordHint} ${copy.passwordHelp}`
                          : `${copy.passwordHint} ${copy.passwordHelp}`
                      }
                    >
                      <Input.Password />
                    </Form.Item>
                    <Form.Item
                      name="clearSmtpPassword"
                      label={copy.clearPasswordLabel}
                      valuePropName="checked"
                      extra={copy.clearPasswordHelp}
                    >
                      <Switch />
                    </Form.Item>
                    <Form.Item
                      name="smtpFromEmail"
                      label={copy.fromEmailLabel}
                      extra={copy.fromEmailHelp}
                    >
                      <Input />
                    </Form.Item>
                    <Form.Item name="smtpFromName" label={copy.fromNameLabel} extra={copy.fromNameHelp}>
                      <Input />
                    </Form.Item>
                  </div>
                </section>

                <section className="workspace-settings-group">
                  <div className="workspace-settings-group-head">
                    <div className="panel-kicker">{sectionCopy.policySectionTitle}</div>
                    <Paragraph className="workspace-settings-group-copy">
                      {sectionCopy.policySectionCopy}
                    </Paragraph>
                  </div>
                  <div className="profile-email-config-grid">
                    <Form.Item
                      name="emailCodeExpireMinutes"
                      label={copy.codeExpireLabel}
                      rules={[{ required: true }]}
                      extra={copy.codeExpireHelp}
                    >
                      <InputNumber min={1} max={120} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item
                      name="emailCodeResendSeconds"
                      label={copy.resendLabel}
                      rules={[{ required: true }]}
                      extra={copy.resendHelp}
                    >
                      <InputNumber min={0} max={3600} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item
                      name="imageCaptchaExpireMinutes"
                      label={copy.captchaExpireLabel}
                      rules={[{ required: true }]}
                      extra={copy.captchaExpireHelp}
                    >
                      <InputNumber min={1} max={60} style={{ width: '100%' }} />
                    </Form.Item>
                  </div>
                </section>
              </div>
            </Form>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
