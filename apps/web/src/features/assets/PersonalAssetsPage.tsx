import type { AssetOverview, PlatformDataSnapshot } from '@/lib/api';
import type {
  AssetScope,
  DatasetKind,
  EmailSettingsSummary,
  ProductAssetSummary,
  RoleUpgradeRequestSummary,
} from '@platform/types';

import {
  App,
  Avatar,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { isApiError } from '@/auth/errors';
import { useAuth } from '@/auth/useAuth';
import { useI18n } from '@/i18n/useI18n';
import {
  deleteDataset,
  deleteGeeCredential,
  deleteModelVersion,
  deleteSpatialOverlay,
  deleteSpatialRoi,
  deleteWorkflowVersion,
  setPlatformDefaultGeeCredential,
  downloadDatasetVersion,
  downloadModelVersion,
  downloadWorkflowVersion,
  createGeeCredential,
  createRoleUpgradeRequest,
  changeCurrentUserPassword,
  deleteProductAsset,
  getEmailSettings,
  importWorkflowVersion,
  getImageCaptcha,
  listMyRoleUpgradeRequests,
  loadAssetOverview,
  downloadProductAsset,
  sendEmailVerificationCode,
  updateProductAsset,
  updateEmailSettings,
  updateCurrentUserProfile,
  updateDataset,
  uploadProductAsset,
  uploadDataset,
} from '@/lib/api';
import {
  datasetKindKey,
  datasetStatusKey,
  roleKey,
  workflowRunStatusKey,
} from '@/lib/i18n-helpers';
import { parseImportedWorkflowGraph } from '@/lib/workflow-import';
import { downloadUploadTemplate } from '../datasets/upload-templates';

const { Paragraph, Text } = Typography;

function getMetadataString(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key];
  return typeof value === 'string' ? value : '';
}

function getMetadataNumber(metadata: Record<string, unknown>, key: string): number | undefined {
  const value = metadata[key];
  return typeof value === 'number' ? value : undefined;
}

function getMetadataStringList(metadata: Record<string, unknown>, key: string): string[] {
  const value = metadata[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function getSampleRecord(metadata: Record<string, unknown>): Record<string, unknown> | undefined {
  const direct = metadata.sample_record;
  if (typeof direct === 'object' && direct !== null && !Array.isArray(direct)) {
    return direct as Record<string, unknown>;
  }

  const rows = metadata.sample_rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return undefined;
  }
  const first = rows[0];
  return typeof first === 'object' && first !== null && !Array.isArray(first)
    ? (first as Record<string, unknown>)
    : undefined;
}

function tagsTextFromList(values: string[] | undefined): string {
  return (values ?? []).join(', ');
}

function highlightsTextFromList(values: string[] | undefined): string {
  return (values ?? []).join('\n');
}

function specificationsTextFromMap(values: Record<string, string> | undefined): string {
  return Object.entries(values ?? {})
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
}

function parseProductTags(text: string | undefined): string[] {
  return (text ?? '')
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseProductHighlights(text: string | undefined): string[] {
  return (text ?? '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseProductSpecifications(text: string | undefined): Record<string, string> {
  const lines = (text ?? '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  const specificationMap: Record<string, string> = {};
  for (const line of lines) {
    const delimiterIndex = line.indexOf(':');
    if (delimiterIndex <= 0) {
      continue;
    }
    const key = line.slice(0, delimiterIndex).trim();
    const value = line.slice(delimiterIndex + 1).trim();
    if (key && value) {
      specificationMap[key] = value;
    }
  }
  return specificationMap;
}

interface UploadFormValues {
  datasetName: string;
  description?: string;
  kind: DatasetKind;
}

interface RenameFormValues {
  datasetName: string;
  description?: string;
  originalFileName?: string;
  contentType?: string;
  rowCount?: string;
  columnsText?: string;
  sampleRecordJson?: string;
}

interface ProductFormValues {
  name: string;
  description?: string;
  category?: string;
  tagsText?: string;
  highlightsText?: string;
  specificationsText?: string;
  visibility?: 'private' | 'public';
}

interface GeeCredentialFormValues {
  name: string;
  description?: string;
  projectId?: string;
  serviceAccountJson: string;
}

interface ProfileFormValues {
  displayName: string;
  email: string;
  preferredLocale: 'zh-CN' | 'en-US';
  avatarUrl?: string;
  jobTitle?: string;
  organization?: string;
  bio?: string;
  emailCode?: string;
  captchaCode?: string;
}

interface PasswordFormValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface RoleRequestFormValues {
  reason: string;
}

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

function initialsForName(name: string | undefined): string {
  const cleaned = (name ?? '').trim();
  if (!cleaned) {
    return 'U';
  }
  const parts = cleaned.split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join('');
}

const ASSET_TABLE_PAGINATION = {
  pageSize: 8,
  showSizeChanger: true,
  pageSizeOptions: ['8', '20', '50'],
  hideOnSinglePage: true,
};

const PROFILE_TABLE_PAGINATION = {
  pageSize: 5,
  showSizeChanger: true,
  pageSizeOptions: ['5', '10', '20'],
  hideOnSinglePage: true,
};

export function PersonalAssetsPage({
  snapshot,
  onRefresh,
}: {
  snapshot: PlatformDataSnapshot;
  onRefresh: () => Promise<void>;
}) {
  const { message, modal } = App.useApp();
  const { currentUser, refreshCurrentUser, token } = useAuth();
  const { locale, t } = useI18n();
  const [scope, setScope] = useState<AssetScope>('mine');
  const [overview, setOverview] = useState<AssetOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [credentialOpen, setCredentialOpen] = useState(false);
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedProductFile, setSelectedProductFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [roleRequestSaving, setRoleRequestSaving] = useState(false);
  const [emailConfigLoading, setEmailConfigLoading] = useState(false);
  const [emailConfigSaving, setEmailConfigSaving] = useState(false);
  const [emailSettings, setEmailSettings] = useState<EmailSettingsSummary | null>(null);
  const [roleRequestsLoading, setRoleRequestsLoading] = useState(false);
  const [roleRequests, setRoleRequests] = useState<RoleUpgradeRequestSummary[]>([]);
  const [profileCaptchaKey, setProfileCaptchaKey] = useState('');
  const [profileCaptchaImageUrl, setProfileCaptchaImageUrl] = useState('');
  const [profileCaptchaLoading, setProfileCaptchaLoading] = useState(false);
  const [profileEmailCooldown, setProfileEmailCooldown] = useState(0);
  const [profileSentEmail, setProfileSentEmail] = useState('');
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const productFileInputRef = useRef<HTMLInputElement | null>(null);
  const adminScopeInitializedRef = useRef(false);
  const [uploadForm] = Form.useForm<UploadFormValues>();
  const [productForm] = Form.useForm<ProductFormValues>();
  const [credentialForm] = Form.useForm<GeeCredentialFormValues>();
  const [renameForm] = Form.useForm<RenameFormValues>();
  const [profileForm] = Form.useForm<ProfileFormValues>();
  const [passwordForm] = Form.useForm<PasswordFormValues>();
  const [roleRequestForm] = Form.useForm<RoleRequestFormValues>();
  const [emailConfigForm] = Form.useForm<EmailConfigFormValues>();
  const selectedUploadKind = Form.useWatch('kind', uploadForm) ?? 'table';
  const watchedProfileEmail = Form.useWatch('email', profileForm) ?? '';
  const watchedAvatarUrl = Form.useWatch('avatarUrl', profileForm) ?? '';
  const watchedJobTitle = Form.useWatch('jobTitle', profileForm) ?? '';
  const watchedOrganization = Form.useWatch('organization', profileForm) ?? '';

  const isAdmin = currentUser?.role === 'ADMIN';
  const platformOwnerLabel = t('assets.platformOwner');
  const geeCopy =
    locale === 'zh-CN'
      ? {
          tab: 'GEE 凭据',
          add: '新增 GEE 凭据',
          name: '名称',
          project: '项目 ID',
          email: '服务账号',
          description: '说明',
          serviceAccountJson: 'Service Account JSON',
          createTitle: '新增 GEE 凭据',
          createSuccess: 'GEE 凭据已保存。',
          deleteTitle: '删除 GEE 凭据',
          deleteBody: '删除后，该凭据将不能再被工作流节点引用。',
          deleteSuccess: 'GEE 凭据已删除。',
          empty: '当前范围下没有 GEE 凭据。',
        }
      : {
          tab: 'GEE Credentials',
          add: 'Add GEE Credential',
          name: 'Name',
          project: 'Project ID',
          email: 'Service Account',
          description: 'Description',
          serviceAccountJson: 'Service Account JSON',
          createTitle: 'Create GEE Credential',
          createSuccess: 'GEE credential saved.',
          deleteTitle: 'Delete GEE credential',
          deleteBody: 'After deletion, workflow nodes can no longer use this credential.',
          deleteSuccess: 'GEE credential deleted.',
          empty: 'No GEE credentials found for the current scope.',
        };
  const geePlatformCopy =
    locale === 'zh-CN'
      ? {
          platformDefault: '平台默认',
          setPlatformDefault: '设为平台默认',
          platformDefaultSet: '已设为平台默认凭据。',
        }
      : {
          platformDefault: 'Platform Default',
          setPlatformDefault: 'Set As Platform Default',
        platformDefaultSet: 'Platform default GEE credential updated.',
        };
  const productCopy =
    locale === 'zh-CN'
      ? {
          tab: '产品',
          upload: '上传产品',
          createTitle: '上传产品资产',
          editTitle: '编辑产品资产',
          uploadSuccess: '产品资产已上传。',
          updateSuccess: '产品资产已更新。',
          deleteSuccess: '产品资产已删除。',
          deleteTitle: '删除产品资产',
          deleteBody: '删除后，该产品将不会再出现在产品展示页，也无法继续下载。',
          name: '产品名称',
          description: '介绍',
          category: '分类',
          tags: '标签',
          tagsHint: '可用逗号或换行分隔多个标签。',
          highlights: '亮点',
          highlightsHint: '每行一条亮点描述。',
          specifications: '规格信息',
          specificationsHint: '每行使用 “字段: 值” 的格式，例如：重量: 1.5 kg',
          file: '模型文件',
          fileHint: '支持 .stp / .step / .igs / .iges。',
          visibility: '公开状态',
          visibilityPrivate: '私有',
          visibilityPublic: '公开',
          owner: '拥有者',
          replaceFile: '替换模型文件',
          download: '下载模型',
          empty: '当前范围下还没有产品资产。',
          noFileSelected: '请选择产品模型文件。',
        }
      : {
          tab: 'Products',
          upload: 'Upload Product',
          createTitle: 'Upload Product Asset',
          editTitle: 'Edit Product Asset',
          uploadSuccess: 'Product asset uploaded.',
          updateSuccess: 'Product asset updated.',
          deleteSuccess: 'Product asset deleted.',
          deleteTitle: 'Delete product asset',
          deleteBody: 'After deletion, the product will disappear from the showcase and can no longer be downloaded.',
          name: 'Product name',
          description: 'Description',
          category: 'Category',
          tags: 'Tags',
          tagsHint: 'Separate tags with commas or new lines.',
          highlights: 'Highlights',
          highlightsHint: 'One highlight per line.',
          specifications: 'Specifications',
          specificationsHint: 'Use one `key: value` pair per line, for example `Weight: 1.5 kg`.',
          file: 'Model file',
          fileHint: 'Supports .stp / .step / .igs / .iges.',
          visibility: 'Visibility',
          visibilityPrivate: 'Private',
          visibilityPublic: 'Public',
          owner: 'Owner',
          replaceFile: 'Replace model file',
          download: 'Download model',
          empty: 'No product assets found for the current scope.',
          noFileSelected: 'Select a product model file first.',
        };
  const profileCopy =
    locale === 'zh-CN'
      ? {
          title: '个人资料',
          copy: '查看并更新当前账号的基础信息、登录邮箱和安全设置。',
          saveProfile: '保存资料',
          profileUpdated: '个人资料已更新。',
          avatarTitle: '头像',
          uploadAvatar: '上传头像',
          removeAvatar: '移除头像',
          avatarTooLarge: '头像文件不能超过 512 KB。',
          avatarLoadFailed: '头像读取失败，请重试。',
          jobTitleLabel: '职位',
          organizationLabel: '所属组织',
          bioLabel: '个人简介',
          profilePreview: '资料预览',
          profileMetaFallback: '补充职位和组织信息后会在这里展示。',
          passwordTitle: '修改密码',
          passwordCopy: '修改密码时需要先输入当前密码。',
          passwordUpdated: '密码已更新。',
          currentPassword: '当前密码',
          newPassword: '新密码',
          confirmPassword: '确认新密码',
          emailCodeLabel: '新邮箱验证码',
          emailCodePlaceholder: '输入发送到新邮箱的 6 位验证码',
          captchaLabel: '图片验证码',
          captchaPlaceholder: '输入图片中的字符',
          refreshCaptcha: '换一张',
          sendCode: '发送邮箱验证码',
          resendIn: (seconds: number) => `${seconds}s 后可重发`,
          sendCodeSuccess: '邮箱验证码已发送。',
          roleLabel: '当前角色',
          approvalLabel: '审批状态',
          lastLoginLabel: '最近登录',
          noLastLogin: '暂无记录',
          emailMismatch: '邮箱已变更，请重新发送验证码。',
          emailCodeRequired: '修改邮箱时必须填写邮箱验证码。',
          captchaRequired: '请先输入图片验证码。',
          captchaLoadFailed: '验证码加载失败，请稍后重试。',
          captchaInvalid: '图片验证码错误或已失效。',
          emailCodeInvalid: '邮箱验证码错误或已失效。',
          emailVerificationDisabled: '平台尚未配置邮件验证服务。',
          emailCodeCooldown: '验证码发送过于频繁，请稍后再试。',
          deliveryFailed: '邮件发送失败，请检查 SMTP 配置。',
          currentPasswordInvalid: '当前密码不正确。',
          emailExists: '该邮箱已被注册。',
          passwordMismatch: '两次输入的新密码不一致。',
        }
      : {
          title: 'Profile',
          copy: 'Review and update your account details, sign-in email, and security settings.',
          saveProfile: 'Save profile',
          profileUpdated: 'Profile updated.',
          avatarTitle: 'Avatar',
          uploadAvatar: 'Upload avatar',
          removeAvatar: 'Remove avatar',
          avatarTooLarge: 'Avatar file must be smaller than 512 KB.',
          avatarLoadFailed: 'Failed to read the avatar file.',
          jobTitleLabel: 'Job title',
          organizationLabel: 'Organization',
          bioLabel: 'Bio',
          profilePreview: 'Profile preview',
          profileMetaFallback: 'Add a title and organization to show them here.',
          passwordTitle: 'Change password',
          passwordCopy: 'Enter your current password before setting a new one.',
          passwordUpdated: 'Password updated.',
          currentPassword: 'Current password',
          newPassword: 'New password',
          confirmPassword: 'Confirm new password',
          emailCodeLabel: 'New email verification code',
          emailCodePlaceholder: 'Enter the 6-digit code sent to the new email',
          captchaLabel: 'Image captcha',
          captchaPlaceholder: 'Enter the characters from the image',
          refreshCaptcha: 'Refresh',
          sendCode: 'Send email code',
          resendIn: (seconds: number) => `Resend in ${seconds}s`,
          sendCodeSuccess: 'Verification email sent.',
          roleLabel: 'Current role',
          approvalLabel: 'Approval status',
          lastLoginLabel: 'Last login',
          noLastLogin: 'No login record yet',
          emailMismatch: 'The email changed. Please send a new verification code.',
          emailCodeRequired: 'Email verification code is required when changing email.',
          captchaRequired: 'Please enter the image captcha first.',
          captchaLoadFailed: 'Failed to load image captcha.',
          captchaInvalid: 'Image captcha is invalid or expired.',
          emailCodeInvalid: 'Email verification code is invalid or expired.',
          emailVerificationDisabled: 'Email verification is not configured on this platform.',
          emailCodeCooldown: 'Too many requests. Please wait before sending again.',
          deliveryFailed: 'Failed to send email. Check SMTP configuration.',
          currentPasswordInvalid: 'Current password is incorrect.',
          emailExists: 'This email is already registered.',
          passwordMismatch: 'The new passwords do not match.',
        };
  const roleRequestCopy =
    locale === 'zh-CN'
      ? {
          title: '权限提升申请',
          copy: '成员可在这里申请提升为算法工程师，管理员会在审批后台统一处理。',
          requestTitle: '申请成为算法工程师',
          reasonLabel: '申请理由',
          submit: '提交申请',
          submitted: '权限申请已提交。',
          currentRoleOnly: '当前账号无需再申请权限提升。',
          empty: '当前还没有权限申请记录。',
          tableRequester: '申请人',
          tableCurrentRole: '当前角色',
          tableRequestedRole: '目标角色',
          tableStatus: '状态',
          tableReason: '申请理由',
          tableReviewNote: '审批备注',
          tableCreatedAt: '申请时间',
          reviewedBy: '审批人',
          reviewedAt: '审批时间',
          statusPending: '待审批',
          statusApproved: '已通过',
          statusRejected: '已拒绝',
          latestTitle: '最新申请',
          latestEmpty: '暂无最新申请。',
        }
      : {
          title: 'Role upgrade request',
          copy: 'Members can request promotion to ML Engineer here. Administrators review the requests in the approval console.',
          requestTitle: 'Request ML Engineer role',
          reasonLabel: 'Reason',
          submit: 'Submit request',
          submitted: 'Role upgrade request submitted.',
          currentRoleOnly: 'This account does not need a role upgrade request.',
          empty: 'No role upgrade requests yet.',
          tableRequester: 'Requester',
          tableCurrentRole: 'Current role',
          tableRequestedRole: 'Requested role',
          tableStatus: 'Status',
          tableReason: 'Reason',
          tableReviewNote: 'Review note',
          tableCreatedAt: 'Created at',
          statusPending: 'Pending',
          statusApproved: 'Approved',
          statusRejected: 'Rejected',
          latestTitle: 'Latest request',
          latestEmpty: 'No latest request yet.',
          reviewedBy: 'Reviewed by',
          reviewedAt: 'Reviewed at',
        };
  const emailConfigCopy =
    locale === 'zh-CN'
      ? {
          title: '邮件发送配置',
          copy: '管理员可在这里配置平台发验证码邮件所使用的邮箱账号。下面的说明按 QQ 邮箱优先写，其他邮箱服务商也可按 SMTP 参数替换。',
          exampleTitle: 'QQ 邮箱推荐填写方式',
          exampleBody: '主机填 smtp.qq.com，端口填 465，开启 SSL，用户名和发件邮箱都填完整 QQ 邮箱地址，密码处填写 QQ 邮箱授权码而不是登录密码。',
          enabledLabel: '启用邮件验证功能',
          enabledHelp: '关闭后，注册验证码和修改邮箱验证码都会停用。',
          hostLabel: 'SMTP 服务器地址',
          hostHelp: '邮件服务商提供的 SMTP 地址。QQ 邮箱一般填写 smtp.qq.com。',
          portLabel: 'SMTP 端口',
          portHelp: '和加密方式配套使用。QQ 邮箱通常是 465。',
          sslLabel: '使用 SSL 加密连接',
          sslHelp: '如果端口是 465，通常应保持开启。',
          usernameLabel: 'SMTP 登录账号',
          usernameHelp: '通常填写完整邮箱地址，例如 123456@qq.com。',
          passwordLabel: 'SMTP 授权码 / 密码',
          passwordHelp: 'QQ 邮箱这里要填“授权码”，不是 QQ 登录密码。',
          clearPasswordLabel: '清空已存密码',
          clearPasswordHelp: '只有在你想删除当前已保存的 SMTP 密码时才需要打开。',
          fromEmailLabel: '发件邮箱地址',
          fromEmailHelp: '邮件里展示的发件地址，通常和 SMTP 登录账号一致。',
          fromNameLabel: '发件人名称',
          fromNameHelp: '收件人看到的发件人名字，例如 Platform RS Studio。',
          timeoutLabel: '超时时间（秒）',
          timeoutHelp: '连接 SMTP 服务器最长等待时间，建议 15 到 30 秒。',
          codeExpireLabel: '邮箱验证码有效期（分钟）',
          codeExpireHelp: '用户收到邮件后，验证码可使用多久。通常填 10 分钟。',
          resendLabel: '验证码重发等待（秒）',
          resendHelp: '防止频繁请求发送邮件。通常填 60 秒。',
          captchaExpireLabel: '图片验证码有效期（分钟）',
          captchaExpireHelp: '发送邮箱验证码前的人机校验码保留多久。通常填 5 分钟。',
          passwordHint: '留空则保留当前已存密码。',
          passwordConfigured: '当前已保存 SMTP 密码。',
          save: '保存邮件配置',
          saved: '邮件配置已更新。',
        }
      : {
          title: 'Email delivery settings',
          copy: 'Administrators can configure the mailbox used to send verification emails here. The hints below use QQ Mail as the default example.',
          exampleTitle: 'Recommended QQ Mail setup',
          exampleBody: 'Use smtp.qq.com, port 465, keep SSL enabled, set both username and from email to the full QQ mailbox address, and enter the QQ mailbox authorization code instead of the sign-in password.',
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
          passwordHelp: 'For QQ Mail, enter the mailbox authorization code, not the web sign-in password.',
          clearPasswordLabel: 'Clear stored password',
          clearPasswordHelp: 'Only turn this on when you want to delete the currently stored SMTP password.',
          fromEmailLabel: 'From email address',
          fromEmailHelp: 'The sender address shown in the email. Usually the same as the SMTP username.',
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
        };
  const spatialCopy =
    locale === 'zh-CN'
      ? {
          roiTab: '空间 ROI',
          overlayTab: '空间图层',
          type: '类型',
          bbox: '范围',
          datasetVersion: '数据集版本',
          opacity: '透明度',
          emptyRoi: '当前范围下还没有空间 ROI 资产。',
          emptyOverlay: '当前范围下还没有空间叠加图层资产。',
          roiDeleted: '空间 ROI 已删除。',
          overlayDeleted: '空间图层已删除。',
        }
      : {
          roiTab: 'Spatial ROIs',
          overlayTab: 'Spatial Overlays',
          type: 'Type',
          bbox: 'BBox',
          datasetVersion: 'Dataset Version',
          opacity: 'Opacity',
          emptyRoi: 'No spatial ROI assets found for the current scope.',
          emptyOverlay: 'No spatial overlay assets found for the current scope.',
          roiDeleted: 'Spatial ROI deleted.',
          overlayDeleted: 'Spatial overlay deleted.',
        };

  const refreshAssets = useCallback(
    async (nextScope: AssetScope = scope) => {
      if (!token) {
        return;
      }

      try {
        setLoading(true);
        const payload = await loadAssetOverview(token, nextScope);
        setOverview(payload);
      } catch (error) {
        message.error(isApiError(error) ? error.message : t('error.request_failed'));
      } finally {
        setLoading(false);
      }
    },
    [message, scope, t, token],
  );

  useEffect(() => {
    if (!token) {
      return;
    }
    void refreshAssets(scope);
  }, [refreshAssets, scope, token]);

  useEffect(() => {
    if (!token) {
      return;
    }
    void refreshCurrentUser();
  }, [refreshCurrentUser, token]);

  useEffect(() => {
    if (!isAdmin) {
      adminScopeInitializedRef.current = false;
      return;
    }
    if (adminScopeInitializedRef.current) {
      return;
    }
    adminScopeInitializedRef.current = true;
    setScope('all');
  }, [isAdmin]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }
    profileForm.setFieldsValue({
      displayName: currentUser.displayName,
      email: currentUser.email,
      preferredLocale: currentUser.preferredLocale,
      avatarUrl: currentUser.avatarUrl ?? '',
      jobTitle: currentUser.jobTitle ?? '',
      organization: currentUser.organization ?? '',
      bio: currentUser.bio ?? '',
      emailCode: '',
      captchaCode: '',
    });
  }, [currentUser, profileForm]);

  useEffect(() => {
    if (!isAdmin || !token) {
      return;
    }
    const loadEmailConfig = async () => {
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
    };
    void loadEmailConfig();
  }, [emailConfigForm, isAdmin, message, t, token]);

  useEffect(() => {
    if (!token) {
      return;
    }
    const loadRoleRequests = async () => {
      try {
        setRoleRequestsLoading(true);
        const payload = await listMyRoleUpgradeRequests(token);
        setRoleRequests(payload);
      } catch (error) {
        message.error(isApiError(error) ? error.message : t('error.request_failed'));
      } finally {
        setRoleRequestsLoading(false);
      }
    };
    void loadRoleRequests();
  }, [message, t, token]);

  useEffect(() => {
    if (profileEmailCooldown <= 0) {
      return;
    }
    const timer = window.setInterval(() => {
      setProfileEmailCooldown((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [profileEmailCooldown]);

  const refreshProfileCaptcha = useCallback(async () => {
    try {
      setProfileCaptchaLoading(true);
      const payload = await getImageCaptcha();
      setProfileCaptchaKey(payload.captchaKey);
      setProfileCaptchaImageUrl(payload.imageDataUrl);
      profileForm.setFieldValue('captchaCode', '');
    } catch {
      message.error(profileCopy.captchaLoadFailed);
    } finally {
      setProfileCaptchaLoading(false);
    }
  }, [message, profileCopy.captchaLoadFailed, profileForm]);

  useEffect(() => {
    void refreshProfileCaptcha();
  }, [refreshProfileCaptcha]);

  const resolveProfileErrorMessage = useCallback(
    (error: unknown) => {
      if (!isApiError(error)) {
        return t('error.request_failed');
      }
      switch (error.code) {
        case 'email_verification_disabled':
          return profileCopy.emailVerificationDisabled;
        case 'email_code_send_cooldown':
          return profileCopy.emailCodeCooldown;
        case 'captcha_invalid':
        case 'captcha_expired':
          return profileCopy.captchaInvalid;
        case 'email_code_invalid':
        case 'email_code_expired':
        case 'email_code_required':
          return profileCopy.emailCodeInvalid;
        case 'email_delivery_failed':
          return profileCopy.deliveryFailed;
        case 'current_password_invalid':
          return profileCopy.currentPasswordInvalid;
        case 'email_exists':
          return profileCopy.emailExists;
        default:
          return error.message || t('error.request_failed');
      }
    },
    [
      profileCopy.captchaInvalid,
      profileCopy.currentPasswordInvalid,
      profileCopy.deliveryFailed,
      profileCopy.emailCodeCooldown,
      profileCopy.emailCodeInvalid,
      profileCopy.emailExists,
      profileCopy.emailVerificationDisabled,
      t,
    ],
  );

  const reloadRoleRequests = useCallback(async () => {
    if (!token) {
      return;
    }
    try {
      setRoleRequestsLoading(true);
      const payload = await listMyRoleUpgradeRequests(token);
      setRoleRequests(payload);
    } catch (error) {
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    } finally {
      setRoleRequestsLoading(false);
    }
  }, [message, t, token]);

  const handleAvatarFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = '';
    if (!file) {
      return;
    }
    if (file.size > 512 * 1024) {
      message.error(profileCopy.avatarTooLarge);
      return;
    }

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => reject(new Error('read_failed'));
        reader.readAsDataURL(file);
      });
      profileForm.setFieldValue('avatarUrl', dataUrl);
    } catch {
      message.error(profileCopy.avatarLoadFailed);
    }
  };

  const sendProfileEmailCode = async () => {
    if (!token) {
      return;
    }
    const nextEmail = String(profileForm.getFieldValue('email') ?? '').trim().toLowerCase();
    const captchaCode = String(profileForm.getFieldValue('captchaCode') ?? '').trim();
    if (!nextEmail || nextEmail === currentUser?.email) {
      return;
    }
    if (!captchaCode) {
      message.warning(profileCopy.captchaRequired);
      return;
    }

    try {
      const payload = await sendEmailVerificationCode(
        {
          email: nextEmail,
          scene: 'change_email',
          captchaKey: profileCaptchaKey,
          captchaCode,
        },
        token,
      );
      setProfileSentEmail(nextEmail);
      setProfileEmailCooldown(payload.resendAfterSeconds);
      profileForm.setFieldValue('emailCode', '');
      message.success(profileCopy.sendCodeSuccess);
    } catch (error) {
      message.error(resolveProfileErrorMessage(error));
    } finally {
      void refreshProfileCaptcha();
    }
  };

  const latestVersionByDatasetId = useMemo(() => {
    const map = new Map<string, AssetOverview['datasetVersions'][number]>();
    overview?.datasets.forEach((dataset) => {
      const version =
        overview.datasetVersions.find((item) => item.id === dataset.latestVersionId) ??
        overview.datasetVersions.find((item) => item.datasetId === dataset.id);
      if (version) {
        map.set(dataset.id, version);
      }
    });
    return map;
  }, [overview]);

  const datasetRows = useMemo(() => {
    if (!overview) {
      return [];
    }
    return overview.datasets.map((dataset) => {
      const latestVersion = latestVersionByDatasetId.get(dataset.id);
      const isResult = Boolean(
        latestVersion?.metadata['workflow_run_id'] || latestVersion?.metadata['source_run_id'],
      );
      return {
        ...dataset,
        assetType: isResult ? 'result' : 'dataset',
        latestVersion,
      };
    });
  }, [latestVersionByDatasetId, overview]);
  const productRows = overview?.products ?? [];

  const openRenameModal = (record: (typeof datasetRows)[number]) => {
    const metadata = (record.latestVersion?.metadata as Record<string, unknown> | undefined) ?? {};
    const sampleRecord = getSampleRecord(metadata);

    renameForm.setFieldsValue({
      datasetName: record.name,
      description: record.description ?? '',
      originalFileName: getMetadataString(metadata, 'original_file_name'),
      contentType: getMetadataString(metadata, 'content_type'),
      rowCount:
        getMetadataNumber(metadata, 'row_count') !== undefined
          ? String(getMetadataNumber(metadata, 'row_count'))
          : '',
      columnsText: getMetadataStringList(metadata, 'columns').join('\n'),
      sampleRecordJson: sampleRecord ? JSON.stringify(sampleRecord, null, 2) : '',
    });
    setRenameTargetId(record.id);
  };

  const handleUpload = async () => {
    if (!token || !selectedFile) {
      message.warning(t('datasets.fileRequired'));
      return;
    }

    try {
      setSubmitting(true);
      const values = await uploadForm.validateFields();
      await uploadDataset(token, {
        workspaceId: snapshot.workspace.id,
        datasetName: values.datasetName,
        description: values.description,
        kind: values.kind,
        file: selectedFile,
      });
      message.success(t('assets.datasetUploaded'));
      setUploadOpen(false);
      setSelectedFile(null);
      uploadForm.resetFields();
      await Promise.all([refreshAssets(), onRefresh()]);
    } catch (error) {
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const openProductModal = (product?: ProductAssetSummary) => {
    if (product) {
      productForm.setFieldsValue({
        name: product.name,
        description: product.description ?? '',
        category: product.category ?? '',
        tagsText: tagsTextFromList(product.tags),
        highlightsText: highlightsTextFromList(product.highlights),
        specificationsText: specificationsTextFromMap(product.specifications),
        visibility: product.visibility ?? 'private',
      });
      setEditingProductId(product.id);
    } else {
      productForm.setFieldsValue({
        name: '',
        description: '',
        category: '',
        tagsText: '',
        highlightsText: '',
        specificationsText: '',
        visibility: 'private',
      });
      setEditingProductId(null);
    }
    setSelectedProductFile(null);
    if (productFileInputRef.current) {
      productFileInputRef.current.value = '';
    }
    setProductModalOpen(true);
  };

  const closeProductModal = () => {
    setProductModalOpen(false);
    setEditingProductId(null);
    setSelectedProductFile(null);
    productForm.resetFields();
    if (productFileInputRef.current) {
      productFileInputRef.current.value = '';
    }
  };

  const handleSubmitProduct = async () => {
    if (!token) {
      return;
    }

    try {
      setSubmitting(true);
      const values = await productForm.validateFields();
      const tags = parseProductTags(values.tagsText);
      const highlights = parseProductHighlights(values.highlightsText);
      const specifications = parseProductSpecifications(values.specificationsText);

      if (!editingProductId && !selectedProductFile) {
        message.warning(productCopy.noFileSelected);
        return;
      }

      if (editingProductId) {
        await updateProductAsset(token, editingProductId, {
          name: values.name,
          description: values.description,
          category: values.category,
          tags,
          highlights,
          specifications,
          visibility: isAdmin ? values.visibility : undefined,
          file: selectedProductFile ?? undefined,
        });
        message.success(productCopy.updateSuccess);
      } else if (selectedProductFile) {
        await uploadProductAsset(token, {
          workspaceId: snapshot.workspace.id,
          name: values.name,
          description: values.description,
          category: values.category,
          tags,
          highlights,
          specifications,
          visibility: isAdmin ? values.visibility : undefined,
          file: selectedProductFile,
        });
        message.success(productCopy.uploadSuccess);
      }

      closeProductModal();
      await Promise.all([refreshAssets(), onRefresh()]);
    } catch (error) {
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateGeeCredential = async () => {
    if (!token) {
      return;
    }

    try {
      setSubmitting(true);
      const values = await credentialForm.validateFields();
      await createGeeCredential(token, {
        workspaceId: snapshot.workspace.id,
        name: values.name,
        description: values.description,
        projectId: values.projectId,
        serviceAccountJson: values.serviceAccountJson,
      });
      message.success(geeCopy.createSuccess);
      setCredentialOpen(false);
      credentialForm.resetFields();
      await Promise.all([refreshAssets(), onRefresh()]);
    } catch (error) {
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!token) {
      return;
    }

    modal.confirm({
      title: productCopy.deleteTitle,
      content: productCopy.deleteBody,
      okButtonProps: { danger: true },
      onOk: async () => {
        await deleteProductAsset(token, productId);
        message.success(productCopy.deleteSuccess);
        await Promise.all([refreshAssets(), onRefresh()]);
      },
    });
  };

  const handleRename = async () => {
    if (!token || !renameTargetId) {
      return;
    }

    try {
      setSubmitting(true);
      const values = await renameForm.validateFields();
      const rowCountText = values.rowCount?.trim() ?? '';
      if (rowCountText && !/^\d+$/.test(rowCountText)) {
        message.error(t('assets.rowCountInvalid'));
        return;
      }

      const columns = (values.columnsText ?? '')
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);

      const sampleRecordText = values.sampleRecordJson?.trim() ?? '';
      let sampleRecord: Record<string, unknown> | undefined;
      if (sampleRecordText) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(sampleRecordText);
        } catch {
          message.error(t('assets.sampleRecordInvalid'));
          return;
        }
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          message.error(t('assets.sampleRecordInvalid'));
          return;
        }
        sampleRecord = parsed as Record<string, unknown>;
      }

      await updateDataset(token, renameTargetId, {
        name: values.datasetName,
        description: values.description,
        originalFileName: values.originalFileName ?? '',
        contentType: values.contentType ?? '',
        rowCount: rowCountText ? Number(rowCountText) : undefined,
        columns,
        sampleRecord: sampleRecordText ? sampleRecord : {},
      });
      message.success(t('assets.datasetRenamed'));
      setRenameTargetId(null);
      await Promise.all([refreshAssets(), onRefresh()]);
    } catch (error) {
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteDataset = async (datasetId: string) => {
    if (!token) {
      return;
    }

    modal.confirm({
      title: t('assets.deleteDatasetTitle'),
      content: t('assets.deleteDatasetBody'),
      okButtonProps: { danger: true },
      onOk: async () => {
        await deleteDataset(token, datasetId);
        message.success(t('assets.datasetDeleted'));
        await Promise.all([refreshAssets(), onRefresh()]);
      },
    });
  };

  const handleDeleteGeeCredential = async (credentialId: string) => {
    if (!token) {
      return;
    }

    modal.confirm({
      title: geeCopy.deleteTitle,
      content: geeCopy.deleteBody,
      okButtonProps: { danger: true },
      onOk: async () => {
        await deleteGeeCredential(token, credentialId);
        message.success(geeCopy.deleteSuccess);
        await Promise.all([refreshAssets(), onRefresh()]);
      },
    });
  };

  const handleSetPlatformDefaultGeeCredential = async (credentialId: string) => {
    if (!token) {
      return;
    }

    try {
      await setPlatformDefaultGeeCredential(token, credentialId);
      message.success(geePlatformCopy.platformDefaultSet);
      await Promise.all([refreshAssets(), onRefresh()]);
    } catch (error) {
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    }
  };

  const handleToggleVisibility = async (datasetId: string, nextVisibility: 'public' | 'private') => {
    if (!token) {
      return;
    }

    try {
      await updateDataset(token, datasetId, { visibility: nextVisibility });
      message.success(t('assets.visibilityUpdated'));
      await Promise.all([refreshAssets(), onRefresh()]);
    } catch (error) {
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    }
  };

  const handleToggleProductVisibility = async (
    productId: string,
    nextVisibility: 'public' | 'private',
  ) => {
    if (!token) {
      return;
    }

    try {
      await updateProductAsset(token, productId, { visibility: nextVisibility });
      message.success(t('assets.visibilityUpdated'));
      await Promise.all([refreshAssets(), onRefresh()]);
    } catch (error) {
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    }
  };

  const handleImportWorkflow = async (file: File) => {
    if (!token) {
      return;
    }

    try {
      const text = await file.text();
      const graph = parseImportedWorkflowGraph(text);
      await importWorkflowVersion(token, graph);
      message.success(t('assets.workflowImported'));
      await Promise.all([refreshAssets(), onRefresh()]);
    } catch {
      message.error(t('assets.workflowImportInvalid'));
    }
  };

  const handleSaveProfile = async () => {
    if (!token || !currentUser) {
      return;
    }

    try {
      setProfileSaving(true);
      const values = await profileForm.validateFields();
      const nextEmail = String(values.email ?? '').trim().toLowerCase();
      if (nextEmail !== currentUser.email && nextEmail !== profileSentEmail) {
        message.error(profileCopy.emailMismatch);
        return;
      }
      if (nextEmail !== currentUser.email && !String(values.emailCode ?? '').trim()) {
        message.error(profileCopy.emailCodeRequired);
        return;
      }

      await updateCurrentUserProfile(token, {
        displayName: values.displayName,
        preferredLocale: values.preferredLocale,
        email: nextEmail,
        emailCode: nextEmail !== currentUser.email ? values.emailCode : undefined,
        avatarUrl: values.avatarUrl ?? '',
        jobTitle: values.jobTitle ?? '',
        organization: values.organization ?? '',
        bio: values.bio ?? '',
      });
      await refreshCurrentUser();
      setProfileSentEmail('');
      setProfileEmailCooldown(0);
      profileForm.setFieldsValue({ emailCode: '', captchaCode: '' });
      void refreshProfileCaptcha();
      message.success(profileCopy.profileUpdated);
    } catch (error) {
      message.error(resolveProfileErrorMessage(error));
    } finally {
      setProfileSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!token) {
      return;
    }

    try {
      setPasswordSaving(true);
      const values = await passwordForm.validateFields();
      if (values.newPassword !== values.confirmPassword) {
        message.error(profileCopy.passwordMismatch);
        return;
      }
      await changeCurrentUserPassword(token, {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      passwordForm.resetFields();
      message.success(profileCopy.passwordUpdated);
    } catch (error) {
      message.error(resolveProfileErrorMessage(error));
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleCreateRoleRequest = async () => {
    if (!token) {
      return;
    }

    try {
      setRoleRequestSaving(true);
      const values = await roleRequestForm.validateFields();
      await createRoleUpgradeRequest(token, values.reason);
      roleRequestForm.resetFields();
      message.success(roleRequestCopy.submitted);
      await reloadRoleRequests();
    } catch (error) {
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    } finally {
      setRoleRequestSaving(false);
    }
  };

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
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    } finally {
      setEmailConfigSaving(false);
    }
  };

  const latestRoleRequest = roleRequests[0];

  const renderRoleRequestStatusTag = (status: RoleUpgradeRequestSummary['status']) => (
    <Tag color={status === 'approved' ? 'green' : status === 'rejected' ? 'red' : 'gold'}>
      {status === 'approved'
        ? roleRequestCopy.statusApproved
        : status === 'rejected'
          ? roleRequestCopy.statusRejected
          : roleRequestCopy.statusPending}
    </Tag>
  );

  const roleRequestColumns = [
    ...(isAdmin
      ? [
          {
            title: roleRequestCopy.tableRequester,
            dataIndex: 'userDisplayName',
            render: (value: string, record: RoleUpgradeRequestSummary) =>
              `${value} / ${record.userEmail}`,
          },
        ]
      : []),
    {
      title: roleRequestCopy.tableCurrentRole,
      dataIndex: 'currentRole',
      render: (value: RoleUpgradeRequestSummary['currentRole']) => t(roleKey(value)),
    },
    {
      title: roleRequestCopy.tableRequestedRole,
      dataIndex: 'requestedRole',
      render: (value: RoleUpgradeRequestSummary['requestedRole']) => t(roleKey(value)),
    },
    {
      title: roleRequestCopy.tableStatus,
      dataIndex: 'status',
      render: (value: RoleUpgradeRequestSummary['status']) => renderRoleRequestStatusTag(value),
    },
    { title: roleRequestCopy.tableReason, dataIndex: 'reason' },
    {
      title: roleRequestCopy.tableReviewNote,
      dataIndex: 'reviewNote',
      render: (value: string | undefined) => value || '-',
    },
    {
      title: roleRequestCopy.reviewedBy,
      dataIndex: 'reviewedByDisplayName',
      render: (value: string | undefined) => value || '-',
    },
    {
      title: roleRequestCopy.reviewedAt,
      dataIndex: 'reviewedAt',
      render: (value: string | undefined) =>
        value
          ? new Intl.DateTimeFormat(locale, {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(value))
          : '-',
    },
    {
      title: roleRequestCopy.tableCreatedAt,
      dataIndex: 'createdAt',
      render: (value: string) =>
        new Intl.DateTimeFormat(locale, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(value)),
    },
  ];

  const datasetColumns = [
    { title: t('datasets.table.dataset'), dataIndex: 'name' },
    {
      title: t('assets.assetType'),
      dataIndex: 'assetType',
      render: (assetType: 'dataset' | 'result') => (
        <Tag color={assetType === 'result' ? 'purple' : 'green'}>
          {assetType === 'result' ? t('assets.assetTypeResult') : t('assets.assetTypeDataset')}
        </Tag>
      ),
    },
    {
      title: t('datasets.table.kind'),
      dataIndex: 'kind',
      render: (kind: DatasetKind) => t(datasetKindKey(kind)),
    },
    {
      title: t('assets.visibility'),
      dataIndex: 'visibility',
      render: (visibility: string | undefined) => (
        <Tag color={visibility === 'public' ? 'blue' : 'default'}>
          {visibility === 'public' ? t('assets.visibilityPublic') : t('assets.visibilityPrivate')}
        </Tag>
      ),
    },
    ...(isAdmin || scope === 'all'
      ? [
          {
            title: t('assets.owner'),
            dataIndex: 'ownerDisplayName',
            render: (value: string | undefined) => value ?? platformOwnerLabel,
          },
        ]
      : []),
    {
      title: t('datasets.table.status'),
      dataIndex: 'status',
      render: (status: PlatformDataSnapshot['datasets'][number]['status']) => (
        <Tag color={status === 'ready' ? 'green' : 'processing'}>{t(datasetStatusKey(status))}</Tag>
      ),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: (typeof datasetRows)[number]) => {
        const latestVersionId = record.latestVersion?.id;
        return (
          <Space wrap>
            {latestVersionId ? (
              <Button type="link" onClick={() => token && void downloadDatasetVersion(token, latestVersionId)}>
                {t('common.download')}
              </Button>
            ) : null}
            <Button type="link" onClick={() => openRenameModal(record)}>
              {t('common.edit')}
            </Button>
            {isAdmin ? (
              <Button
                type="link"
                onClick={() =>
                  void handleToggleVisibility(
                    record.id,
                    record.visibility === 'public' ? 'private' : 'public',
                  )
                }
              >
                {record.visibility === 'public' ? t('assets.unpublish') : t('assets.publish')}
              </Button>
            ) : null}
            <Button danger type="link" onClick={() => void handleDeleteDataset(record.id)}>
              {t('common.delete')}
            </Button>
          </Space>
        );
      },
    },
  ];

  const workflowColumns = [
    { title: t('workflows.workflowVersion'), dataIndex: 'version' },
    ...(isAdmin || scope === 'all'
      ? [
          {
            title: t('assets.owner'),
            dataIndex: 'ownerDisplayName',
            render: (value: string | undefined) => value ?? platformOwnerLabel,
          },
        ]
      : []),
    { title: t('common.createdAt'), dataIndex: 'createdAt' },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: NonNullable<typeof overview>['workflowVersions'][number]) => (
        <Space wrap>
          <Button
            type="link"
            onClick={() => token && void downloadWorkflowVersion(token, record.id)}
          >
            {t('common.download')}
          </Button>
          <Button
            danger
            type="link"
            onClick={() =>
              token &&
              void deleteWorkflowVersion(token, record.id)
                .then(async () => {
                  message.success(t('assets.workflowDeleted'));
                  await Promise.all([refreshAssets(), onRefresh()]);
                })
                .catch((error) => {
                  message.error(isApiError(error) ? error.message : t('error.request_failed'));
                })
            }
          >
            {t('common.delete')}
          </Button>
        </Space>
      ),
    },
  ];

  const productColumns = [
    {
      title: productCopy.name,
      dataIndex: 'name',
      render: (
        value: string,
        record: ProductAssetSummary,
      ) => (
        <div>
          <div>{value}</div>
          <Text type="secondary">{record.originalFileName}</Text>
        </div>
      ),
    },
    {
      title: productCopy.category,
      dataIndex: 'category',
      render: (value: string | undefined) => value || '-',
    },
    {
      title: t('assets.visibility'),
      dataIndex: 'visibility',
      render: (visibility: string | undefined) => (
        <Tag color={visibility === 'public' ? 'blue' : 'default'}>
          {visibility === 'public' ? productCopy.visibilityPublic : productCopy.visibilityPrivate}
        </Tag>
      ),
    },
    ...(isAdmin || scope === 'all'
      ? [
          {
            title: t('assets.owner'),
            dataIndex: 'ownerDisplayName',
            render: (value: string | undefined) => value ?? platformOwnerLabel,
          },
        ]
      : []),
    {
      title: t('datasets.updatedAt'),
      dataIndex: 'updatedAt',
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: ProductAssetSummary) => {
        const canManageProduct = isAdmin || currentUser?.id === record.ownerUserId;
        return (
          <Space wrap>
            <Button
              type="link"
              onClick={() =>
                token &&
                void downloadProductAsset(token, record.id, record.originalFileName)
              }
            >
              {productCopy.download}
            </Button>
            {canManageProduct ? (
              <Button type="link" onClick={() => openProductModal(record)}>
                {t('common.edit')}
              </Button>
            ) : null}
            {isAdmin ? (
              <Button
                type="link"
                onClick={() =>
                  void handleToggleProductVisibility(
                    record.id,
                    record.visibility === 'public' ? 'private' : 'public',
                  )
                }
              >
                {record.visibility === 'public' ? t('assets.unpublish') : t('assets.publish')}
              </Button>
            ) : null}
            {canManageProduct ? (
              <Button danger type="link" onClick={() => void handleDeleteProduct(record.id)}>
                {t('common.delete')}
              </Button>
            ) : null}
          </Space>
        );
      },
    },
  ];

  const runColumns = [
    { title: t('workflows.runId'), dataIndex: 'id' },
    {
      title: t('common.status'),
      dataIndex: 'status',
      render: (status: PlatformDataSnapshot['workflowRuns'][number]['status']) => (
        <Tag color={status === 'succeeded' ? 'green' : status === 'running' ? 'processing' : 'default'}>
          {t(workflowRunStatusKey(status))}
        </Tag>
      ),
    },
    { title: t('workflows.submittedBy'), dataIndex: 'submittedBy' },
    {
      title: t('assets.resultDataset'),
      dataIndex: 'resultDatasetVersionId',
      render: (value: string | undefined) =>
        value && token ? (
          <Button type="link" onClick={() => void downloadDatasetVersion(token, value)}>
            {t('common.download')}
          </Button>
        ) : (
          '-'
        ),
    },
  ];

  const modelColumns = [
    { title: t('datasets.table.dataset'), dataIndex: 'modelName', render: (value: string | undefined, record: NonNullable<typeof overview>['modelVersions'][number]) => value ?? record.modelId },
    {
      title: t('assets.assetType'),
      dataIndex: 'sourceType',
      render: (sourceType: string | undefined) => (
        <Tag color={sourceType === 'custom_api' ? 'purple' : sourceType === 'trained' ? 'green' : 'default'}>
          {sourceType ?? 'uploaded'}
        </Tag>
      ),
    },
    {
      title: t('assets.owner'),
      dataIndex: 'ownerDisplayName',
      render: (value: string | undefined) => value ?? platformOwnerLabel,
    },
    { title: t('common.createdAt'), dataIndex: 'createdAt' },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: NonNullable<typeof overview>['modelVersions'][number]) => {
        const canDeleteModel = isAdmin || currentUser?.id === record.ownerUserId;
        return (
          <Space wrap>
            <Button
              type="link"
              onClick={() => token && void downloadModelVersion(token, record.id)}
            >
              {t('common.download')}
            </Button>
            {canDeleteModel ? (
              <Button
                danger
                type="link"
                onClick={() =>
                  token &&
                  void deleteModelVersion(token, record.id)
                    .then(async () => {
                      message.success(t('assets.modelDeleted'));
                      await Promise.all([refreshAssets(), onRefresh()]);
                    })
                    .catch((error) => {
                      message.error(isApiError(error) ? error.message : t('error.request_failed'));
                    })
                }
              >
                {t('common.delete')}
              </Button>
            ) : null}
          </Space>
        );
      },
    },
  ];

  const geeCredentialColumns = [
    {
      title: geeCopy.name,
      dataIndex: 'name',
      render: (
        value: string,
        record: NonNullable<typeof overview>['geeCredentials'][number],
      ) => (
        <Space wrap size={[8, 8]}>
          <span>{value}</span>
          {record.isPlatformDefault ? (
            <Tag color="gold">{geePlatformCopy.platformDefault}</Tag>
          ) : null}
        </Space>
      ),
    },
    { title: geeCopy.project, dataIndex: 'projectId', render: (value: string | undefined) => value ?? '-' },
    {
      title: geeCopy.email,
      dataIndex: 'serviceAccountEmail',
      render: (value: string | undefined) => value ?? '-',
    },
    ...(isAdmin || scope === 'all'
      ? [
          {
            title: t('assets.owner'),
            dataIndex: 'ownerDisplayName',
            render: (value: string | undefined) => value ?? platformOwnerLabel,
          },
        ]
      : []),
    { title: t('common.createdAt'), dataIndex: 'createdAt' },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: NonNullable<typeof overview>['geeCredentials'][number]) => (
        <Space wrap>
          {isAdmin ? (
            <Button
              type="link"
              disabled={record.isPlatformDefault}
              onClick={() => void handleSetPlatformDefaultGeeCredential(record.id)}
            >
              {geePlatformCopy.setPlatformDefault}
            </Button>
          ) : null}
          <Button danger type="link" onClick={() => void handleDeleteGeeCredential(record.id)}>
            {t('common.delete')}
          </Button>
        </Space>
      ),
    },
  ];

  const spatialRoiColumns = [
    { title: t('datasets.table.dataset'), dataIndex: 'name' },
    {
      title: spatialCopy.type,
      dataIndex: 'geometryType',
      render: (value: string) => <Tag>{value}</Tag>,
    },
    {
      title: spatialCopy.bbox,
      dataIndex: 'bbox',
      render: (bbox: [number, number, number, number]) => bbox.map((value) => value.toFixed(4)).join(', '),
    },
    ...(isAdmin || scope === 'all'
      ? [
          {
            title: t('assets.owner'),
            dataIndex: 'ownerDisplayName',
            render: (value: string | undefined) => value ?? platformOwnerLabel,
          },
        ]
      : []),
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: NonNullable<typeof overview>['spatialRois'][number]) => (
        <Space wrap>
          <Button
            danger
            type="link"
            onClick={() =>
              token &&
              void deleteSpatialRoi(token, record.id)
                .then(async () => {
                  message.success(spatialCopy.roiDeleted);
                  await refreshAssets();
                })
                .catch((error) => {
                  message.error(isApiError(error) ? error.message : t('error.request_failed'));
                })
            }
          >
            {t('common.delete')}
          </Button>
        </Space>
      ),
    },
  ];

  const spatialOverlayColumns = [
    { title: t('datasets.table.dataset'), dataIndex: 'name' },
    {
      title: spatialCopy.datasetVersion,
      render: (_: unknown, record: NonNullable<typeof overview>['spatialOverlays'][number]) =>
        `${record.datasetName} / v${record.datasetVersionNumber}`,
    },
    {
      title: spatialCopy.type,
      dataIndex: 'overlayType',
      render: (value: string) => <Tag>{value}</Tag>,
    },
    {
      title: spatialCopy.opacity,
      dataIndex: 'opacity',
      render: (value: number) => value.toFixed(2),
    },
    ...(isAdmin || scope === 'all'
      ? [
          {
            title: t('assets.owner'),
            dataIndex: 'ownerDisplayName',
            render: (value: string | undefined) => value ?? platformOwnerLabel,
          },
        ]
      : []),
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: NonNullable<typeof overview>['spatialOverlays'][number]) => (
        <Space wrap>
          <Button
            danger
            type="link"
            onClick={() =>
              token &&
              void deleteSpatialOverlay(token, record.id)
                .then(async () => {
                  message.success(spatialCopy.overlayDeleted);
                  await refreshAssets();
                })
                .catch((error) => {
                  message.error(isApiError(error) ? error.message : t('error.request_failed'));
                })
            }
          >
            {t('common.delete')}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="page-stack">
      <div className="section-header">
        <div className="section-header-actions">
          <div>
            <div className="panel-kicker">{t('assets.kicker')}</div>
            <h2 className="section-title">{t('assets.title')}</h2>
            <Paragraph className="section-copy">{t('assets.copy')}</Paragraph>
          </div>
          <Space wrap className="section-actions">
            <Button onClick={() => setUploadOpen(true)}>{t('common.upload')}</Button>
            <Button onClick={() => openProductModal()}>{productCopy.upload}</Button>
            <Button onClick={() => setCredentialOpen(true)}>{geeCopy.add}</Button>
            <Button onClick={() => importInputRef.current?.click()}>{t('assets.importWorkflow')}</Button>
            <Button onClick={() => void refreshAssets()}>{t('common.refresh')}</Button>
          </Space>
        </div>
      </div>

      <input
        ref={importInputRef}
        hidden
        type="file"
        accept=".json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void handleImportWorkflow(file);
          }
          event.currentTarget.value = '';
        }}
      />

      <Row gutter={[20, 20]}>
        <Col xs={24} xl={14}>
          <Card className="panel-card" variant="borderless">
            <div className="panel-kicker">{profileCopy.title}</div>
            <Paragraph className="section-copy">{profileCopy.copy}</Paragraph>
            <Form form={profileForm} layout="vertical">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                tabIndex={-1}
                aria-hidden="true"
                onChange={(event) => void handleAvatarFileChange(event)}
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
                  {initialsForName(profileForm.getFieldValue('displayName') ?? currentUser?.displayName)}
                </Avatar>
                <div className="profile-identity-body">
                  <div className="panel-kicker">{profileCopy.profilePreview}</div>
                  <div className="profile-identity-name">
                    {profileForm.getFieldValue('displayName') ?? currentUser?.displayName}
                  </div>
                  <div className="profile-identity-meta">
                    {watchedJobTitle || watchedOrganization
                      ? [watchedJobTitle, watchedOrganization].filter(Boolean).join(' · ')
                      : profileCopy.profileMetaFallback}
                  </div>
                  <Space wrap>
                    <Button onClick={() => avatarInputRef.current?.click()}>
                      {profileCopy.uploadAvatar}
                    </Button>
                    {watchedAvatarUrl ? (
                      <Button onClick={() => profileForm.setFieldValue('avatarUrl', '')}>
                        {profileCopy.removeAvatar}
                      </Button>
                    ) : null}
                  </Space>
                </div>
              </div>

              <div className="profile-grid">
                <Form.Item name="displayName" label={t('common.displayName')} rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="preferredLocale" label={t('auth.preferredLocale')} rules={[{ required: true }]}>
                  <Select
                    options={[
                      { value: 'zh-CN', label: t('locale.zh-CN') },
                      { value: 'en-US', label: t('locale.en-US') },
                    ]}
                  />
                </Form.Item>
                <Form.Item name="email" label={t('common.email')} rules={[{ required: true }, { type: 'email' }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="jobTitle" label={profileCopy.jobTitleLabel}>
                  <Input />
                </Form.Item>
                <Form.Item name="organization" label={profileCopy.organizationLabel}>
                  <Input />
                </Form.Item>
                <Form.Item
                  name="bio"
                  label={profileCopy.bioLabel}
                  className="profile-grid-span-full"
                >
                  <Input.TextArea rows={4} />
                </Form.Item>
                <div className="profile-summary-card">
                  <div>
                    <strong>{profileCopy.roleLabel}</strong>
                    <div>{currentUser ? t(roleKey(currentUser.role)) : '-'}</div>
                  </div>
                  <div>
                    <strong>{profileCopy.approvalLabel}</strong>
                    <div>{currentUser?.approvalStatus ?? '-'}</div>
                  </div>
                  <div>
                    <strong>{profileCopy.lastLoginLabel}</strong>
                    <div>
                      {currentUser?.lastLoginAt
                        ? new Intl.DateTimeFormat(locale, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          }).format(new Date(currentUser.lastLoginAt))
                        : profileCopy.noLastLogin}
                    </div>
                  </div>
                </div>
              </div>

              {watchedProfileEmail && watchedProfileEmail.trim().toLowerCase() !== currentUser?.email ? (
                <div className="profile-email-verify">
                  <div className="profile-email-row">
                    <Form.Item name="captchaCode" label={profileCopy.captchaLabel} rules={[{ required: true }]}>
                      <Input placeholder={profileCopy.captchaPlaceholder} />
                    </Form.Item>
                    <div className="auth-captcha-box">
                      {profileCaptchaImageUrl ? (
                        <img
                          src={profileCaptchaImageUrl}
                          alt="captcha"
                          className="auth-captcha-image"
                        />
                      ) : null}
                    </div>
                    <Button onClick={() => void refreshProfileCaptcha()} loading={profileCaptchaLoading}>
                      {profileCopy.refreshCaptcha}
                    </Button>
                  </div>
                  <Form.Item name="emailCode" label={profileCopy.emailCodeLabel}>
                    <Input
                      placeholder={profileCopy.emailCodePlaceholder}
                      addonAfter={
                        <Button
                          type="link"
                          onClick={() => void sendProfileEmailCode()}
                          disabled={profileEmailCooldown > 0}
                        >
                          {profileEmailCooldown > 0
                            ? profileCopy.resendIn(profileEmailCooldown)
                            : profileCopy.sendCode}
                        </Button>
                      }
                    />
                  </Form.Item>
                </div>
              ) : null}

              <Button type="primary" onClick={() => void handleSaveProfile()} loading={profileSaving}>
                {profileCopy.saveProfile}
              </Button>
            </Form>
          </Card>
        </Col>

        <Col xs={24} xl={10}>
          <div className="profile-security-stack">
            <Card className="panel-card" variant="borderless">
              <div className="panel-kicker">{profileCopy.passwordTitle}</div>
              <Paragraph className="section-copy">{profileCopy.passwordCopy}</Paragraph>
              <Form form={passwordForm} layout="vertical">
                <Form.Item name="currentPassword" label={profileCopy.currentPassword} rules={[{ required: true, min: 8 }]}>
                  <Input.Password />
                </Form.Item>
                <Form.Item name="newPassword" label={profileCopy.newPassword} rules={[{ required: true, min: 8 }]}>
                  <Input.Password />
                </Form.Item>
                <Form.Item name="confirmPassword" label={profileCopy.confirmPassword} rules={[{ required: true, min: 8 }]}>
                  <Input.Password />
                </Form.Item>
                <Button type="primary" onClick={() => void handleChangePassword()} loading={passwordSaving}>
                  {profileCopy.passwordTitle}
                </Button>
              </Form>
            </Card>

            <Card className="panel-card" variant="borderless">
              <div className="panel-kicker">{roleRequestCopy.title}</div>
              <Paragraph className="section-copy">{roleRequestCopy.copy}</Paragraph>
              {latestRoleRequest ? (
                <div className="profile-request-highlight">
                  <div className="profile-request-highlight-head">
                    <div>
                      <div className="panel-kicker">{roleRequestCopy.latestTitle}</div>
                      <Text>{latestRoleRequest.reason}</Text>
                    </div>
                    {renderRoleRequestStatusTag(latestRoleRequest.status)}
                  </div>
                  <Descriptions
                    size="small"
                    column={1}
                    items={[
                      {
                        key: 'review-note',
                        label: roleRequestCopy.tableReviewNote,
                        children: latestRoleRequest.reviewNote || '-',
                      },
                      {
                        key: 'reviewed-by',
                        label: roleRequestCopy.reviewedBy,
                        children: latestRoleRequest.reviewedByDisplayName || '-',
                      },
                      {
                        key: 'reviewed-at',
                        label: roleRequestCopy.reviewedAt,
                        children: latestRoleRequest.reviewedAt
                          ? new Intl.DateTimeFormat(locale, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            }).format(new Date(latestRoleRequest.reviewedAt))
                          : '-',
                      },
                    ]}
                  />
                </div>
              ) : null}
              {currentUser?.role === 'MEMBER' ? (
                <Form form={roleRequestForm} layout="vertical">
                  <Form.Item
                    name="reason"
                    label={roleRequestCopy.reasonLabel}
                    rules={[{ required: true, min: 4 }]}
                  >
                    <Input.TextArea rows={4} />
                  </Form.Item>
                  <Button type="primary" onClick={() => void handleCreateRoleRequest()} loading={roleRequestSaving}>
                    {roleRequestCopy.submit}
                  </Button>
                </Form>
              ) : (
                <Paragraph>{roleRequestCopy.currentRoleOnly}</Paragraph>
              )}

              <div className="profile-role-request-table">
                {roleRequests.length ? (
                  <Table
                    rowKey="id"
                    loading={roleRequestsLoading}
                    pagination={PROFILE_TABLE_PAGINATION}
                    columns={roleRequestColumns}
                    dataSource={roleRequests}
                    size="small"
                  />
                ) : (
                  <Empty description={roleRequestCopy.empty} />
                )}
              </div>
            </Card>

            {isAdmin ? (
              <Card className="panel-card" variant="borderless">
                <div className="panel-kicker">{emailConfigCopy.title}</div>
                <Paragraph className="section-copy">{emailConfigCopy.copy}</Paragraph>
                <div className="profile-config-tip">
                  <strong>{emailConfigCopy.exampleTitle}</strong>
                  <div>{emailConfigCopy.exampleBody}</div>
                </div>
                <Form form={emailConfigForm} layout="vertical">
                  <div className="profile-email-config-grid">
                    <Form.Item
                      name="emailEnabled"
                      label={emailConfigCopy.enabledLabel}
                      valuePropName="checked"
                      extra={emailConfigCopy.enabledHelp}
                    >
                      <Switch />
                    </Form.Item>
                    <Form.Item
                      name="smtpUseSsl"
                      label={emailConfigCopy.sslLabel}
                      valuePropName="checked"
                      extra={emailConfigCopy.sslHelp}
                    >
                      <Switch />
                    </Form.Item>
                    <Form.Item
                      name="smtpHost"
                      label={emailConfigCopy.hostLabel}
                      rules={[{ required: true }]}
                      extra={emailConfigCopy.hostHelp}
                    >
                      <Input />
                    </Form.Item>
                    <Form.Item
                      name="smtpPort"
                      label={emailConfigCopy.portLabel}
                      rules={[{ required: true }]}
                      extra={emailConfigCopy.portHelp}
                    >
                      <InputNumber min={1} max={65535} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item
                      name="smtpUsername"
                      label={emailConfigCopy.usernameLabel}
                      extra={emailConfigCopy.usernameHelp}
                    >
                      <Input />
                    </Form.Item>
                    <Form.Item
                      name="smtpPassword"
                      label={emailConfigCopy.passwordLabel}
                      extra={
                        emailSettings?.smtpPasswordConfigured
                          ? `${emailConfigCopy.passwordConfigured} ${emailConfigCopy.passwordHint} ${emailConfigCopy.passwordHelp}`
                          : `${emailConfigCopy.passwordHint} ${emailConfigCopy.passwordHelp}`
                      }
                    >
                      <Input.Password />
                    </Form.Item>
                    <Form.Item
                      name="clearSmtpPassword"
                      label={emailConfigCopy.clearPasswordLabel}
                      valuePropName="checked"
                      extra={emailConfigCopy.clearPasswordHelp}
                    >
                      <Switch />
                    </Form.Item>
                    <Form.Item
                      name="smtpFromEmail"
                      label={emailConfigCopy.fromEmailLabel}
                      extra={emailConfigCopy.fromEmailHelp}
                    >
                      <Input />
                    </Form.Item>
                    <Form.Item
                      name="smtpFromName"
                      label={emailConfigCopy.fromNameLabel}
                      extra={emailConfigCopy.fromNameHelp}
                    >
                      <Input />
                    </Form.Item>
                    <Form.Item
                      name="smtpTimeoutSeconds"
                      label={emailConfigCopy.timeoutLabel}
                      rules={[{ required: true }]}
                      extra={emailConfigCopy.timeoutHelp}
                    >
                      <InputNumber min={1} max={120} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item
                      name="emailCodeExpireMinutes"
                      label={emailConfigCopy.codeExpireLabel}
                      rules={[{ required: true }]}
                      extra={emailConfigCopy.codeExpireHelp}
                    >
                      <InputNumber min={1} max={120} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item
                      name="emailCodeResendSeconds"
                      label={emailConfigCopy.resendLabel}
                      rules={[{ required: true }]}
                      extra={emailConfigCopy.resendHelp}
                    >
                      <InputNumber min={0} max={3600} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item
                      name="imageCaptchaExpireMinutes"
                      label={emailConfigCopy.captchaExpireLabel}
                      rules={[{ required: true }]}
                      extra={emailConfigCopy.captchaExpireHelp}
                    >
                      <InputNumber min={1} max={60} style={{ width: '100%' }} />
                    </Form.Item>
                  </div>
                  <Button
                    type="primary"
                    onClick={() => void handleSaveEmailConfig()}
                    loading={emailConfigSaving || emailConfigLoading}
                  >
                    {emailConfigCopy.save}
                  </Button>
                </Form>
              </Card>
            ) : null}
          </div>
        </Col>
      </Row>

      <Card className="panel-card" variant="borderless">
        {overview ? (
          <Tabs
            tabBarExtraContent={
              isAdmin ? (
                <Select
                  value={scope}
                  onChange={(value) => setScope(value as AssetScope)}
                  style={{ width: 180 }}
                  options={[
                    { value: 'mine', label: t('assets.scopeMine') },
                    { value: 'all', label: t('assets.scopeAll') },
                  ]}
                />
              ) : undefined
            }
            items={[
              {
                key: 'datasets',
                label: t('assets.tabDatasets'),
                children: datasetRows.length ? (
                  <Table
                    rowKey="id"
                    loading={loading}
                    pagination={ASSET_TABLE_PAGINATION}
                    columns={datasetColumns}
                    dataSource={datasetRows}
                  />
                ) : (
                  <Empty description={t('assets.empty')} />
                ),
              },
              {
                key: 'workflows',
                label: t('assets.tabWorkflows'),
                children: overview.workflowVersions.length ? (
                  <Table
                    rowKey="id"
                    loading={loading}
                    pagination={ASSET_TABLE_PAGINATION}
                    columns={workflowColumns}
                    dataSource={overview.workflowVersions}
                  />
                ) : (
                  <Empty description={t('assets.empty')} />
                ),
              },
              {
                key: 'products',
                label: productCopy.tab,
                children: productRows.length ? (
                  <Table
                    rowKey="id"
                    loading={loading}
                    pagination={ASSET_TABLE_PAGINATION}
                    columns={productColumns}
                    dataSource={productRows}
                  />
                ) : (
                  <Empty description={productCopy.empty} />
                ),
              },
              {
                key: 'runs',
                label: t('assets.tabRuns'),
                children: overview.workflowRuns.length ? (
                  <Table
                    rowKey="id"
                    loading={loading}
                    pagination={ASSET_TABLE_PAGINATION}
                    columns={runColumns}
                    dataSource={overview.workflowRuns}
                  />
                ) : (
                  <Empty description={t('assets.empty')} />
                ),
              },
              {
                key: 'models',
                label: t('assets.tabModels'),
                children: overview.modelVersions.length ? (
                  <Table
                    rowKey="id"
                    loading={loading}
                    pagination={ASSET_TABLE_PAGINATION}
                    columns={modelColumns}
                    dataSource={overview.modelVersions}
                  />
                ) : (
                  <Empty description={t('assets.empty')} />
                ),
              },
              {
                key: 'gee-credentials',
                label: geeCopy.tab,
                children: overview.geeCredentials.length ? (
                  <Table
                    rowKey="id"
                    loading={loading}
                    pagination={ASSET_TABLE_PAGINATION}
                    columns={geeCredentialColumns}
                    dataSource={overview.geeCredentials}
                  />
                ) : (
                  <Empty description={geeCopy.empty} />
                ),
              },
              {
                key: 'spatial-rois',
                label: spatialCopy.roiTab,
                children: overview.spatialRois.length ? (
                  <Table
                    rowKey="id"
                    loading={loading}
                    pagination={ASSET_TABLE_PAGINATION}
                    columns={spatialRoiColumns}
                    dataSource={overview.spatialRois}
                  />
                ) : (
                  <Empty description={spatialCopy.emptyRoi} />
                ),
              },
              {
                key: 'spatial-overlays',
                label: spatialCopy.overlayTab,
                children: overview.spatialOverlays.length ? (
                  <Table
                    rowKey="id"
                    loading={loading}
                    pagination={ASSET_TABLE_PAGINATION}
                    columns={spatialOverlayColumns}
                    dataSource={overview.spatialOverlays}
                  />
                ) : (
                  <Empty description={spatialCopy.emptyOverlay} />
                ),
              },
            ]}
          />
        ) : (
          <Empty description={t('common.loading')} />
        )}
      </Card>

      <Modal
        title={t('assets.uploadDataset')}
        open={uploadOpen}
        onCancel={() => {
          setUploadOpen(false);
          setSelectedFile(null);
        }}
        onOk={() => void handleUpload()}
        confirmLoading={submitting}
      >
        <Form
          form={uploadForm}
          layout="vertical"
          initialValues={{ datasetName: '', description: '', kind: 'table' }}
        >
          <div className="section-actions">
            <Button onClick={() => downloadUploadTemplate(selectedUploadKind)}>
              {t('assets.downloadTemplate')}
            </Button>
          </div>
          <Form.Item name="datasetName" label={t('datasets.table.dataset')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label={t('datasets.description')}>
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item name="kind" label={t('datasets.table.kind')} rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'raster', label: t('dataset.kind.raster') },
                { value: 'vector', label: t('dataset.kind.vector') },
                { value: 'table', label: t('dataset.kind.table') },
                { value: 'artifact', label: t('dataset.kind.artifact') },
              ]}
            />
          </Form.Item>
          <Form.Item label={t('common.file')} required>
            <input
              className="file-picker"
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setSelectedFile(file);
                if (file) {
                  uploadForm.setFieldValue('datasetName', file.name.replace(/\.[^.]+$/, ''));
                }
              }}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingProductId ? productCopy.editTitle : productCopy.createTitle}
        className="asset-editor-modal"
        width={920}
        open={productModalOpen}
        onCancel={closeProductModal}
        onOk={() => void handleSubmitProduct()}
        confirmLoading={submitting}
      >
        <Form
          form={productForm}
          layout="vertical"
          initialValues={{ visibility: 'private' }}
        >
          <div className="asset-editor-layout">
            <section className="asset-editor-section">
              <div className="asset-editor-section-title">{productCopy.name}</div>
              <Paragraph className="asset-editor-section-copy">
                {productCopy.description}
              </Paragraph>
              <Form.Item name="name" label={productCopy.name} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="description" label={productCopy.description}>
                <Input.TextArea rows={5} />
              </Form.Item>
              <Form.Item name="category" label={productCopy.category}>
                <Input />
              </Form.Item>
              <Form.Item name="tagsText" label={productCopy.tags} extra={productCopy.tagsHint}>
                <Input.TextArea rows={4} />
              </Form.Item>
            </section>

            <section className="asset-editor-section">
              <div className="asset-editor-section-title">{productCopy.file}</div>
              <Paragraph className="asset-editor-section-copy">
                {productCopy.fileHint}
              </Paragraph>
              <Form.Item
                label={editingProductId ? productCopy.replaceFile : productCopy.file}
                required={!editingProductId}
              >
                <input
                  ref={productFileInputRef}
                  className="file-picker"
                  type="file"
                  accept=".stp,.step,.igs,.iges"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setSelectedProductFile(file);
                    if (!editingProductId && file) {
                      productForm.setFieldValue('name', file.name.replace(/\.[^.]+$/, ''));
                    }
                  }}
                />
                {selectedProductFile ? (
                  <Text type="secondary">{selectedProductFile.name}</Text>
                ) : null}
              </Form.Item>
              <Form.Item
                name="highlightsText"
                label={productCopy.highlights}
                extra={productCopy.highlightsHint}
              >
                <Input.TextArea rows={4} />
              </Form.Item>
              <Form.Item
                name="specificationsText"
                label={productCopy.specifications}
                extra={productCopy.specificationsHint}
              >
                <Input.TextArea rows={6} />
              </Form.Item>
              {isAdmin ? (
                <Form.Item name="visibility" label={productCopy.visibility}>
                  <Select
                    options={[
                      { value: 'private', label: productCopy.visibilityPrivate },
                      { value: 'public', label: productCopy.visibilityPublic },
                    ]}
                  />
                </Form.Item>
              ) : null}
            </section>
          </div>
        </Form>
      </Modal>

      <Modal
        title={geeCopy.createTitle}
        open={credentialOpen}
        onCancel={() => setCredentialOpen(false)}
        onOk={() => void handleCreateGeeCredential()}
        confirmLoading={submitting}
      >
        <Form
          form={credentialForm}
          layout="vertical"
          initialValues={{ name: '', description: '', projectId: '', serviceAccountJson: '' }}
        >
          <Form.Item name="name" label={geeCopy.name} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label={geeCopy.description}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="projectId" label={geeCopy.project}>
            <Input />
          </Form.Item>
          <Form.Item
            name="serviceAccountJson"
            label={geeCopy.serviceAccountJson}
            rules={[{ required: true }]}
          >
            <Input.TextArea rows={12} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('assets.editDataset')}
        className="asset-editor-modal"
        width={920}
        open={Boolean(renameTargetId)}
        onCancel={() => setRenameTargetId(null)}
        onOk={() => void handleRename()}
        confirmLoading={submitting}
      >
        <Form form={renameForm} layout="vertical">
          <div className="asset-editor-layout">
            <section className="asset-editor-section">
              <div className="asset-editor-section-title">{t('assets.basicInfoSection')}</div>
              <Paragraph className="asset-editor-section-copy">
                {t('assets.basicInfoCopy')}
              </Paragraph>
              <Form.Item
                name="datasetName"
                label={t('datasets.table.dataset')}
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>
              <Form.Item name="description" label={t('datasets.description')}>
                <Input.TextArea rows={5} />
              </Form.Item>
              <Form.Item name="originalFileName" label={t('datasets.originalFileName')}>
                <Input />
              </Form.Item>
              <Form.Item name="contentType" label={t('datasets.contentType')}>
                <Input />
              </Form.Item>
            </section>

            <section className="asset-editor-section">
              <div className="asset-editor-section-title">{t('assets.profileInfoSection')}</div>
              <Paragraph className="asset-editor-section-copy">
                {t('assets.profileInfoCopy')}
              </Paragraph>
              <Form.Item
                name="rowCount"
                label={t('datasets.rowCount')}
                extra={t('assets.rowCountHint')}
              >
                <Input />
              </Form.Item>
              <Form.Item
                name="columnsText"
                label={t('datasets.fields')}
                extra={t('assets.columnsHint')}
              >
                <Input.TextArea rows={5} />
              </Form.Item>
              <Form.Item
                name="sampleRecordJson"
                label={t('datasets.sampleRecord')}
                extra={t('assets.sampleRecordHint')}
              >
                <Input.TextArea rows={8} />
              </Form.Item>
            </section>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
