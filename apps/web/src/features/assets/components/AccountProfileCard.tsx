import type { AuthUser } from '@platform/types';

import { Avatar, Button, Card, Form, Input, Select, Space, Typography } from 'antd';
import type { FormInstance } from 'antd';
import type { ChangeEvent, RefObject } from 'react';

const { Paragraph } = Typography;

interface AccountProfileCopy {
  title: string;
  copy: string;
  profilePreview: string;
  profileMetaFallback: string;
  uploadAvatar: string;
  removeAvatar: string;
  jobTitleLabel: string;
  organizationLabel: string;
  bioLabel: string;
  roleLabel: string;
  approvalLabel: string;
  lastLoginLabel: string;
  noLastLogin: string;
  captchaLabel: string;
  captchaPlaceholder: string;
  refreshCaptcha: string;
  emailCodeLabel: string;
  emailCodePlaceholder: string;
  resendIn: (seconds: number) => string;
  sendCode: string;
  saveProfile: string;
}

interface AccountProfileCardProps {
  currentUser: AuthUser | null;
  profileForm: FormInstance;
  avatarInputRef: RefObject<HTMLInputElement | null>;
  watchedAvatarUrl: string;
  watchedJobTitle: string;
  watchedOrganization: string;
  watchedProfileEmail: string;
  profileCaptchaImageUrl: string;
  profileCaptchaLoading: boolean;
  profileEmailCooldown: number;
  profileSaving: boolean;
  currentRoleLabel: string;
  displayNameLabel: string;
  preferredLocaleLabel: string;
  emailLabel: string;
  localeOptions: Array<{ value: 'zh-CN' | 'en-US'; label: string }>;
  copy: AccountProfileCopy;
  renderInitials: (name: string | undefined) => string;
  lastLoginText: string;
  onAvatarFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onTriggerAvatarSelect: () => void;
  onRemoveAvatar: () => void;
  onRefreshCaptcha: () => void;
  onSendEmailCode: () => void;
  onSave: () => void;
}

export function AccountProfileCard({
  currentUser,
  profileForm,
  avatarInputRef,
  watchedAvatarUrl,
  watchedJobTitle,
  watchedOrganization,
  watchedProfileEmail,
  profileCaptchaImageUrl,
  profileCaptchaLoading,
  profileEmailCooldown,
  profileSaving,
  currentRoleLabel,
  displayNameLabel,
  preferredLocaleLabel,
  emailLabel,
  localeOptions,
  copy,
  renderInitials,
  lastLoginText,
  onAvatarFileChange,
  onTriggerAvatarSelect,
  onRemoveAvatar,
  onRefreshCaptcha,
  onSendEmailCode,
  onSave,
}: AccountProfileCardProps) {
  const profileDisplayName = profileForm.getFieldValue('displayName') ?? currentUser?.displayName;
  const shouldShowEmailVerification =
    Boolean(watchedProfileEmail?.trim()) &&
    watchedProfileEmail.trim().toLowerCase() !== currentUser?.email?.trim().toLowerCase();

  return (
    <Card className="panel-card" variant="borderless">
      <div className="panel-kicker">{copy.title}</div>
      <Paragraph className="section-copy">{copy.copy}</Paragraph>
      <Form form={profileForm} layout="vertical">
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          tabIndex={-1}
          aria-hidden="true"
          onChange={onAvatarFileChange}
        />
        <Form.Item name="avatarUrl" hidden>
          <Input />
        </Form.Item>

        <div className="profile-identity-card">
          <Avatar
            size={88}
            src={watchedAvatarUrl || currentUser?.avatarUrl}
            className="profile-identity-avatar"
          >
            {renderInitials(profileDisplayName ?? currentUser?.displayName)}
          </Avatar>
          <div className="profile-identity-body">
            <div className="panel-kicker">{copy.profilePreview}</div>
            <div className="profile-identity-name">{profileDisplayName ?? currentUser?.displayName}</div>
            <div className="profile-identity-meta">
              {watchedJobTitle || watchedOrganization
                ? [watchedJobTitle, watchedOrganization].filter(Boolean).join(' / ')
                : copy.profileMetaFallback}
            </div>
            <Space wrap>
              <Button onClick={onTriggerAvatarSelect}>{copy.uploadAvatar}</Button>
              {watchedAvatarUrl ? <Button onClick={onRemoveAvatar}>{copy.removeAvatar}</Button> : null}
            </Space>
          </div>
        </div>

        <div className="profile-grid">
          <Form.Item name="displayName" label={displayNameLabel} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="preferredLocale" label={preferredLocaleLabel} rules={[{ required: true }]}>
            <Select options={localeOptions} />
          </Form.Item>
          <Form.Item name="email" label={emailLabel} rules={[{ required: true }, { type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="jobTitle" label={copy.jobTitleLabel}>
            <Input />
          </Form.Item>
          <Form.Item name="organization" label={copy.organizationLabel}>
            <Input />
          </Form.Item>
          <Form.Item name="bio" label={copy.bioLabel} className="profile-grid-span-full">
            <Input.TextArea rows={4} />
          </Form.Item>
          <div className="profile-summary-card">
            <div>
              <strong>{copy.roleLabel}</strong>
              <div>{currentRoleLabel}</div>
            </div>
            <div>
              <strong>{copy.approvalLabel}</strong>
              <div>{currentUser?.approvalStatus ?? '-'}</div>
            </div>
            <div>
              <strong>{copy.lastLoginLabel}</strong>
              <div>{lastLoginText || copy.noLastLogin}</div>
            </div>
          </div>
        </div>

        {shouldShowEmailVerification ? (
          <div className="profile-email-verify">
            <div className="profile-email-row">
              <Form.Item name="captchaCode" label={copy.captchaLabel} rules={[{ required: true }]}>
                <Input placeholder={copy.captchaPlaceholder} />
              </Form.Item>
              <div className="auth-captcha-box">
                {profileCaptchaImageUrl ? (
                  <img src={profileCaptchaImageUrl} alt="captcha" className="auth-captcha-image" />
                ) : null}
              </div>
              <Button onClick={onRefreshCaptcha} loading={profileCaptchaLoading}>
                {copy.refreshCaptcha}
              </Button>
            </div>
            <Form.Item name="emailCode" label={copy.emailCodeLabel}>
              <Input
                placeholder={copy.emailCodePlaceholder}
                addonAfter={
                  <Button type="link" onClick={onSendEmailCode} disabled={profileEmailCooldown > 0}>
                    {profileEmailCooldown > 0 ? copy.resendIn(profileEmailCooldown) : copy.sendCode}
                  </Button>
                }
              />
            </Form.Item>
          </div>
        ) : null}

        <Button type="primary" onClick={onSave} loading={profileSaving}>
          {copy.saveProfile}
        </Button>
      </Form>
    </Card>
  );
}
