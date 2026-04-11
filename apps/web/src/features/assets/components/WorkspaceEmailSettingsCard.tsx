import type { EmailSettingsSummary } from '@platform/types';

import { Button, Card, Form, Input, InputNumber, Switch, Typography } from 'antd';
import type { FormInstance } from 'antd';

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
  return (
    <Card className="panel-card" variant="borderless">
      <div className="panel-kicker">{copy.title}</div>
      <Paragraph className="section-copy">{copy.copy}</Paragraph>
      <div className="profile-config-tip">
        <strong>{copy.exampleTitle}</strong>
        <div>{copy.exampleBody}</div>
      </div>
      <Form form={form} layout="vertical">
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
            name="smtpUsername"
            label={copy.usernameLabel}
            extra={copy.usernameHelp}
          >
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
          <Form.Item
            name="smtpFromName"
            label={copy.fromNameLabel}
            extra={copy.fromNameHelp}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="smtpTimeoutSeconds"
            label={copy.timeoutLabel}
            rules={[{ required: true }]}
            extra={copy.timeoutHelp}
          >
            <InputNumber min={1} max={120} style={{ width: '100%' }} />
          </Form.Item>
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
        <Button type="primary" onClick={onSave} loading={saving || loading}>
          {copy.save}
        </Button>
      </Form>
    </Card>
  );
}
