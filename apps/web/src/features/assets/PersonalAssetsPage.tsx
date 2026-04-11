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
  Button,
  Col,
  Form,
  Row,
  Space,
  Tag,
  Typography,
} from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { isApiError } from '@/auth/errors';
import { useAuth } from '@/auth/useAuth';
import {
  createHandoffPath,
  createSpatialAssetHandoff,
  createWorkflowDatasetHandoff,
  createWorkflowRoiHandoff,
} from '@/features/asset-flow/handoff';
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
  updateModelVersion,
  updateProductAsset,
  updateEmailSettings,
  updateCurrentUserProfile,
  updateDataset,
  updateSpatialOverlay,
  updateSpatialRoi,
  updateWorkflowVersion,
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
import { AccountProfileCard } from './components/AccountProfileCard';
import { AccountSidebarCards } from './components/AccountSidebarCards';
import {
  DatasetEditorModal,
  DatasetUploadModal,
  GeeCredentialModal,
  ProductEditorModal,
} from './components/AssetModals';
import { AssetsCatalogCard, type AssetCatalogSection } from './components/AssetsCatalogCard';
import { GeeCredentialsSectionCard } from './components/GeeCredentialsSectionCard';
import { PersonalAssetsHeader } from './components/PersonalAssetsHeader';
import { WorkspaceEmailSettingsCard } from './components/WorkspaceEmailSettingsCard';
import {
  getInitialAssetScopeForView,
  shouldInitializeAdminAssetScope,
} from './view-scope';
import type { PersonalAssetsPageView } from './view-scope';

const { Text } = Typography;

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

export type { PersonalAssetsPageView } from './view-scope';

function initialsForName(name: string | undefined): string {
  const cleaned = (name ?? '').trim();
  if (!cleaned) {
    return 'U';
  }
  const parts = cleaned.split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join('');
}

function datasetVersionSupportsMapPreview(
  kind: DatasetKind,
  latestVersion: AssetOverview['datasetVersions'][number] | undefined,
): boolean {
  if (!latestVersion || !['raster', 'vector'].includes(kind)) {
    return false;
  }

  const metadata = latestVersion.metadata ?? {};
  const contentType = String(metadata.content_type ?? '').toLowerCase();
  const originalFileName = String(metadata.original_file_name ?? '').toLowerCase();

  if (kind === 'raster') {
    return (
      contentType.includes('tiff') ||
      contentType.includes('geotiff') ||
      originalFileName.endsWith('.tif') ||
      originalFileName.endsWith('.tiff')
    );
  }

  return (
    contentType.includes('geo+json') ||
    contentType.endsWith('/json') ||
    originalFileName.endsWith('.geojson') ||
    originalFileName.endsWith('.json')
  );
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
  view = 'assets',
}: {
  snapshot: PlatformDataSnapshot;
  onRefresh: () => Promise<void>;
  view?: PersonalAssetsPageView;
}) {
  const { message, modal } = App.useApp();
  const { currentUser, refreshCurrentUser, token } = useAuth();
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const [scope, setScope] = useState<AssetScope>(() =>
    getInitialAssetScopeForView(view, currentUser?.role),
  );
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
  const assetOverviewRequestRef = useRef(0);
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
  const isAssetsView = view === 'assets';
  const isAccountView = view === 'account';
  const isWorkspaceSettingsView = view === 'workspace-settings';
  const needsAssetOverview = isAssetsView || isAccountView;

  const isAdmin = currentUser?.role === 'ADMIN';
  const platformOwnerLabel = t('assets.platformOwner');
  const ownerColumnEnabled = isAdmin || scope !== 'mine';
  const isSharedVisibility = useCallback(
    (visibility: string | undefined) => visibility === 'public' || visibility === 'workspace',
    [],
  );
  const renderVisibilityTag = useCallback(
    (visibility: string | undefined, publicLabel?: string, privateLabel?: string) => (
      <Tag color={isSharedVisibility(visibility) ? 'blue' : 'default'}>
        {isSharedVisibility(visibility)
          ? (publicLabel ?? t('assets.visibilityPublic'))
          : (privateLabel ?? t('assets.visibilityPrivate'))}
      </Tag>
    ),
    [isSharedVisibility, t],
  );
  const assetScopeOptions = useMemo(
    () => [
      { value: 'mine', label: t('assets.scopeMine') },
      { value: 'visible', label: t('assets.scopeVisible') },
      ...(isAdmin ? [{ value: 'all', label: t('assets.scopeAll') }] : []),
    ],
    [isAdmin, t],
  );
  const pageCopy = useMemo(
    () =>
      locale === 'zh-CN'
        ? isAssetsView
          ? {
              kicker: '资产中心',
              title: '集中管理可复用资产与运行结果',
              copy: '这里只保留资产与结果，不再混入账户资料和平台设置。',
            }
          : isAccountView
            ? {
                kicker: '账户中心',
                title: '管理个人资料、安全设置与个人集成',
                copy: '个人资料、密码、角色申请和 GEE 凭据集中到这里，不再和资产管理混在一起。',
              }
            : {
                kicker: '工作空间设置',
                title: '集中管理平台级邮件与验证配置',
                copy: '平台设置从个人资产页中拆出，避免资产管理和系统配置互相干扰。',
              }
        : isAssetsView
          ? {
              kicker: 'Asset Hub',
              title: 'Manage reusable assets and run outputs',
              copy: 'This page now focuses on assets and results only.',
            }
          : isAccountView
            ? {
                kicker: 'Account Center',
                title: 'Manage profile, security, and personal integrations',
                copy:
                  'Profile, password, role requests, and GEE credentials now live here instead of being mixed into asset management.',
              }
            : {
                kicker: 'Workspace Settings',
                title: 'Manage platform-wide email and verification settings',
                copy:
                  'System settings are now separated from personal assets to reduce page-level responsibility overlap.',
              },
    [isAccountView, isAssetsView, locale],
  );
  const handoffCopy = useMemo(
    () =>
      locale === 'zh-CN'
        ? {
            openInWorkflow: '送入工作流',
            openInMap: '打开到地图',
          }
        : {
            openInWorkflow: 'Use In Workflow',
            openInMap: 'Open In Map',
          },
    [locale],
  );
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
  const geeSectionCopy =
    locale === 'zh-CN'
      ? '将 Earth Engine 凭证单独管理，避免继续和数据集、模型、工作流等资产混在同一块区域。'
      : 'Manage Earth Engine credentials in a dedicated area instead of mixing them into the asset catalog.';
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

      const requestId = assetOverviewRequestRef.current + 1;
      assetOverviewRequestRef.current = requestId;

      try {
        setLoading(true);
        const payload = await loadAssetOverview(token, nextScope);
        if (assetOverviewRequestRef.current === requestId) {
          setOverview(payload);
        }
      } catch (error) {
        if (assetOverviewRequestRef.current === requestId) {
          message.error(isApiError(error) ? error.message : t('error.request_failed'));
        }
      } finally {
        if (assetOverviewRequestRef.current === requestId) {
          setLoading(false);
        }
      }
    },
    [message, scope, t, token],
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
    if (!token || !needsAssetOverview) {
      return;
    }
    void refreshAssets(scope);
  }, [needsAssetOverview, refreshAssets, scope, token]);

  useEffect(() => {
    if (!token || !isAccountView) {
      return;
    }
    void refreshCurrentUser();
  }, [isAccountView, refreshCurrentUser, token]);

  useEffect(() => {
    if (!needsAssetOverview) {
      adminScopeInitializedRef.current = false;
      return;
    }
    if (!isAdmin) {
      adminScopeInitializedRef.current = false;
      if (scope === 'all') {
        setScope('mine');
      }
      return;
    }
    if (adminScopeInitializedRef.current) {
      return;
    }
    adminScopeInitializedRef.current = true;
    if (shouldInitializeAdminAssetScope(view) && scope !== 'all') {
      setScope('all');
    }
  }, [isAdmin, needsAssetOverview, scope, view]);

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
    if (!isWorkspaceSettingsView) {
      return;
    }
    void reloadEmailConfig();
  }, [isWorkspaceSettingsView, reloadEmailConfig]);

  useEffect(() => {
    if (!token || !isAccountView) {
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
  }, [isAccountView, message, t, token]);

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
    if (!isAccountView) {
      return;
    }
    void refreshProfileCaptcha();
  }, [isAccountView, refreshProfileCaptcha]);

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

  const handleRefreshPage = useCallback(async () => {
    if (isWorkspaceSettingsView) {
      await reloadEmailConfig();
      return;
    }

    const tasks: Promise<unknown>[] = [];
    if (needsAssetOverview) {
      tasks.push(refreshAssets());
    }
    if (isAccountView) {
      tasks.push(reloadRoleRequests(), refreshCurrentUser());
    }
    await Promise.all(tasks);
  }, [
    isAccountView,
    isWorkspaceSettingsView,
    needsAssetOverview,
    refreshAssets,
    refreshCurrentUser,
    reloadEmailConfig,
    reloadRoleRequests,
  ]);

  const openDatasetInWorkflow = useCallback(
    (datasetVersionId: string, label?: string) => {
      navigate(
        createHandoffPath(
          '/workflows',
          createWorkflowDatasetHandoff(datasetVersionId, {
            label,
            source: 'my_assets',
          }),
        ),
      );
    },
    [navigate],
  );

  const openAssetVersionInMap = useCallback(
    (assetVersionId: string, label?: string) => {
      navigate(
        createHandoffPath(
          '/spatial',
          createSpatialAssetHandoff(assetVersionId, {
            label,
            source: 'my_assets',
          }),
        ),
      );
    },
    [navigate],
  );

  const openSpatialRoiInWorkflow = useCallback(
    (roiId: string, label?: string) => {
      navigate(
        createHandoffPath(
          '/workflows',
          createWorkflowRoiHandoff(roiId, {
            label,
            source: 'my_assets',
          }),
        ),
      );
    },
    [navigate],
  );

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

  const handleToggleWorkflowVisibility = async (
    workflowVersionId: string,
    nextVisibility: 'public' | 'private',
  ) => {
    if (!token) {
      return;
    }

    try {
      await updateWorkflowVersion(token, workflowVersionId, { visibility: nextVisibility });
      message.success(t('assets.visibilityUpdated'));
      await Promise.all([refreshAssets(), onRefresh()]);
    } catch (error) {
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    }
  };

  const handleToggleModelVisibility = async (
    modelVersionId: string,
    nextVisibility: 'public' | 'private',
  ) => {
    if (!token) {
      return;
    }

    try {
      await updateModelVersion(token, modelVersionId, { visibility: nextVisibility });
      message.success(t('assets.visibilityUpdated'));
      await Promise.all([refreshAssets(), onRefresh()]);
    } catch (error) {
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    }
  };

  const handleToggleSpatialRoiVisibility = async (
    roiId: string,
    nextVisibility: 'public' | 'private',
  ) => {
    if (!token) {
      return;
    }

    try {
      await updateSpatialRoi(token, roiId, { visibility: nextVisibility });
      message.success(t('assets.visibilityUpdated'));
      await Promise.all([refreshAssets(), onRefresh()]);
    } catch (error) {
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    }
  };

  const handleToggleSpatialOverlayVisibility = async (
    overlayId: string,
    nextVisibility: 'public' | 'private',
  ) => {
    if (!token) {
      return;
    }

    try {
      await updateSpatialOverlay(token, overlayId, { visibility: nextVisibility });
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
  const currentRoleLabel = currentUser ? t(roleKey(currentUser.role)) : '-';
  const lastLoginText =
    currentUser?.lastLoginAt
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(currentUser.lastLoginAt))
      : profileCopy.noLastLogin;
  const latestRoleRequestReviewedAtText = latestRoleRequest?.reviewedAt
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(latestRoleRequest.reviewedAt))
    : '-';
  const localeOptions = [
    { value: 'zh-CN' as const, label: t('locale.zh-CN') },
    { value: 'en-US' as const, label: t('locale.en-US') },
  ];

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
      render: (visibility: string | undefined) => renderVisibilityTag(visibility),
    },
    ...(ownerColumnEnabled
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
        const canManageDataset = isAdmin || currentUser?.id === record.ownerUserId;
        return (
          <Space wrap>
            {latestVersionId ? (
              <Button type="link" onClick={() => token && void downloadDatasetVersion(token, latestVersionId)}>
                {t('common.download')}
              </Button>
            ) : null}
            {latestVersionId ? (
              <Button type="link" onClick={() => openDatasetInWorkflow(latestVersionId, record.name)}>
                {handoffCopy.openInWorkflow}
              </Button>
            ) : null}
            {latestVersionId && datasetVersionSupportsMapPreview(record.kind, record.latestVersion) ? (
              <Button type="link" onClick={() => openAssetVersionInMap(latestVersionId, record.name)}>
                {handoffCopy.openInMap}
              </Button>
            ) : null}
            {canManageDataset ? (
              <Button type="link" onClick={() => openRenameModal(record)}>
                {t('common.edit')}
              </Button>
            ) : null}
            {isAdmin ? (
              <Button
                type="link"
                onClick={() =>
                  void handleToggleVisibility(
                    record.id,
                    isSharedVisibility(record.visibility) ? 'private' : 'public',
                  )
                }
              >
                {isSharedVisibility(record.visibility) ? t('assets.unpublish') : t('assets.publish')}
              </Button>
            ) : null}
            {canManageDataset ? (
              <Button danger type="link" onClick={() => void handleDeleteDataset(record.id)}>
                {t('common.delete')}
              </Button>
            ) : null}
          </Space>
        );
      },
    },
  ];

  const workflowColumns = [
    { title: t('workflows.workflowVersion'), dataIndex: 'version' },
    {
      title: t('assets.visibility'),
      dataIndex: 'visibility',
      render: (visibility: string | undefined) => renderVisibilityTag(visibility),
    },
    ...(ownerColumnEnabled
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
      render: (_: unknown, record: NonNullable<typeof overview>['workflowVersions'][number]) => {
        const canManageWorkflow = isAdmin || currentUser?.id === record.ownerUserId;
        return (
          <Space wrap>
            <Button
              type="link"
              onClick={() => token && void downloadWorkflowVersion(token, record.id)}
            >
              {t('common.download')}
            </Button>
            {isAdmin ? (
              <Button
                type="link"
                onClick={() =>
                  void handleToggleWorkflowVisibility(
                    record.id,
                    isSharedVisibility(record.visibility) ? 'private' : 'public',
                  )
                }
              >
                {isSharedVisibility(record.visibility) ? t('assets.unpublish') : t('assets.publish')}
              </Button>
            ) : null}
            {canManageWorkflow ? (
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
            ) : null}
          </Space>
        );
      },
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
      render: (visibility: string | undefined) =>
        renderVisibilityTag(visibility, productCopy.visibilityPublic, productCopy.visibilityPrivate),
    },
    ...(ownerColumnEnabled
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
          <Space wrap>
            <Button type="link" onClick={() => void downloadDatasetVersion(token, value)}>
              {t('common.download')}
            </Button>
            <Button type="link" onClick={() => openDatasetInWorkflow(value, value)}>
              {handoffCopy.openInWorkflow}
            </Button>
            {snapshot.datasetVersions.some(
              (datasetVersion) =>
                datasetVersion.id === value &&
                datasetVersionSupportsMapPreview(
                  snapshot.datasets.find((dataset) => dataset.id === datasetVersion.datasetId)?.kind ?? 'artifact',
                  datasetVersion,
                ),
            ) ? (
              <Button type="link" onClick={() => openAssetVersionInMap(value, value)}>
                {handoffCopy.openInMap}
              </Button>
            ) : null}
          </Space>
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
      title: t('assets.visibility'),
      dataIndex: 'visibility',
      render: (visibility: string | undefined) => renderVisibilityTag(visibility),
    },
    ...(ownerColumnEnabled
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
            {isAdmin ? (
              <Button
                type="link"
                onClick={() =>
                  void handleToggleModelVisibility(
                    record.id,
                    isSharedVisibility(record.visibility) ? 'private' : 'public',
                  )
                }
              >
                {isSharedVisibility(record.visibility) ? t('assets.unpublish') : t('assets.publish')}
              </Button>
            ) : null}
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
    ...(ownerColumnEnabled
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
      title: t('assets.visibility'),
      dataIndex: 'visibility',
      render: (visibility: string | undefined) => renderVisibilityTag(visibility),
    },
    {
      title: spatialCopy.bbox,
      dataIndex: 'bbox',
      render: (bbox: [number, number, number, number]) => bbox.map((value) => value.toFixed(4)).join(', '),
    },
    ...(ownerColumnEnabled
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
      render: (_: unknown, record: NonNullable<typeof overview>['spatialRois'][number]) => {
        const canManageSpatialRoi = isAdmin || currentUser?.id === record.ownerUserId;
        return (
          <Space wrap>
            <Button type="link" onClick={() => openSpatialRoiInWorkflow(record.id, record.name)}>
              {handoffCopy.openInWorkflow}
            </Button>
            {isAdmin ? (
              <Button
                type="link"
                onClick={() =>
                  void handleToggleSpatialRoiVisibility(
                    record.id,
                    record.visibility === 'public' ? 'private' : 'public',
                  )
                }
              >
                {record.visibility === 'public' ? t('assets.unpublish') : t('assets.publish')}
              </Button>
            ) : null}
            {canManageSpatialRoi ? (
              <Button
                danger
                type="link"
                onClick={() =>
                  token &&
                  void deleteSpatialRoi(token, record.id)
                    .then(async () => {
                      message.success(spatialCopy.roiDeleted);
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
      title: t('assets.visibility'),
      dataIndex: 'visibility',
      render: (visibility: string | undefined) => renderVisibilityTag(visibility),
    },
    {
      title: spatialCopy.opacity,
      dataIndex: 'opacity',
      render: (value: number) => value.toFixed(2),
    },
    ...(ownerColumnEnabled
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
      render: (_: unknown, record: NonNullable<typeof overview>['spatialOverlays'][number]) => {
        const canManageSpatialOverlay = isAdmin || currentUser?.id === record.ownerUserId;
        return (
          <Space wrap>
            {isAdmin ? (
              <Button
                type="link"
                onClick={() =>
                  void handleToggleSpatialOverlayVisibility(
                    record.id,
                    record.visibility === 'public' ? 'private' : 'public',
                  )
                }
              >
                {record.visibility === 'public' ? t('assets.unpublish') : t('assets.publish')}
              </Button>
            ) : null}
            {canManageSpatialOverlay ? (
              <Button
                danger
                type="link"
                onClick={() =>
                  token &&
                  void deleteSpatialOverlay(token, record.id)
                    .then(async () => {
                      message.success(spatialCopy.overlayDeleted);
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

  const assetSections: AssetCatalogSection[] = [
    {
      key: 'datasets',
      label: t('assets.tabDatasets'),
      rows: datasetRows as AssetCatalogSection['rows'],
      columns: datasetColumns as AssetCatalogSection['columns'],
      emptyLabel: t('assets.empty'),
    },
    {
      key: 'workflows',
      label: t('assets.tabWorkflows'),
      rows: (overview?.workflowVersions ?? []) as AssetCatalogSection['rows'],
      columns: workflowColumns as AssetCatalogSection['columns'],
      emptyLabel: t('assets.empty'),
    },
    {
      key: 'products',
      label: productCopy.tab,
      rows: productRows as AssetCatalogSection['rows'],
      columns: productColumns as AssetCatalogSection['columns'],
      emptyLabel: productCopy.empty,
    },
    {
      key: 'runs',
      label: t('assets.tabRuns'),
      rows: (overview?.workflowRuns ?? []) as AssetCatalogSection['rows'],
      columns: runColumns as AssetCatalogSection['columns'],
      emptyLabel: t('assets.empty'),
    },
    {
      key: 'models',
      label: t('assets.tabModels'),
      rows: (overview?.modelVersions ?? []) as AssetCatalogSection['rows'],
      columns: modelColumns as AssetCatalogSection['columns'],
      emptyLabel: t('assets.empty'),
    },
    {
      key: 'spatial-rois',
      label: spatialCopy.roiTab,
      rows: (overview?.spatialRois ?? []) as AssetCatalogSection['rows'],
      columns: spatialRoiColumns as AssetCatalogSection['columns'],
      emptyLabel: spatialCopy.emptyRoi,
    },
    {
      key: 'spatial-overlays',
      label: spatialCopy.overlayTab,
      rows: (overview?.spatialOverlays ?? []) as AssetCatalogSection['rows'],
      columns: spatialOverlayColumns as AssetCatalogSection['columns'],
      emptyLabel: spatialCopy.emptyOverlay,
    },
  ];
  return (
    <div className="page-stack">
      <PersonalAssetsHeader
        kicker={pageCopy.kicker}
        title={pageCopy.title}
        copy={pageCopy.copy}
        isAssetsView={isAssetsView}
        isAccountView={isAccountView}
        uploadLabel={t('common.upload')}
        uploadProductLabel={productCopy.upload}
        addCredentialLabel={geeCopy.add}
        importWorkflowLabel={t('assets.importWorkflow')}
        refreshLabel={t('common.refresh')}
        importInputRef={importInputRef}
        onUploadDataset={() => setUploadOpen(true)}
        onUploadProduct={() => openProductModal()}
        onAddCredential={() => setCredentialOpen(true)}
        onImportWorkflow={(file) => void handleImportWorkflow(file)}
        onRefresh={() => void handleRefreshPage()}
      />

      {isAccountView ? (
        <Row gutter={[20, 20]}>
          <Col xs={24} xl={14}>
            <AccountProfileCard
              currentUser={currentUser}
              profileForm={profileForm}
              avatarInputRef={avatarInputRef}
              watchedAvatarUrl={watchedAvatarUrl}
              watchedJobTitle={watchedJobTitle}
              watchedOrganization={watchedOrganization}
              watchedProfileEmail={watchedProfileEmail}
              profileCaptchaImageUrl={profileCaptchaImageUrl}
              profileCaptchaLoading={profileCaptchaLoading}
              profileEmailCooldown={profileEmailCooldown}
              profileSaving={profileSaving}
              currentRoleLabel={currentRoleLabel}
              displayNameLabel={t('common.displayName')}
              preferredLocaleLabel={t('auth.preferredLocale')}
              emailLabel={t('common.email')}
              localeOptions={localeOptions}
              copy={profileCopy}
              renderInitials={initialsForName}
              lastLoginText={lastLoginText}
              onAvatarFileChange={(event) => void handleAvatarFileChange(event)}
              onTriggerAvatarSelect={() => avatarInputRef.current?.click()}
              onRemoveAvatar={() => profileForm.setFieldValue('avatarUrl', '')}
              onRefreshCaptcha={() => void refreshProfileCaptcha()}
              onSendEmailCode={() => void sendProfileEmailCode()}
              onSave={() => void handleSaveProfile()}
            />
        </Col>

        <Col xs={24} xl={10}>
          <AccountSidebarCards
            currentUser={currentUser}
            latestRoleRequest={latestRoleRequest}
            roleRequests={roleRequests}
            roleRequestsLoading={roleRequestsLoading}
            roleRequestSaving={roleRequestSaving}
            passwordSaving={passwordSaving}
            passwordForm={passwordForm}
            roleRequestForm={roleRequestForm}
            passwordCopy={profileCopy}
            roleRequestCopy={roleRequestCopy}
            roleRequestColumns={roleRequestColumns}
            roleRequestPagination={PROFILE_TABLE_PAGINATION}
            renderRoleRequestStatusTag={renderRoleRequestStatusTag}
            latestRoleRequestReviewedAtText={latestRoleRequestReviewedAtText}
            onChangePassword={() => void handleChangePassword()}
            onCreateRoleRequest={() => void handleCreateRoleRequest()}
          />
        </Col>
        </Row>
      ) : null}

      {isAssetsView ? (
        <AssetsCatalogCard
          overview={overview}
          scope={scope}
          scopeOptions={assetScopeOptions}
          sections={assetSections}
          loading={loading}
          pagination={ASSET_TABLE_PAGINATION}
          loadingLabel={t('common.loading')}
          onScopeChange={setScope}
        />
      ) : null}

      {isAccountView ? (
        <GeeCredentialsSectionCard
          overview={overview}
          scope={scope}
          scopeOptions={assetScopeOptions}
          loading={loading}
          columns={geeCredentialColumns}
          pagination={ASSET_TABLE_PAGINATION}
          tabLabel={geeCopy.tab}
          sectionCopy={geeSectionCopy}
          emptyLabel={geeCopy.empty}
          loadingLabel={t('common.loading')}
          onScopeChange={setScope}
        />
      ) : null}

      {isWorkspaceSettingsView ? (
        <WorkspaceEmailSettingsCard
          form={emailConfigForm}
          emailSettings={emailSettings}
          copy={emailConfigCopy}
          loading={emailConfigLoading}
          saving={emailConfigSaving}
          onSave={() => void handleSaveEmailConfig()}
        />
      ) : null}

      <DatasetUploadModal
        open={uploadOpen}
        submitting={submitting}
        form={uploadForm}
        selectedUploadKind={selectedUploadKind}
        datasetNameLabel={t('datasets.table.dataset')}
        descriptionLabel={t('datasets.description')}
        kindLabel={t('datasets.table.kind')}
        fileLabel={t('common.file')}
        title={t('assets.uploadDataset')}
        downloadTemplateLabel={t('assets.downloadTemplate')}
        kindOptions={[
          { value: 'raster', label: t('dataset.kind.raster') },
          { value: 'vector', label: t('dataset.kind.vector') },
          { value: 'table', label: t('dataset.kind.table') },
          { value: 'artifact', label: t('dataset.kind.artifact') },
        ]}
        onCancel={() => {
          setUploadOpen(false);
          setSelectedFile(null);
        }}
        onSubmit={() => void handleUpload()}
        onDownloadTemplate={() => downloadUploadTemplate(selectedUploadKind)}
        onFileChange={(file) => {
          setSelectedFile(file);
          if (file) {
            uploadForm.setFieldValue('datasetName', file.name.replace(/\.[^.]+$/, ''));
          }
        }}
      />

      <ProductEditorModal
        open={productModalOpen}
        submitting={submitting}
        editingProductId={editingProductId}
        form={productForm}
        copy={productCopy}
        isAdmin={isAdmin}
        selectedProductFile={selectedProductFile}
        productFileInputRef={productFileInputRef}
        onCancel={closeProductModal}
        onSubmit={() => void handleSubmitProduct()}
        onFileChange={(file) => {
          setSelectedProductFile(file);
          if (!editingProductId && file) {
            productForm.setFieldValue('name', file.name.replace(/\.[^.]+$/, ''));
          }
        }}
      />

      <GeeCredentialModal
        open={credentialOpen}
        submitting={submitting}
        form={credentialForm}
        copy={geeCopy}
        onCancel={() => setCredentialOpen(false)}
        onSubmit={() => void handleCreateGeeCredential()}
      />

      <DatasetEditorModal
        open={Boolean(renameTargetId)}
        submitting={submitting}
        form={renameForm}
        title={t('assets.editDataset')}
        basicInfoTitle={t('assets.basicInfoSection')}
        basicInfoCopy={t('assets.basicInfoCopy')}
        profileInfoTitle={t('assets.profileInfoSection')}
        profileInfoCopy={t('assets.profileInfoCopy')}
        datasetNameLabel={t('datasets.table.dataset')}
        descriptionLabel={t('datasets.description')}
        originalFileNameLabel={t('datasets.originalFileName')}
        contentTypeLabel={t('datasets.contentType')}
        rowCountLabel={t('datasets.rowCount')}
        rowCountHint={t('assets.rowCountHint')}
        fieldsLabel={t('datasets.fields')}
        fieldsHint={t('assets.columnsHint')}
        sampleRecordLabel={t('datasets.sampleRecord')}
        sampleRecordHint={t('assets.sampleRecordHint')}
        onCancel={() => setRenameTargetId(null)}
        onSubmit={() => void handleRename()}
      />
    </div>
  );
}
