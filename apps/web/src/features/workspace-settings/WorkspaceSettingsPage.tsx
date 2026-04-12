import type { PlatformDataSnapshot } from '@/lib/api';
import type { DashboardAnnouncementItem, EmailSettingsSummary } from '@platform/types';

import { App, Button, Form, Typography } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { isApiError } from '@/auth/errors';
import { useAuth } from '@/auth/useAuth';
import { useI18n } from '@/i18n/useI18n';
import {
  getEmailSettings,
  updateDashboardConfig,
  updateEmailSettings,
} from '@/lib/api';
import { WorkspaceAnnouncementSettingsCard } from './components/WorkspaceAnnouncementSettingsCard';
import { WorkspaceEmailSettingsCard } from './components/WorkspaceEmailSettingsCard';

const { Paragraph } = Typography;

interface EmailConfigFormValues {
  emailEnabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpUseSsl: boolean;
  smtpUsername: string;
  smtpPassword?: string;
  clearSmtpPassword?: boolean;
  smtpFromEmail: string;
  smtpFromName: string;
  smtpTimeoutSeconds: number;
  emailCodeExpireMinutes: number;
  emailCodeResendSeconds: number;
  imageCaptchaExpireMinutes: number;
}

interface AnnouncementConfigFormValues {
  announcements: DashboardAnnouncementItem[];
}

function cloneDashboardAnnouncementItem(
  item: DashboardAnnouncementItem,
): DashboardAnnouncementItem {
  return {
    id: item.id,
    titleZh: item.titleZh,
    titleEn: item.titleEn,
    summaryZh: item.summaryZh,
    summaryEn: item.summaryEn,
    contentZh: item.contentZh,
    contentEn: item.contentEn,
    tagZh: item.tagZh ?? '',
    tagEn: item.tagEn ?? '',
    publishedAt: item.publishedAt,
    pinned: Boolean(item.pinned),
    published: Boolean(item.published),
  };
}

function sanitizeDashboardAnnouncements(
  announcements: DashboardAnnouncementItem[],
): DashboardAnnouncementItem[] {
  const fallbackBase = Date.now();
  const normalized = announcements.map((item, index) => ({
    id: item.id?.trim() || `announcement-${fallbackBase}-${index + 1}`,
    titleZh: item.titleZh.trim(),
    titleEn: item.titleEn.trim(),
    summaryZh: item.summaryZh.trim(),
    summaryEn: item.summaryEn.trim(),
    contentZh: item.contentZh.trim(),
    contentEn: item.contentEn.trim(),
    tagZh: item.tagZh?.trim() ?? '',
    tagEn: item.tagEn?.trim() ?? '',
    publishedAt: item.publishedAt?.trim() || new Date().toISOString().slice(0, 10),
    pinned: Boolean(item.pinned),
    published: Boolean(item.published),
  }));
  const pinnedId = normalized.find((item) => item.published && item.pinned)?.id;
  return normalized.map((item) => ({
    ...item,
    pinned: item.published && item.id === pinnedId,
  }));
}

export function WorkspaceSettingsPage({
  snapshot,
  onRefresh,
}: {
  snapshot: PlatformDataSnapshot;
  onRefresh: () => Promise<void>;
}) {
  const { message } = App.useApp();
  const { currentUser, token } = useAuth();
  const { locale, t } = useI18n();
  const isAdmin = currentUser?.role === 'ADMIN';
  const [announcementConfigSaving, setAnnouncementConfigSaving] = useState(false);
  const [emailConfigLoading, setEmailConfigLoading] = useState(false);
  const [emailConfigSaving, setEmailConfigSaving] = useState(false);
  const [emailSettings, setEmailSettings] = useState<EmailSettingsSummary | null>(null);
  const [announcementConfigForm] = Form.useForm<AnnouncementConfigFormValues>();
  const [emailConfigForm] = Form.useForm<EmailConfigFormValues>();

  const pageCopy = useMemo(
    () =>
      locale === 'zh-CN'
        ? {
            kicker: '工作空间设置',
            title: '集中管理平台级公告与邮件验证配置',
            copy: '这个页面只负责工作空间级系统设置，不再借用个人资产页的结构与状态。',
          }
        : {
            kicker: 'Workspace Settings',
            title: 'Manage platform announcements and email verification settings',
            copy:
              'This page owns workspace-level configuration directly instead of routing through the personal assets page.',
          },
    [locale],
  );

  const emailConfigCopy = useMemo(
    () =>
      locale === 'zh-CN'
        ? {
            title: '邮件发送配置',
            copy:
              '管理员可在这里配置平台发送验证码邮件使用的邮箱账号。下面的说明按 QQ 邮箱优先写，其他邮箱服务商也可按 SMTP 参数替换。',
            exampleTitle: 'QQ 邮箱推荐填写方式',
            exampleBody:
              '主机填 smtp.qq.com，端口填 465，开启 SSL，用户名和发件邮箱都填完整 QQ 邮箱地址，密码处填写 QQ 邮箱授权码而不是登录密码。',
            enabledLabel: '启用邮件验证功能',
            enabledHelp: '关闭后，注册验证码和修改邮箱验证码都会停用。',
            hostLabel: 'SMTP 服务器地址',
            hostHelp: '邮件服务商提供的 SMTP 地址。QQ 邮箱一般填写 smtp.qq.com。',
            portLabel: 'SMTP 端口',
            portHelp: '和加密方式配套使用。QQ 邮箱通常是 465。',
            sslLabel: '使用 SSL 加密',
            sslHelp: '如果使用 465 端口，通常应保持开启。',
            usernameLabel: 'SMTP 登录账号',
            usernameHelp: '一般填写完整邮箱地址，例如 123456@qq.com。',
            passwordLabel: 'SMTP 密码 / 授权码',
            passwordHelp: 'QQ 邮箱请填写邮箱授权码，而不是网页登录密码。',
            clearPasswordLabel: '清空已存储密码',
            clearPasswordHelp: '仅在你明确要删除当前保存的 SMTP 密码时开启。',
            fromEmailLabel: '发件邮箱地址',
            fromEmailHelp: '邮件中展示的发件地址，通常与 SMTP 登录账号一致。',
            fromNameLabel: '发件显示名称',
            fromNameHelp: '收件人看到的发件人名称，例如 Platform RS Studio。',
            timeoutLabel: '超时秒数',
            timeoutHelp: 'SMTP 连接最大等待时间，通常 15 到 30 秒较合适。',
            codeExpireLabel: '邮箱验证码有效期（分钟）',
            codeExpireHelp: '邮箱验证码有效时长，通常 10 分钟左右。',
            resendLabel: '重发冷却时间（秒）',
            resendHelp: '防止重复发送请求，通常 60 秒左右。',
            captchaExpireLabel: '图形验证码有效期（分钟）',
            captchaExpireHelp: '发送邮箱验证码前图形验证码的有效时长。',
            passwordHint: '留空则保留当前已保存密码。',
            passwordConfigured: '当前已保存 SMTP 密码。',
            save: '保存邮件设置',
            saved: '邮件设置已更新。',
          }
        : {
            title: 'Email delivery settings',
            copy:
              'Administrators can configure the mailbox used to send verification emails here. The hints below use QQ Mail as the default example.',
            exampleTitle: 'Recommended QQ Mail setup',
            exampleBody:
              'Use smtp.qq.com, port 465, keep SSL enabled, set both username and from email to the full QQ mailbox address, and enter the QQ mailbox authorization code instead of the sign-in password.',
            enabledLabel: 'Enable email verification',
            enabledHelp: 'Turn this off to disable registration and change-email verification messages.',
            hostLabel: 'SMTP server host',
            hostHelp: 'The SMTP host provided by your mail provider. For QQ Mail, use smtp.qq.com.',
            portLabel: 'SMTP port',
            portHelp: 'Should match the encryption mode. QQ Mail usually uses 465.',
            sslLabel: 'Use SSL encryption',
            sslHelp: 'If you use port 465, this should usually stay enabled.',
            usernameLabel: 'SMTP sign-in account',
            usernameHelp: 'Usually the full mailbox address, for example 123456@qq.com.',
            passwordLabel: 'SMTP password / auth code',
            passwordHelp:
              'For QQ Mail, enter the mailbox authorization code, not the web sign-in password.',
            clearPasswordLabel: 'Clear stored password',
            clearPasswordHelp:
              'Only turn this on when you want to delete the currently stored SMTP password.',
            fromEmailLabel: 'From email address',
            fromEmailHelp:
              'The sender address shown in the email. Usually the same as the SMTP username.',
            fromNameLabel: 'From display name',
            fromNameHelp: 'The sender name shown to recipients, such as Platform RS Studio.',
            timeoutLabel: 'Timeout (seconds)',
            timeoutHelp: 'Maximum wait time for the SMTP connection. 15 to 30 seconds is typical.',
            codeExpireLabel: 'Email code expiry (minutes)',
            codeExpireHelp: 'How long the email verification code stays valid. 10 minutes is typical.',
            resendLabel: 'Resend cooldown (seconds)',
            resendHelp: 'Prevents repeated send requests. 60 seconds is typical.',
            captchaExpireLabel: 'Image captcha expiry (minutes)',
            captchaExpireHelp: 'How long the image captcha stays valid before sending an email code.',
            passwordHint: 'Leave blank to keep the currently stored password.',
            passwordConfigured: 'An SMTP password is currently stored.',
            save: 'Save email settings',
            saved: 'Email settings updated.',
          },
    [locale],
  );

  const announcementConfigCopy = useMemo(
    () =>
      locale === 'zh-CN'
        ? {
            title: '公告发布',
            copy: '在这里维护平台公告。已发布公告会进入总览页的置顶公告区域，也会进入全局消息铃铛。',
            summaryPublished: '已发布公告',
            summaryPinned: '当前置顶',
            summaryLatest: '最近发布时间',
            summaryEmpty: '当前还没有公告，可以先新增一条。',
            add: '新增公告',
            remove: '删除公告',
            save: '保存公告',
            saved: '公告已更新。',
            cardTitle: '公告',
            publishedAtLabel: '发布时间',
            titleZhLabel: '中文标题',
            titleEnLabel: '英文标题',
            tagZhLabel: '中文标签',
            tagEnLabel: '英文标签',
            summaryZhLabel: '中文简介',
            summaryEnLabel: '英文简介',
            contentZhLabel: '中文正文',
            contentEnLabel: '英文正文',
            publishedLabel: '已发布',
            pinnedLabel: '置顶',
            expandLabel: '展开设置',
            collapseLabel: '收起设置',
          }
        : {
            title: 'Announcement publishing',
            copy:
              'Manage platform announcements here. Published announcements appear in the dashboard pinned notice area and the global inbox bell.',
            summaryPublished: 'Published',
            summaryPinned: 'Pinned now',
            summaryLatest: 'Latest publish date',
            summaryEmpty: 'There are no announcements yet.',
            add: 'Add announcement',
            remove: 'Remove announcement',
            save: 'Save announcements',
            saved: 'Announcements updated.',
            cardTitle: 'Announcement',
            publishedAtLabel: 'Publish date',
            titleZhLabel: 'Chinese title',
            titleEnLabel: 'English title',
            tagZhLabel: 'Chinese tag',
            tagEnLabel: 'English tag',
            summaryZhLabel: 'Chinese summary',
            summaryEnLabel: 'English summary',
            contentZhLabel: 'Chinese content',
            contentEnLabel: 'English content',
            publishedLabel: 'Published',
            pinnedLabel: 'Pinned',
            expandLabel: 'Show settings',
            collapseLabel: 'Collapse',
          },
    [locale],
  );

  const reloadEmailConfig = useCallback(async () => {
    if (!isAdmin || !token) {
      return;
    }

    try {
      setEmailConfigLoading(true);
      const payload = await getEmailSettings(token);
      setEmailSettings(payload);
      emailConfigForm.setFieldsValue({
        emailEnabled: payload.emailEnabled,
        smtpHost: payload.smtpHost,
        smtpPort: payload.smtpPort,
        smtpUseSsl: payload.smtpUseSsl,
        smtpUsername: payload.smtpUsername,
        smtpPassword: '',
        clearSmtpPassword: false,
        smtpFromEmail: payload.smtpFromEmail,
        smtpFromName: payload.smtpFromName,
        smtpTimeoutSeconds: payload.smtpTimeoutSeconds,
        emailCodeExpireMinutes: payload.emailCodeExpireMinutes,
        emailCodeResendSeconds: payload.emailCodeResendSeconds,
        imageCaptchaExpireMinutes: payload.imageCaptchaExpireMinutes,
      });
    } catch (error) {
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    } finally {
      setEmailConfigLoading(false);
    }
  }, [emailConfigForm, isAdmin, message, t, token]);

  useEffect(() => {
    void reloadEmailConfig();
  }, [reloadEmailConfig]);

  useEffect(() => {
    announcementConfigForm.setFieldsValue({
      announcements: snapshot.dashboardConfig.announcements.map((item) =>
        cloneDashboardAnnouncementItem(item),
      ),
    });
  }, [announcementConfigForm, snapshot.dashboardConfig.announcements]);

  const handleRefreshPage = useCallback(async () => {
    await Promise.all([reloadEmailConfig(), onRefresh()]);
  }, [onRefresh, reloadEmailConfig]);

  const handleSaveEmailConfig = async () => {
    if (!token || !isAdmin) {
      return;
    }

    try {
      setEmailConfigSaving(true);
      const values = await emailConfigForm.validateFields();
      const payload = await updateEmailSettings(token, {
        emailEnabled: values.emailEnabled,
        smtpHost: values.smtpHost,
        smtpPort: values.smtpPort,
        smtpUseSsl: values.smtpUseSsl,
        smtpUsername: values.smtpUsername,
        smtpPassword: values.smtpPassword?.trim() ? values.smtpPassword : undefined,
        clearSmtpPassword: Boolean(values.clearSmtpPassword),
        smtpFromEmail: values.smtpFromEmail,
        smtpFromName: values.smtpFromName,
        smtpTimeoutSeconds: values.smtpTimeoutSeconds,
        emailCodeExpireMinutes: values.emailCodeExpireMinutes,
        emailCodeResendSeconds: values.emailCodeResendSeconds,
        imageCaptchaExpireMinutes: values.imageCaptchaExpireMinutes,
      });
      setEmailSettings(payload);
      emailConfigForm.setFieldsValue({
        ...values,
        smtpPassword: '',
        clearSmtpPassword: false,
      });
      message.success(emailConfigCopy.saved);
    } catch (error) {
      if (!isApiError(error) && error instanceof Error && error.message === 'Validate Error') {
        return;
      }
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    } finally {
      setEmailConfigSaving(false);
    }
  };

  const handleSaveAnnouncementConfig = async () => {
    if (!token || !isAdmin) {
      return;
    }

    try {
      setAnnouncementConfigSaving(true);
      const values = await announcementConfigForm.validateFields();
      const payload = await updateDashboardConfig(token, {
        featureSections: snapshot.dashboardConfig.featureSections,
        announcements: sanitizeDashboardAnnouncements(values.announcements ?? []),
      });
      announcementConfigForm.setFieldsValue({
        announcements: payload.announcements.map((item) => cloneDashboardAnnouncementItem(item)),
      });
      await onRefresh();
      message.success(announcementConfigCopy.saved);
    } catch (error) {
      if (!isApiError(error) && error instanceof Error && error.message === 'Validate Error') {
        return;
      }
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    } finally {
      setAnnouncementConfigSaving(false);
    }
  };

  return (
    <div className="page-stack">
      <div className="section-header">
        <div className="section-header-actions">
          <div>
            <div className="panel-kicker">{pageCopy.kicker}</div>
            <h2 className="section-title">{pageCopy.title}</h2>
            <Paragraph className="section-copy">{pageCopy.copy}</Paragraph>
          </div>
          <div className="section-actions">
            <Button onClick={() => void handleRefreshPage()}>{t('common.refresh')}</Button>
          </div>
        </div>
      </div>

      <WorkspaceAnnouncementSettingsCard
        form={announcementConfigForm}
        copy={announcementConfigCopy}
        saving={announcementConfigSaving}
        onSave={() => void handleSaveAnnouncementConfig()}
      />

      <WorkspaceEmailSettingsCard
        form={emailConfigForm}
        emailSettings={emailSettings}
        copy={emailConfigCopy}
        loading={emailConfigLoading}
        saving={emailConfigSaving}
        onSave={() => void handleSaveEmailConfig()}
      />
    </div>
  );
}
