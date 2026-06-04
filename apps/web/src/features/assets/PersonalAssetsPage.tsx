import type { AssetOverview, PlatformDataSnapshot } from '@/lib/api';
import type {
  AssetScope,
  DatasetKind,
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
  createWorkflowGeeCredentialHandoff,
  createWorkflowModelHandoff,
  createWorkflowRoiHandoff,
} from '@/features/asset-flow/handoff';
import {
  buildDatasetNextSteps,
  buildGeeCredentialNextSteps,
  buildModelNextSteps,
  buildProductNextSteps,
  buildSpatialOverlayNextSteps,
  buildSpatialRoiNextSteps,
  isDatasetVersionMapReady,
} from '@/features/asset-flow/next-steps';
import { AssetNextStepCell } from '@/features/asset-flow/AssetNextStepCell';
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
  importWorkflowVersion,
  getImageCaptcha,
  listMyRoleUpgradeRequests,
  loadAssetOverview,
  downloadProductAsset,
  sendEmailVerificationCode,
  updateModelVersion,
  updateProductAsset,
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
import { AccountProfileCard } from './components/AccountProfileCard';
import { AccountSidebarCards } from './components/AccountSidebarCards';
import {
  DatasetEditorModal,
  DatasetUploadModal,
  GeeCredentialModal,
  ProductEditorModal,
} from './components/AssetModals';
import { AssetsCatalogCard, type AssetCatalogSection } from './components/AssetsCatalogCard';
import { PersonalAssetsHeader } from './components/PersonalAssetsHeader';
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

export type { PersonalAssetsPageView } from './view-scope';

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
  const selectedUploadKind = Form.useWatch('kind', uploadForm) ?? 'table';
  const watchedProfileEmail = Form.useWatch('email', profileForm) ?? '';
  const watchedAvatarUrl = Form.useWatch('avatarUrl', profileForm) ?? '';
  const watchedJobTitle = Form.useWatch('jobTitle', profileForm) ?? '';
  const watchedOrganization = Form.useWatch('organization', profileForm) ?? '';
  const isAssetsView = view === 'assets';
  const isAccountView = view === 'account';
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
              title: '集中管理可复用资产、结果与共享能力',
              copy: '这里统一管理数据集、结果、工作流、产品、空间对象与 GEE 凭证，方便发布、复用与跨页面流转。',
            }
          : {
              kicker: '账户中心',
              title: '管理个人资料、安全设置与账号申请',
              copy: '管理个人资料、登录密码和角色申请。',
            }
        : isAssetsView
          ? {
              kicker: 'Asset Hub',
              title: 'Manage reusable assets, outputs, and shared capabilities',
              copy:
                'Datasets, results, workflows, products, spatial objects, and GEE credentials now live together for publishing, reuse, and cross-page handoff.',
            }
          : {
              kicker: 'Account Center',
              title: 'Manage profile, security, and access requests',
              copy: 'Profile, password, and role requests stay here without being mixed with reusable assets.',
            },
    [isAssetsView, locale],
  );
  const handoffCopy = useMemo(
    () =>
      locale === 'zh-CN'
        ? {
            openInWorkflow: '送入工作流',
            openInMap: '打开到地图',
            nextSteps: '下一步',
          }
        : {
            openInWorkflow: 'Use In Workflow',
            openInMap: 'Open In Map',
            nextSteps: 'Next Steps',
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
          profileMetaFallback: '职位和组织信息会显示在资料卡片中。',
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
  const spatialCopy =
    locale === 'zh-CN'
      ? {
          roiTab: '空间 ROI',
          overlayTab: '空间叠加层',
          type: '类型',
          bbox: '范围',
          datasetVersion: '数据集版本',
          opacity: '透明度',
          emptyRoi: '当前范围下没有空间 ROI 资产。',
          emptyOverlay: '当前范围下没有空间叠加层资产。',
          roiDeleted: '空间 ROI 已删除。',
          overlayDeleted: '空间叠加层已删除。',
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
    const tasks: Promise<unknown>[] = [];
    if (needsAssetOverview) {
      tasks.push(refreshAssets());
    }
    if (isAccountView) {
      tasks.push(reloadRoleRequests(), refreshCurrentUser());
    }
    await Promise.all(tasks);
  }, [isAccountView, needsAssetOverview, refreshAssets, refreshCurrentUser, reloadRoleRequests]);

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

  const openModelVersionInWorkflow = useCallback(
    (modelVersionId: string, label?: string) => {
      navigate(
        createHandoffPath(
          '/workflows',
          createWorkflowModelHandoff(modelVersionId, {
            label,
            source: 'my_assets',
          }),
        ),
      );
    },
    [navigate],
  );

  const openGeeCredentialInWorkflow = useCallback(
    (geeCredentialId: string, label?: string) => {
      navigate(
        createHandoffPath(
          '/workflows',
          createWorkflowGeeCredentialHandoff(geeCredentialId, {
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
      title: handoffCopy.nextSteps,
      key: 'nextSteps',
      render: (_: unknown, record: (typeof datasetRows)[number]) => {
        const latestVersionId = record.latestVersion?.id;
        const mapReady = isDatasetVersionMapReady(record.kind, record.latestVersion);
        return (
          <AssetNextStepCell
            model={buildDatasetNextSteps(locale, {
              latestVersionId,
              mapReady,
              onOpenInWorkflow: latestVersionId
                ? () => openDatasetInWorkflow(latestVersionId, record.name)
                : undefined,
              onOpenInMap:
                latestVersionId && mapReady
                  ? () => openAssetVersionInMap(latestVersionId, record.name)
                  : undefined,
            })}
          />
        );
      },
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
      title: handoffCopy.nextSteps,
      key: 'nextSteps',
      render: (_: unknown, record: ProductAssetSummary) => (
        <AssetNextStepCell model={buildProductNextSteps(locale, record)} />
      ),
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
        value ? value : '-',
    },
    {
      title: handoffCopy.nextSteps,
      key: 'nextSteps',
      render: (_: unknown, record: NonNullable<typeof overview>['workflowRuns'][number]) => {
        const resultDatasetVersion = snapshot.datasetVersions.find(
          (datasetVersion) => datasetVersion.id === record.resultDatasetVersionId,
        );
        const resultDataset = snapshot.datasets.find(
          (dataset) => dataset.id === resultDatasetVersion?.datasetId,
        );
        const mapReady =
          resultDatasetVersion !== undefined &&
          resultDataset !== undefined &&
          isDatasetVersionMapReady(resultDataset.kind, resultDatasetVersion);

        return (
          <AssetNextStepCell
            model={buildDatasetNextSteps(locale, {
              latestVersionId: record.resultDatasetVersionId,
              mapReady,
              missingVersionNote:
                locale === 'zh-CN'
                  ? '当前运行还没有输出结果数据集，暂时不能继续送入工作流或地图。'
                  : 'This workflow run does not have a result dataset yet.',
              onOpenInWorkflow: record.resultDatasetVersionId
                ? () => openDatasetInWorkflow(record.resultDatasetVersionId!, record.id)
                : undefined,
              onOpenInMap:
                record.resultDatasetVersionId && mapReady
                  ? () => openAssetVersionInMap(record.resultDatasetVersionId!, record.id)
                  : undefined,
            })}
          />
        );
      },
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: NonNullable<typeof overview>['workflowRuns'][number]) =>
        record.resultDatasetVersionId && token ? (
          <Button type="link" onClick={() => void downloadDatasetVersion(token, record.resultDatasetVersionId!)}>
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
      title: handoffCopy.nextSteps,
      key: 'nextSteps',
      render: (_: unknown, record: NonNullable<typeof overview>['modelVersions'][number]) => (
        <AssetNextStepCell
          model={buildModelNextSteps(locale, record, {
            onOpenInWorkflow: () =>
              openModelVersionInWorkflow(record.id, record.modelName ?? record.modelId),
          })}
        />
      ),
    },
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
      title: handoffCopy.nextSteps,
      key: 'nextSteps',
      render: (_: unknown, record: NonNullable<typeof overview>['geeCredentials'][number]) => (
        <AssetNextStepCell
          model={buildGeeCredentialNextSteps(locale, record, {
            onOpenInWorkflow: () => openGeeCredentialInWorkflow(record.id, record.name),
          })}
        />
      ),
    },
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
      title: handoffCopy.nextSteps,
      key: 'nextSteps',
      render: (_: unknown, record: NonNullable<typeof overview>['spatialRois'][number]) => (
        <AssetNextStepCell
          model={buildSpatialRoiNextSteps(locale, {
            onOpenInWorkflow: () => openSpatialRoiInWorkflow(record.id, record.name),
          })}
        />
      ),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: unknown, record: NonNullable<typeof overview>['spatialRois'][number]) => {
        const canManageSpatialRoi = isAdmin || currentUser?.id === record.ownerUserId;
        return (
          <Space wrap>
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
      title: handoffCopy.nextSteps,
      key: 'nextSteps',
      render: (_: unknown, record: NonNullable<typeof overview>['spatialOverlays'][number]) => (
        <AssetNextStepCell
          model={buildSpatialOverlayNextSteps(locale, {
            onOpenInMap: () => openAssetVersionInMap(record.datasetVersionId, record.name),
          })}
        />
      ),
    },
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

  const assetSectionCopy =
    locale === 'zh-CN'
      ? {
          dataGroup: '可复用输入资产',
          automationGroup: '流程与结果',
          capabilityGroup: '共享能力',
          spatialGroup: '空间资产',
          datasetSummary: `${datasetRows.filter((item) => item.assetType === 'dataset').length} 个输入资产，${datasetRows.filter((item) => item.assetType === 'result').length} 个派生结果`,
          datasetDetail: `${datasetRows.filter((item) => isSharedVisibility(item.visibility)).length} 个已共享数据集可继续跨页面复用`,
          workflowSummary: `${overview?.workflowVersions.length ?? 0} 个工作流版本可沉淀为标准化流程资产`,
          workflowDetail: `${(overview?.workflowVersions ?? []).filter((item) => isSharedVisibility(item.visibility)).length} 个已共享工作流版本`,
          productSummary: `${productRows.length} 个产品资产纳入统一资产库`,
          productDetail: `${productRows.filter((item) => isSharedVisibility(item.visibility)).length} 个产品已发布到展示面`,
          runSummary: `${overview?.workflowRuns.length ?? 0} 次运行记录沉淀到结果中心`,
          runDetail: `${(overview?.workflowRuns ?? []).filter((item) => item.status === 'succeeded').length} 次成功运行`,
          modelSummary: `${overview?.modelVersions.length ?? 0} 个模型版本可直接供工作流调用`,
          modelDetail: `${(overview?.modelVersions ?? []).filter((item) => isSharedVisibility(item.visibility)).length} 个模型已共享`,
          geeSummary: `${overview?.geeCredentials.length ?? 0} 个 GEE 凭据可作为 Earth Engine 访问能力复用`,
          geeDetail: `${(overview?.geeCredentials ?? []).filter((item) => item.isPlatformDefault).length} 个凭据已设为平台默认`,
          roiSummary: `${overview?.spatialRois.length ?? 0} 个 ROI 可作为空间输入继续流转`,
          roiDetail: `${(overview?.spatialRois ?? []).filter((item) => item.visibility === 'public').length} 个 ROI 已公开`,
          overlaySummary: `${overview?.spatialOverlays.length ?? 0} 个叠加层记录可复用地图表达`,
          overlayDetail: `${(overview?.spatialOverlays ?? []).filter((item) => item.visibility === 'public').length} 个叠加层已公开`,
        }
      : {
          dataGroup: 'Reusable Inputs',
          automationGroup: 'Automation And Results',
          capabilityGroup: 'Shared Capabilities',
          spatialGroup: 'Spatial Assets',
          datasetSummary: `${datasetRows.filter((item) => item.assetType === 'dataset').length} input assets and ${datasetRows.filter((item) => item.assetType === 'result').length} derived results`,
          datasetDetail: `${datasetRows.filter((item) => isSharedVisibility(item.visibility)).length} shared datasets can continue across pages`,
          workflowSummary: `${overview?.workflowVersions.length ?? 0} workflow versions stored as reusable process assets`,
          workflowDetail: `${(overview?.workflowVersions ?? []).filter((item) => isSharedVisibility(item.visibility)).length} shared workflow versions`,
          productSummary: `${productRows.length} product assets managed in the shared library`,
          productDetail: `${productRows.filter((item) => isSharedVisibility(item.visibility)).length} products published to the showcase`,
          runSummary: `${overview?.workflowRuns.length ?? 0} workflow runs archived into the result center`,
          runDetail: `${(overview?.workflowRuns ?? []).filter((item) => item.status === 'succeeded').length} successful runs`,
          modelSummary: `${overview?.modelVersions.length ?? 0} model versions ready for workflow use`,
          modelDetail: `${(overview?.modelVersions ?? []).filter((item) => isSharedVisibility(item.visibility)).length} shared model versions`,
          geeSummary: `${overview?.geeCredentials.length ?? 0} GEE credentials reusable as Earth Engine access capabilities`,
          geeDetail: `${(overview?.geeCredentials ?? []).filter((item) => item.isPlatformDefault).length} credentials set as platform default`,
          roiSummary: `${overview?.spatialRois.length ?? 0} ROIs available as spatial inputs`,
          roiDetail: `${(overview?.spatialRois ?? []).filter((item) => item.visibility === 'public').length} public ROIs`,
          overlaySummary: `${overview?.spatialOverlays.length ?? 0} overlays preserved as reusable map expressions`,
          overlayDetail: `${(overview?.spatialOverlays ?? []).filter((item) => item.visibility === 'public').length} public overlays`,
        };

  const assetSections: AssetCatalogSection[] = [
    {
      key: 'datasets',
      label: t('assets.tabDatasets'),
      rows: datasetRows as AssetCatalogSection['rows'],
      columns: datasetColumns as AssetCatalogSection['columns'],
      emptyLabel: t('assets.empty'),
      groupKey: 'data',
      groupLabel: assetSectionCopy.dataGroup,
      summary: assetSectionCopy.datasetSummary,
      detail: assetSectionCopy.datasetDetail,
      defaultExpanded: true,
    },
    {
      key: 'workflows',
      label: t('assets.tabWorkflows'),
      rows: (overview?.workflowVersions ?? []) as AssetCatalogSection['rows'],
      columns: workflowColumns as AssetCatalogSection['columns'],
      emptyLabel: t('assets.empty'),
      groupKey: 'automation',
      groupLabel: assetSectionCopy.automationGroup,
      summary: assetSectionCopy.workflowSummary,
      detail: assetSectionCopy.workflowDetail,
    },
    {
      key: 'products',
      label: productCopy.tab,
      rows: productRows as AssetCatalogSection['rows'],
      columns: productColumns as AssetCatalogSection['columns'],
      emptyLabel: productCopy.empty,
      groupKey: 'data',
      groupLabel: assetSectionCopy.dataGroup,
      summary: assetSectionCopy.productSummary,
      detail: assetSectionCopy.productDetail,
    },
    {
      key: 'runs',
      label: t('assets.tabRuns'),
      rows: (overview?.workflowRuns ?? []) as AssetCatalogSection['rows'],
      columns: runColumns as AssetCatalogSection['columns'],
      emptyLabel: t('assets.empty'),
      groupKey: 'automation',
      groupLabel: assetSectionCopy.automationGroup,
      summary: assetSectionCopy.runSummary,
      detail: assetSectionCopy.runDetail,
    },
    {
      key: 'models',
      label: t('assets.tabModels'),
      rows: (overview?.modelVersions ?? []) as AssetCatalogSection['rows'],
      columns: modelColumns as AssetCatalogSection['columns'],
      emptyLabel: t('assets.empty'),
      groupKey: 'data',
      groupLabel: assetSectionCopy.dataGroup,
      summary: assetSectionCopy.modelSummary,
      detail: assetSectionCopy.modelDetail,
    },
    {
      key: 'gee-credentials',
      label: geeCopy.tab,
      rows: (overview?.geeCredentials ?? []) as AssetCatalogSection['rows'],
      columns: geeCredentialColumns as AssetCatalogSection['columns'],
      emptyLabel: geeCopy.empty,
      groupKey: 'capabilities',
      groupLabel: assetSectionCopy.capabilityGroup,
      summary: assetSectionCopy.geeSummary,
      detail: assetSectionCopy.geeDetail,
    },
    {
      key: 'spatial-rois',
      label: spatialCopy.roiTab,
      rows: (overview?.spatialRois ?? []) as AssetCatalogSection['rows'],
      columns: spatialRoiColumns as AssetCatalogSection['columns'],
      emptyLabel: spatialCopy.emptyRoi,
      groupKey: 'spatial',
      groupLabel: assetSectionCopy.spatialGroup,
      summary: assetSectionCopy.roiSummary,
      detail: assetSectionCopy.roiDetail,
    },
    {
      key: 'spatial-overlays',
      label: spatialCopy.overlayTab,
      rows: (overview?.spatialOverlays ?? []) as AssetCatalogSection['rows'],
      columns: spatialOverlayColumns as AssetCatalogSection['columns'],
      emptyLabel: spatialCopy.emptyOverlay,
      groupKey: 'spatial',
      groupLabel: assetSectionCopy.spatialGroup,
      summary: assetSectionCopy.overlaySummary,
      detail: assetSectionCopy.overlayDetail,
    },
  ];
  return (
    <div className="page-stack">
      <PersonalAssetsHeader
        kicker={pageCopy.kicker}
        title={pageCopy.title}
        copy={pageCopy.copy}
        isAssetsView={isAssetsView}
        uploadDatasetLabel={t('assets.uploadDataset')}
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
