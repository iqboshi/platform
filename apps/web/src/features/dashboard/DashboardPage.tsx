import type {
  DashboardAnnouncementItem,
  DashboardConfig,
  DashboardFeatureItem,
  FeedbackTicketCategory,
  FeedbackTicketPriority,
  FeedbackTicketStatus,
  FeedbackTicketSummary,
} from '@platform/types';
import type { PlatformDataSnapshot } from '@/lib/api';

import {
  App,
  Button,
  Card,
  Col,
  Collapse,
  Descriptions,
  Empty,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  AppstoreOutlined,
  BellOutlined,
  BulbOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  RadarChartOutlined,
  SafetyOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { isApiError } from '@/auth/errors';
import { useAuth } from '@/auth/useAuth';
import { StatCard } from '@/components/StatCard';
import { useI18n } from '@/i18n/useI18n';
import {
  createFeedbackTicket,
  getFeedbackTicket,
  updateDashboardConfig,
  updateFeedbackTicket,
} from '@/lib/api';
import { workflowRunStatusKey } from '@/lib/i18n-helpers';

const { Paragraph, Text, Title } = Typography;
const { TextArea } = Input;

type DashboardLocale = 'zh-CN' | 'en-US';

type QuickAction = {
  key: string;
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
};

function pickLocalizedValue(
  locale: DashboardLocale,
  valueZh: string | undefined,
  valueEn: string | undefined,
): string {
  return locale === 'zh-CN' ? valueZh ?? valueEn ?? '' : valueEn ?? valueZh ?? '';
}

function formatDateTime(value: string | undefined, locale: DashboardLocale): string {
  if (!value) {
    return '-';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString(locale);
}

function parseDateValue(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function featureIcon(iconKey: string) {
  switch (iconKey) {
    case 'datasets':
      return <FolderOpenOutlined />;
    case 'workflows':
      return <ThunderboltOutlined />;
    case 'models':
      return <RadarChartOutlined />;
    case 'assets':
      return <UserOutlined />;
    case 'governance':
      return <SafetyOutlined />;
    case 'announcements':
      return <BellOutlined />;
    case 'insights':
      return <BulbOutlined />;
    default:
      return <AppstoreOutlined />;
  }
}

const DASHBOARD_COPY = {
  'zh-CN': {
    heroKicker: '平台总览',
    heroTitle: '用一个首页串起数据、工作流、模型与团队协作。',
    heroCopy:
      '这里不再只是一个统计看板，而是团队进入平台后的运营门户。成员可以快速进入核心模块、查看更新公告，并通过意见工单持续推动平台完善。',
    openWorkflows: '打开工作流',
    browseDatasets: '浏览公开数据集',
    editPortal: '编辑门户内容',
    quickDatasets: '公开数据集',
    quickDatasetsCopy: '查看平台对外展示的数据资产、简介和可下载版本。',
    quickWorkflows: '工作流中心',
    quickWorkflowsCopy: '搭建、测试并运行你的数据处理与模型链路。',
    quickAssets: '个人资产',
    quickAssetsCopy: '统一管理自己的数据集、结果、工作流和凭证资产。',
    quickModels: '模型中心',
    quickModelsCopy: '查看平台内置模型、训练产物和外部 API 模型配置。',
    features: '功能介绍',
    featuresCopy: '通过结构化功能卡片，快速理解平台当前已经落地的核心能力。',
    noFeatures: '当前还没有启用的功能卡片。',
    announcements: '更新公告',
    announcementsCopy: '查看近期的重要更新、已上线能力和使用说明。',
    noAnnouncements: '当前还没有已发布的公告。',
    pinned: '置顶',
    published: '已发布',
    viewDetails: '查看详情',
    feedbackTitle: '意见与工单',
    feedbackCopyAdmin: '统一查看成员提交的问题、需求和体验反馈，并直接在平台内推进处理。',
    feedbackCopyMember: '提交问题、需求和体验反馈，并持续跟踪管理员的处理状态与回复。',
    feedbackNew: '提交反馈',
    feedbackNewTitle: '新建反馈工单',
    feedbackNewSuccess: '反馈工单已提交。',
    feedbackUpdateSuccess: '反馈工单已更新。',
    feedbackEmpty: '当前没有反馈工单。',
    feedbackRecentAdmin: '最近工单',
    feedbackRecentMine: '我的工单',
    feedbackSummaryOpen: '待处理',
    feedbackSummaryInProgress: '处理中',
    feedbackSummaryMineOpen: '我的待处理',
    feedbackSummaryMineActive: '我的活跃工单',
    feedbackRequester: '提交人',
    feedbackFieldTitle: '标题',
    feedbackFieldCategory: '分类',
    feedbackFieldPriority: '优先级',
    feedbackFieldContact: '联系方式',
    feedbackFieldContent: '详细描述',
    feedbackFieldStatus: '状态',
    feedbackFieldAdminReply: '管理员回复',
    feedbackFieldCreatedAt: '创建时间',
    feedbackFieldUpdatedAt: '更新时间',
    feedbackFieldHref: '跳转路径',
    feedbackFieldIcon: '图标',
    feedbackFieldPublishedAt: '发布日期',
    feedbackFieldPublished: '发布',
    feedbackFieldPinned: '置顶',
    feedbackAdminReplyEmpty: '管理员暂未回复。',
    feedbackCategoryBug: '问题缺陷',
    feedbackCategoryFeatureRequest: '功能需求',
    feedbackCategoryUx: '体验优化',
    feedbackCategoryQuestion: '使用问题',
    feedbackCategoryOther: '其他',
    feedbackPriorityLow: '低',
    feedbackPriorityMedium: '中',
    feedbackPriorityHigh: '高',
    feedbackStatusOpen: '待处理',
    feedbackStatusInProgress: '处理中',
    feedbackStatusResolved: '已解决',
    feedbackStatusClosed: '已关闭',
    feedbackDetailTitle: '工单详情',
    portalEditTitle: '编辑首页门户内容',
    portalEditSuccess: '门户内容已更新。',
    portalFeaturesSection: '功能介绍卡片',
    portalAnnouncementsSection: '更新公告',
    portalFeatureAdd: '新增功能卡片',
    portalAnnouncementAdd: '新增公告',
    portalFeatureCard: '功能卡片',
    portalAnnouncementCard: '公告',
    portalButtonLabel: '按钮文案',
    portalTitleZh: '中文标题',
    portalTitleEn: '英文标题',
    portalSummaryZh: '中文简介',
    portalSummaryEn: '英文简介',
    portalContentZh: '中文正文',
    portalContentEn: '英文正文',
    portalTagZh: '中文标签',
    portalTagEn: '英文标签',
    portalEnabled: '启用',
    openSection: '进入模块',
    runsTitle: '最近运行记录',
    noRuns: '当前还没有工作流运行记录。',
    runsSubmittedBy: '提交人',
    runsStartedAt: '开始时间',
    runsFinishedAt: '结束时间',
    runsResult: '结果产物',
    runsError: '错误信息',
    workspaceReady: '工作空间在线',
    workspaceReadyCopy: '首页已经切换为运营门户模式，便于团队快速理解能力边界并开始协作。',
    statPublicDatasets: '公开数据集',
    statPublicDatasetsDetail: '面向团队展示的数据资产数量。',
    statWorkflowRuns: '工作流运行',
    statWorkflowRunsDetail: '近期工作流执行记录与结果产物。',
    statModelVersions: '模型版本',
    statModelVersionsDetail: '已接入的平台模型与训练权重资产。',
    statFeedback: '活跃工单',
    statFeedbackDetail: '当前仍在跟进中的问题、需求与体验反馈。',
    actionSave: '保存',
    actionClose: '关闭',
    actionRemove: '移除',
    authMissing: '登录状态已失效，请重新登录。',
    ticketMeta: '工单信息',
    portalRoutePlaceholder: '/workflows',
    portalIconPlaceholder: 'datasets / workflows / models / assets',
  },
  'en-US': {
    heroKicker: 'Operations Portal',
    heroTitle: 'Bring data, workflows, models, and collaboration into one entry point.',
    heroCopy:
      'This is no longer just a statistics board. It is the workspace landing page where users enter the platform, jump into core modules, read release notes, and keep the feedback loop active.',
    openWorkflows: 'Open workflows',
    browseDatasets: 'Browse public datasets',
    editPortal: 'Edit portal content',
    quickDatasets: 'Public datasets',
    quickDatasetsCopy: 'Review published assets, curated descriptions, and downloadable versions.',
    quickWorkflows: 'Workflow center',
    quickWorkflowsCopy: 'Design, test, and run your data processing and model pipelines.',
    quickAssets: 'My assets',
    quickAssetsCopy: 'Manage your datasets, outputs, workflows, and credentials in one place.',
    quickModels: 'Model center',
    quickModelsCopy: 'Inspect packaged models, trained weights, and external API model configs.',
    features: 'Capability highlights',
    featuresCopy: 'Use structured cards to understand the core capabilities already delivered.',
    noFeatures: 'No enabled feature cards are configured right now.',
    announcements: 'Release notes',
    announcementsCopy: 'Review recent platform updates, live capabilities, and usage notes.',
    noAnnouncements: 'No published announcements are available right now.',
    pinned: 'Pinned',
    published: 'Published',
    viewDetails: 'View details',
    feedbackTitle: 'Feedback workbench',
    feedbackCopyAdmin:
      'Review member-reported issues, requests, and UX notes, then respond and update status in one place.',
    feedbackCopyMember:
      'Submit bugs, feature requests, and UX notes, then track status and administrator replies from the same page.',
    feedbackNew: 'Submit feedback',
    feedbackNewTitle: 'Create feedback ticket',
    feedbackNewSuccess: 'Feedback ticket submitted.',
    feedbackUpdateSuccess: 'Feedback ticket updated.',
    feedbackEmpty: 'No feedback tickets are available.',
    feedbackRecentAdmin: 'Recent tickets',
    feedbackRecentMine: 'My tickets',
    feedbackSummaryOpen: 'Open',
    feedbackSummaryInProgress: 'In progress',
    feedbackSummaryMineOpen: 'My open tickets',
    feedbackSummaryMineActive: 'My active tickets',
    feedbackRequester: 'Requester',
    feedbackFieldTitle: 'Title',
    feedbackFieldCategory: 'Category',
    feedbackFieldPriority: 'Priority',
    feedbackFieldContact: 'Contact',
    feedbackFieldContent: 'Details',
    feedbackFieldStatus: 'Status',
    feedbackFieldAdminReply: 'Admin reply',
    feedbackFieldCreatedAt: 'Created at',
    feedbackFieldUpdatedAt: 'Updated at',
    feedbackFieldHref: 'Target route',
    feedbackFieldIcon: 'Icon',
    feedbackFieldPublishedAt: 'Publish date',
    feedbackFieldPublished: 'Published',
    feedbackFieldPinned: 'Pinned',
    feedbackAdminReplyEmpty: 'No administrator reply has been added yet.',
    feedbackCategoryBug: 'Bug',
    feedbackCategoryFeatureRequest: 'Feature request',
    feedbackCategoryUx: 'UX improvement',
    feedbackCategoryQuestion: 'Question',
    feedbackCategoryOther: 'Other',
    feedbackPriorityLow: 'Low',
    feedbackPriorityMedium: 'Medium',
    feedbackPriorityHigh: 'High',
    feedbackStatusOpen: 'Open',
    feedbackStatusInProgress: 'In progress',
    feedbackStatusResolved: 'Resolved',
    feedbackStatusClosed: 'Closed',
    feedbackDetailTitle: 'Ticket details',
    portalEditTitle: 'Edit dashboard portal content',
    portalEditSuccess: 'Portal content updated.',
    portalFeaturesSection: 'Feature highlight cards',
    portalAnnouncementsSection: 'Announcements',
    portalFeatureAdd: 'Add feature card',
    portalAnnouncementAdd: 'Add announcement',
    portalFeatureCard: 'Feature card',
    portalAnnouncementCard: 'Announcement',
    portalButtonLabel: 'Button label',
    portalTitleZh: 'Chinese title',
    portalTitleEn: 'English title',
    portalSummaryZh: 'Chinese summary',
    portalSummaryEn: 'English summary',
    portalContentZh: 'Chinese content',
    portalContentEn: 'English content',
    portalTagZh: 'Chinese tag',
    portalTagEn: 'English tag',
    portalEnabled: 'Enabled',
    openSection: 'Open section',
    runsTitle: 'Recent workflow runs',
    noRuns: 'No workflow runs are available yet.',
    runsSubmittedBy: 'Submitted by',
    runsStartedAt: 'Started at',
    runsFinishedAt: 'Finished at',
    runsResult: 'Result artifact',
    runsError: 'Error',
    workspaceReady: 'Workspace online',
    workspaceReadyCopy:
      'The landing page now works as an operations-style portal so teams can understand the platform and move faster.',
    statPublicDatasets: 'Public datasets',
    statPublicDatasetsDetail: 'Published assets visible to the team.',
    statWorkflowRuns: 'Workflow runs',
    statWorkflowRunsDetail: 'Recent executions and produced result artifacts.',
    statModelVersions: 'Model versions',
    statModelVersionsDetail: 'Packaged models and trained weight assets available on the platform.',
    statFeedback: 'Active tickets',
    statFeedbackDetail: 'Open issues, requests, and UX feedback still under follow-up.',
    actionSave: 'Save',
    actionClose: 'Close',
    actionRemove: 'Remove',
    authMissing: 'Authentication is missing. Please sign in again.',
    ticketMeta: 'Ticket meta',
    portalRoutePlaceholder: '/workflows',
    portalIconPlaceholder: 'datasets / workflows / models / assets',
  },
} as const;

type DashboardCopy = (typeof DASHBOARD_COPY)[keyof typeof DASHBOARD_COPY];

function feedbackCategoryLabel(category: FeedbackTicketCategory, copy: DashboardCopy): string {
  switch (category) {
    case 'bug':
      return copy.feedbackCategoryBug;
    case 'feature_request':
      return copy.feedbackCategoryFeatureRequest;
    case 'ux':
      return copy.feedbackCategoryUx;
    case 'question':
      return copy.feedbackCategoryQuestion;
    default:
      return copy.feedbackCategoryOther;
  }
}

function feedbackPriorityLabel(priority: FeedbackTicketPriority, copy: DashboardCopy): string {
  switch (priority) {
    case 'low':
      return copy.feedbackPriorityLow;
    case 'high':
      return copy.feedbackPriorityHigh;
    default:
      return copy.feedbackPriorityMedium;
  }
}

function feedbackStatusLabel(status: FeedbackTicketStatus, copy: DashboardCopy): string {
  switch (status) {
    case 'in_progress':
      return copy.feedbackStatusInProgress;
    case 'resolved':
      return copy.feedbackStatusResolved;
    case 'closed':
      return copy.feedbackStatusClosed;
    default:
      return copy.feedbackStatusOpen;
  }
}

function feedbackPriorityColor(priority: FeedbackTicketPriority): string {
  switch (priority) {
    case 'low':
      return 'default';
    case 'high':
      return 'red';
    default:
      return 'gold';
  }
}

function feedbackStatusColor(status: FeedbackTicketStatus): string {
  switch (status) {
    case 'in_progress':
      return 'processing';
    case 'resolved':
      return 'success';
    case 'closed':
      return 'default';
    default:
      return 'warning';
  }
}

function dashboardErrorMessage(error: unknown, fallback: string): string {
  return isApiError(error) ? error.message : fallback;
}

function nextId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function DashboardPage({
  snapshot,
  onRefresh,
}: {
  snapshot: PlatformDataSnapshot;
  onRefresh: () => Promise<void>;
}) {
  const { message } = App.useApp();
  const { currentUser, hasPermission, token } = useAuth();
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const [feedbackForm] = Form.useForm();
  const [feedbackDetailForm] = Form.useForm();
  const [portalForm] = Form.useForm();
  const [announcementOpen, setAnnouncementOpen] = useState<DashboardAnnouncementItem | null>(null);
  const [feedbackCreateOpen, setFeedbackCreateOpen] = useState(false);
  const [feedbackCreateSaving, setFeedbackCreateSaving] = useState(false);
  const [feedbackDetailOpen, setFeedbackDetailOpen] = useState(false);
  const [feedbackDetailLoading, setFeedbackDetailLoading] = useState(false);
  const [feedbackDetailSaving, setFeedbackDetailSaving] = useState(false);
  const [feedbackDetail, setFeedbackDetail] = useState<FeedbackTicketSummary | null>(null);
  const [portalEditorOpen, setPortalEditorOpen] = useState(false);
  const [portalEditorSaving, setPortalEditorSaving] = useState(false);

  const copy = DASHBOARD_COPY[locale];
  const canConfigurePortal = hasPermission('system.configure');
  const canManageModels = hasPermission('model.view');
  const isAdmin = canConfigurePortal;

  const displayedFeatures = useMemo(
    () => snapshot.dashboardConfig.featureSections.filter((item) => item.enabled),
    [snapshot.dashboardConfig.featureSections],
  );
  const displayedAnnouncements = useMemo(
    () =>
      [...snapshot.dashboardConfig.announcements]
        .filter((item) => item.published)
        .sort((left, right) => {
          if (left.pinned !== right.pinned) {
            return left.pinned ? -1 : 1;
          }
          return parseDateValue(right.publishedAt) - parseDateValue(left.publishedAt);
        }),
    [snapshot.dashboardConfig.announcements],
  );
  const recentRuns = useMemo(
    () =>
      [...snapshot.workflowRuns]
        .sort(
          (left, right) =>
            parseDateValue(right.startedAt ?? right.finishedAt) -
            parseDateValue(left.startedAt ?? left.finishedAt),
        )
        .slice(0, 6),
    [snapshot.workflowRuns],
  );
  const publicDatasetCount = useMemo(
    () => snapshot.datasets.filter((item) => item.visibility === 'public').length,
    [snapshot.datasets],
  );
  const activeTicketCount = isAdmin
    ? snapshot.feedbackSummary.adminOpenCount + snapshot.feedbackSummary.adminInProgressCount
    : snapshot.feedbackSummary.myActiveCount;

  const quickActions = useMemo<QuickAction[]>(
    () =>
      [
        {
          key: 'datasets',
          title: copy.quickDatasets,
          description: copy.quickDatasetsCopy,
          href: '/datasets',
          icon: <FolderOpenOutlined />,
        },
        {
          key: 'workflows',
          title: copy.quickWorkflows,
          description: copy.quickWorkflowsCopy,
          href: '/workflows',
          icon: <ThunderboltOutlined />,
        },
        {
          key: 'assets',
          title: copy.quickAssets,
          description: copy.quickAssetsCopy,
          href: '/assets',
          icon: <UserOutlined />,
        },
        {
          key: 'models',
          title: copy.quickModels,
          description: copy.quickModelsCopy,
          href: '/models',
          icon: <RadarChartOutlined />,
        },
      ].filter((item) => (item.key === 'models' ? canManageModels : true)),
    [canManageModels, copy],
  );

  const feedbackCategoryOptions = useMemo(
    () => [
      { value: 'bug', label: copy.feedbackCategoryBug },
      { value: 'feature_request', label: copy.feedbackCategoryFeatureRequest },
      { value: 'ux', label: copy.feedbackCategoryUx },
      { value: 'question', label: copy.feedbackCategoryQuestion },
      { value: 'other', label: copy.feedbackCategoryOther },
    ],
    [copy],
  );
  const feedbackPriorityOptions = useMemo(
    () => [
      { value: 'low', label: copy.feedbackPriorityLow },
      { value: 'medium', label: copy.feedbackPriorityMedium },
      { value: 'high', label: copy.feedbackPriorityHigh },
    ],
    [copy],
  );
  const feedbackStatusOptions = useMemo(
    () => [
      { value: 'open', label: copy.feedbackStatusOpen },
      { value: 'in_progress', label: copy.feedbackStatusInProgress },
      { value: 'resolved', label: copy.feedbackStatusResolved },
      { value: 'closed', label: copy.feedbackStatusClosed },
    ],
    [copy],
  );
  const iconOptions = useMemo(
    () => [
      { value: 'datasets', label: 'datasets' },
      { value: 'workflows', label: 'workflows' },
      { value: 'models', label: 'models' },
      { value: 'assets', label: 'assets' },
      { value: 'governance', label: 'governance' },
      { value: 'announcements', label: 'announcements' },
      { value: 'insights', label: 'insights' },
    ],
    [],
  );

  const feedbackColumns = useMemo(
    () => [
      {
        title: copy.feedbackFieldTitle,
        dataIndex: 'title',
        key: 'title',
        render: (_value: string, record: FeedbackTicketSummary) => (
          <div>
            <Text strong>{record.title}</Text>
            <div className="dashboard-table-subtle">
              {feedbackCategoryLabel(record.category, copy)}
            </div>
          </div>
        ),
      },
      {
        title: copy.feedbackRequester,
        dataIndex: 'createdByDisplayName',
        key: 'createdByDisplayName',
        render: (_value: string | undefined, record: FeedbackTicketSummary) =>
          record.createdByDisplayName || record.createdBy,
      },
      {
        title: copy.feedbackFieldPriority,
        dataIndex: 'priority',
        key: 'priority',
        render: (value: FeedbackTicketPriority) => (
          <Tag color={feedbackPriorityColor(value)}>
            {feedbackPriorityLabel(value, copy)}
          </Tag>
        ),
      },
      {
        title: copy.feedbackFieldStatus,
        dataIndex: 'status',
        key: 'status',
        render: (value: FeedbackTicketStatus) => (
          <Tag color={feedbackStatusColor(value)}>{feedbackStatusLabel(value, copy)}</Tag>
        ),
      },
      {
        title: copy.feedbackFieldUpdatedAt,
        dataIndex: 'updatedAt',
        key: 'updatedAt',
        render: (value: string) => formatDateTime(value, locale),
      },
    ],
    [copy, locale],
  );

  const runColumns = useMemo(
    () => [
      {
        title: copy.feedbackFieldTitle,
        dataIndex: 'id',
        key: 'id',
        render: (value: string) => <Text code>{value.slice(0, 12)}</Text>,
      },
      {
        title: copy.feedbackFieldStatus,
        dataIndex: 'status',
        key: 'status',
        render: (value: string) => <Tag>{t(workflowRunStatusKey(value as never))}</Tag>,
      },
      {
        title: copy.runsSubmittedBy,
        dataIndex: 'submittedBy',
        key: 'submittedBy',
      },
      {
        title: copy.runsStartedAt,
        dataIndex: 'startedAt',
        key: 'startedAt',
        render: (value: string | undefined) => formatDateTime(value, locale),
      },
    ],
    [copy, locale, t],
  );

  useEffect(() => {
    if (!feedbackCreateOpen) {
      feedbackForm.resetFields();
      return;
    }
    feedbackForm.setFieldsValue({
      category: 'bug',
      priority: 'medium',
      contact: currentUser?.email ?? '',
    });
  }, [currentUser?.email, feedbackCreateOpen, feedbackForm]);

  useEffect(() => {
    if (!feedbackDetailOpen || !feedbackDetail) {
      return;
    }
    feedbackDetailForm.setFieldsValue({
      title: feedbackDetail.title,
      category: feedbackDetail.category,
      priority: feedbackDetail.priority,
      status: feedbackDetail.status,
      contact: feedbackDetail.contact ?? '',
      content: feedbackDetail.content,
      adminReply: feedbackDetail.adminReply ?? '',
    });
  }, [feedbackDetail, feedbackDetailForm, feedbackDetailOpen]);

  useEffect(() => {
    if (!portalEditorOpen) {
      return;
    }
    portalForm.setFieldsValue({
      featureSections: snapshot.dashboardConfig.featureSections,
      announcements: snapshot.dashboardConfig.announcements,
    });
  }, [portalEditorOpen, portalForm, snapshot.dashboardConfig]);

  const openFeedbackDetail = async (ticketId: string) => {
    if (!token) {
      message.error(copy.authMissing);
      return;
    }
    setFeedbackDetailOpen(true);
    setFeedbackDetailLoading(true);
    try {
      const payload = await getFeedbackTicket(token, ticketId);
      setFeedbackDetail(payload);
    } catch (error) {
      setFeedbackDetailOpen(false);
      message.error(dashboardErrorMessage(error, t('error.request_failed')));
    } finally {
      setFeedbackDetailLoading(false);
    }
  };

  const onCreateFeedback = async () => {
    if (!token) {
      message.error(copy.authMissing);
      return;
    }
    try {
      const values = await feedbackForm.validateFields();
      setFeedbackCreateSaving(true);
      await createFeedbackTicket(token, {
        workspaceId: snapshot.workspace.id,
        title: values.title,
        category: values.category,
        priority: values.priority,
        content: values.content,
        contact: values.contact,
      });
      message.success(copy.feedbackNewSuccess);
      setFeedbackCreateOpen(false);
      await onRefresh();
    } catch (error) {
      if (!isApiError(error) && error instanceof Error && error.message === 'Validate Error') {
        return;
      }
      message.error(dashboardErrorMessage(error, t('error.request_failed')));
    } finally {
      setFeedbackCreateSaving(false);
    }
  };

  const onSaveFeedbackDetail = async () => {
    if (!token || !feedbackDetail) {
      message.error(copy.authMissing);
      return;
    }
    try {
      const values = await feedbackDetailForm.validateFields();
      setFeedbackDetailSaving(true);
      const payload = await updateFeedbackTicket(token, feedbackDetail.id, {
        title: values.title,
        category: values.category,
        priority: values.priority,
        content: values.content,
        contact: values.contact,
        status: isAdmin ? values.status : undefined,
        adminReply: isAdmin ? values.adminReply : undefined,
      });
      setFeedbackDetail(payload);
      message.success(copy.feedbackUpdateSuccess);
      await onRefresh();
    } catch (error) {
      if (!isApiError(error) && error instanceof Error && error.message === 'Validate Error') {
        return;
      }
      message.error(dashboardErrorMessage(error, t('error.request_failed')));
    } finally {
      setFeedbackDetailSaving(false);
    }
  };

  const onSavePortalConfig = async () => {
    if (!token) {
      message.error(copy.authMissing);
      return;
    }
    try {
      const values = await portalForm.validateFields();
      setPortalEditorSaving(true);
      const payload: DashboardConfig = {
        featureSections: (values.featureSections ?? []).map(
          (item: DashboardFeatureItem, index: number) => ({
            id: item.id || nextId(`feature-${index + 1}`),
            titleZh: item.titleZh,
            titleEn: item.titleEn,
            summaryZh: item.summaryZh,
            summaryEn: item.summaryEn,
            buttonLabelZh: item.buttonLabelZh,
            buttonLabelEn: item.buttonLabelEn,
            href: item.href,
            iconKey: item.iconKey,
            enabled: Boolean(item.enabled),
          }),
        ),
        announcements: (values.announcements ?? []).map(
          (item: DashboardAnnouncementItem, index: number) => ({
            id: item.id || nextId(`announcement-${index + 1}`),
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
          }),
        ),
      };
      await updateDashboardConfig(token, payload);
      message.success(copy.portalEditSuccess);
      setPortalEditorOpen(false);
      await onRefresh();
    } catch (error) {
      if (!isApiError(error) && error instanceof Error && error.message === 'Validate Error') {
        return;
      }
      message.error(dashboardErrorMessage(error, t('error.request_failed')));
    } finally {
      setPortalEditorSaving(false);
    }
  };

  const detailEditable =
    feedbackDetail !== null &&
    (isAdmin ||
      (feedbackDetail.status !== 'resolved' && feedbackDetail.status !== 'closed'));

  return (
    <div className="page-stack">
      <Card className="panel-card dashboard-hero-panel" variant="borderless">
        <div className="dashboard-hero-layout">
          <div>
            <div className="hero-kicker">{copy.heroKicker}</div>
            <Title level={1} className="hero-title">
              {copy.heroTitle}
            </Title>
            <Paragraph className="hero-copy">{copy.heroCopy}</Paragraph>
            <div className="dashboard-hero-actions">
              <Button type="primary" size="large" onClick={() => navigate('/workflows')}>
                {copy.openWorkflows}
              </Button>
              <Button size="large" onClick={() => navigate('/datasets')}>
                {copy.browseDatasets}
              </Button>
              {canConfigurePortal ? (
                <Button size="large" onClick={() => setPortalEditorOpen(true)}>
                  {copy.editPortal}
                </Button>
              ) : null}
            </div>
          </div>
          <div className="dashboard-hero-side">
            <div className="dashboard-hero-note">
              <div className="panel-kicker">{copy.workspaceReady}</div>
              <Paragraph className="dashboard-hero-note-copy">{copy.workspaceReadyCopy}</Paragraph>
              <Space wrap>
                <Tag color="blue">{snapshot.workspace.name}</Tag>
                <Tag color={snapshot.source === 'api' ? 'green' : 'gold'}>
                  {snapshot.source.toUpperCase()}
                </Tag>
                {currentUser ? <Tag color="geekblue">{currentUser.displayName}</Tag> : null}
              </Space>
            </div>
            <div className="dashboard-feedback-summary">
              <div className="dashboard-summary-chip">
                <Text type="secondary">
                  {isAdmin ? copy.feedbackSummaryOpen : copy.feedbackSummaryMineOpen}
                </Text>
                <Title level={4}>
                  {isAdmin
                    ? snapshot.feedbackSummary.adminOpenCount
                    : snapshot.feedbackSummary.myOpenCount}
                </Title>
              </div>
              <div className="dashboard-summary-chip">
                <Text type="secondary">
                  {isAdmin ? copy.feedbackSummaryInProgress : copy.feedbackSummaryMineActive}
                </Text>
                <Title level={4}>{activeTicketCount}</Title>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="dashboard-quick-grid">
        {quickActions.map((item) => (
          <button
            key={item.key}
            type="button"
            className="dashboard-quick-card"
            onClick={() => navigate(item.href)}
          >
            <div className="dashboard-quick-icon">{item.icon}</div>
            <div className="dashboard-quick-copy">
              <Text strong>{item.title}</Text>
              <Paragraph>{item.description}</Paragraph>
            </div>
          </button>
        ))}
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            label={copy.statPublicDatasets}
            value={String(publicDatasetCount)}
            detail={copy.statPublicDatasetsDetail}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            label={copy.statWorkflowRuns}
            value={String(snapshot.workflowRuns.length)}
            detail={copy.statWorkflowRunsDetail}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            label={copy.statModelVersions}
            value={String(snapshot.modelVersions.length)}
            detail={copy.statModelVersionsDetail}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            label={copy.statFeedback}
            value={String(activeTicketCount)}
            detail={copy.statFeedbackDetail}
          />
        </Col>
      </Row>

      <Row gutter={[20, 20]} align="stretch">
        <Col xs={24} xl={14}>
          <Card className="panel-card dashboard-panel-card" variant="borderless">
            <div className="dashboard-section-head">
              <div>
                <div className="panel-kicker">{copy.features}</div>
                <Title level={3} className="section-title">
                  {copy.features}
                </Title>
                <Paragraph className="dashboard-section-copy">{copy.featuresCopy}</Paragraph>
              </div>
            </div>
            {displayedFeatures.length > 0 ? (
              <div className="dashboard-feature-grid">
                {displayedFeatures.map((item) => (
                  <Card key={item.id} className="dashboard-feature-card" variant="borderless">
                    <div className="dashboard-feature-icon">{featureIcon(item.iconKey)}</div>
                    <div className="dashboard-feature-body">
                      <Tag>{item.iconKey}</Tag>
                      <Title level={4}>
                        {pickLocalizedValue(locale, item.titleZh, item.titleEn)}
                      </Title>
                      <Paragraph className="dashboard-feature-copy">
                        {pickLocalizedValue(locale, item.summaryZh, item.summaryEn)}
                      </Paragraph>
                      <Button type="link" onClick={() => navigate(item.href)}>
                        {pickLocalizedValue(locale, item.buttonLabelZh, item.buttonLabelEn) ||
                          copy.openSection}
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Empty description={copy.noFeatures} />
            )}
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card className="panel-card dashboard-panel-card" variant="borderless">
            <div className="dashboard-section-head">
              <div>
                <div className="panel-kicker">{copy.announcements}</div>
                <Title level={3} className="section-title">
                  {copy.announcements}
                </Title>
                <Paragraph className="dashboard-section-copy">{copy.announcementsCopy}</Paragraph>
              </div>
            </div>
            {displayedAnnouncements.length > 0 ? (
              <div className="dashboard-announcement-list">
                {displayedAnnouncements.slice(0, 4).map((item) => (
                  <div
                    key={item.id}
                    className="dashboard-announcement-item"
                    role="button"
                    tabIndex={0}
                    onClick={() => setAnnouncementOpen(item)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setAnnouncementOpen(item);
                      }
                    }}
                  >
                    <div className="dashboard-announcement-head">
                      <Space wrap>
                        {item.pinned ? <Tag color="gold">{copy.pinned}</Tag> : null}
                        <Tag>{pickLocalizedValue(locale, item.tagZh, item.tagEn) || copy.published}</Tag>
                      </Space>
                      <Text className="dashboard-announcement-date">
                        {formatDateTime(item.publishedAt, locale)}
                      </Text>
                    </div>
                    <Title level={5}>
                      {pickLocalizedValue(locale, item.titleZh, item.titleEn)}
                    </Title>
                    <Paragraph className="dashboard-announcement-copy">
                      {pickLocalizedValue(locale, item.summaryZh, item.summaryEn)}
                    </Paragraph>
                    <Button type="link">{copy.viewDetails}</Button>
                  </div>
                ))}
              </div>
            ) : (
              <Empty description={copy.noAnnouncements} />
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[20, 20]} align="stretch">
        <Col xs={24} xl={15}>
          <Card className="panel-card dashboard-panel-card" variant="borderless">
            <div className="dashboard-section-head">
              <div>
                <div className="panel-kicker">{copy.feedbackTitle}</div>
                <Title level={3} className="section-title">
                  {copy.feedbackTitle}
                </Title>
                <Paragraph className="dashboard-section-copy">
                  {isAdmin ? copy.feedbackCopyAdmin : copy.feedbackCopyMember}
                </Paragraph>
              </div>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setFeedbackCreateOpen(true)}>
                {copy.feedbackNew}
              </Button>
            </div>
            <div className="dashboard-feedback-summary">
              <div className="dashboard-summary-chip">
                <Text type="secondary">
                  {isAdmin ? copy.feedbackSummaryOpen : copy.feedbackSummaryMineOpen}
                </Text>
                <Title level={4}>
                  {isAdmin
                    ? snapshot.feedbackSummary.adminOpenCount
                    : snapshot.feedbackSummary.myOpenCount}
                </Title>
              </div>
              <div className="dashboard-summary-chip">
                <Text type="secondary">
                  {isAdmin ? copy.feedbackSummaryInProgress : copy.feedbackSummaryMineActive}
                </Text>
                <Title level={4}>
                  {isAdmin
                    ? snapshot.feedbackSummary.adminInProgressCount
                    : snapshot.feedbackSummary.myActiveCount}
                </Title>
              </div>
            </div>
            {snapshot.feedbackTickets.length > 0 ? (
              <Table
                rowKey="id"
                className="dashboard-clickable-table"
                columns={feedbackColumns}
                dataSource={snapshot.feedbackTickets}
                pagination={false}
                onRow={(record) => ({
                  onClick: () => void openFeedbackDetail(record.id),
                  className: 'dashboard-clickable-row',
                })}
              />
            ) : (
              <Empty description={copy.feedbackEmpty} />
            )}
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <Card className="panel-card dashboard-panel-card" variant="borderless">
            <div className="dashboard-section-head">
              <div>
                <div className="panel-kicker">{copy.runsTitle}</div>
                <Title level={3} className="section-title">
                  {copy.runsTitle}
                </Title>
              </div>
            </div>
            {recentRuns.length > 0 ? (
              <Table
                rowKey="id"
                columns={runColumns}
                dataSource={recentRuns}
                pagination={false}
                size="small"
              />
            ) : (
              <Empty description={copy.noRuns} />
            )}
          </Card>
        </Col>
      </Row>

      <Modal
        open={announcementOpen !== null}
        title={
          announcementOpen
            ? pickLocalizedValue(locale, announcementOpen.titleZh, announcementOpen.titleEn)
            : copy.announcements
        }
        footer={<Button onClick={() => setAnnouncementOpen(null)}>{copy.actionClose}</Button>}
        onCancel={() => setAnnouncementOpen(null)}
        width={720}
        destroyOnHidden
      >
        {announcementOpen ? (
          <div className="dashboard-announcement-modal">
            <Space wrap>
              {announcementOpen.pinned ? <Tag color="gold">{copy.pinned}</Tag> : null}
              <Tag>{pickLocalizedValue(locale, announcementOpen.tagZh, announcementOpen.tagEn)}</Tag>
              <Text className="dashboard-announcement-date">
                {formatDateTime(announcementOpen.publishedAt, locale)}
              </Text>
            </Space>
            <Paragraph className="dashboard-announcement-modal-copy">
              {pickLocalizedValue(locale, announcementOpen.contentZh, announcementOpen.contentEn)}
            </Paragraph>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={feedbackCreateOpen}
        title={copy.feedbackNewTitle}
        okText={t('common.submit')}
        cancelText={t('common.cancel')}
        confirmLoading={feedbackCreateSaving}
        onOk={() => void onCreateFeedback()}
        onCancel={() => setFeedbackCreateOpen(false)}
        width={760}
        destroyOnHidden
      >
        <Form form={feedbackForm} layout="vertical">
          <div className="dashboard-form-grid">
            <Form.Item label={copy.feedbackFieldTitle} name="title" rules={[{ required: true, whitespace: true }]}>
              <Input />
            </Form.Item>
            <Form.Item label={copy.feedbackFieldContact} name="contact">
              <Input />
            </Form.Item>
            <Form.Item label={copy.feedbackFieldCategory} name="category" rules={[{ required: true }]}>
              <Select options={feedbackCategoryOptions} />
            </Form.Item>
            <Form.Item label={copy.feedbackFieldPriority} name="priority" rules={[{ required: true }]}>
              <Select options={feedbackPriorityOptions} />
            </Form.Item>
          </div>
          <Form.Item label={copy.feedbackFieldContent} name="content" rules={[{ required: true, whitespace: true }]}>
            <TextArea rows={6} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={feedbackDetailOpen}
        title={copy.feedbackDetailTitle}
        okText={copy.actionSave}
        cancelText={copy.actionClose}
        okButtonProps={{ disabled: !detailEditable }}
        confirmLoading={feedbackDetailLoading || feedbackDetailSaving}
        onOk={() => void onSaveFeedbackDetail()}
        onCancel={() => {
          setFeedbackDetailOpen(false);
          setFeedbackDetail(null);
        }}
        width={820}
        destroyOnHidden
      >
        {feedbackDetailLoading ? (
          <div className="page-fallback">
            <Spin />
          </div>
        ) : feedbackDetail ? (
          <div className="dashboard-feedback-detail">
            <Descriptions
              title={copy.ticketMeta}
              bordered
              size="small"
              column={1}
              items={[
                {
                  key: 'requester',
                  label: copy.feedbackRequester,
                  children: feedbackDetail.createdByDisplayName || feedbackDetail.createdBy,
                },
                {
                  key: 'createdAt',
                  label: copy.feedbackFieldCreatedAt,
                  children: formatDateTime(feedbackDetail.createdAt, locale),
                },
                {
                  key: 'updatedAt',
                  label: copy.feedbackFieldUpdatedAt,
                  children: formatDateTime(feedbackDetail.updatedAt, locale),
                },
              ]}
            />
            <Form form={feedbackDetailForm} layout="vertical">
              <div className="dashboard-form-grid">
                <Form.Item label={copy.feedbackFieldTitle} name="title" rules={[{ required: true, whitespace: true }]}>
                  <Input disabled={!detailEditable} />
                </Form.Item>
                <Form.Item label={copy.feedbackFieldContact} name="contact">
                  <Input disabled={!detailEditable} />
                </Form.Item>
                <Form.Item label={copy.feedbackFieldCategory} name="category" rules={[{ required: true }]}>
                  <Select options={feedbackCategoryOptions} disabled={!detailEditable} />
                </Form.Item>
                <Form.Item label={copy.feedbackFieldPriority} name="priority" rules={[{ required: true }]}>
                  <Select options={feedbackPriorityOptions} disabled={!detailEditable} />
                </Form.Item>
                {isAdmin ? (
                  <Form.Item label={copy.feedbackFieldStatus} name="status" rules={[{ required: true }]}>
                    <Select options={feedbackStatusOptions} />
                  </Form.Item>
                ) : null}
              </div>
              <Form.Item label={copy.feedbackFieldContent} name="content" rules={[{ required: true, whitespace: true }]}>
                <TextArea rows={6} disabled={!detailEditable} />
              </Form.Item>
              <Form.Item label={copy.feedbackFieldAdminReply} name="adminReply">
                <TextArea
                  rows={5}
                  disabled={!isAdmin}
                  placeholder={isAdmin ? undefined : copy.feedbackAdminReplyEmpty}
                />
              </Form.Item>
            </Form>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={portalEditorOpen}
        title={copy.portalEditTitle}
        okText={copy.actionSave}
        cancelText={copy.actionClose}
        confirmLoading={portalEditorSaving}
        onOk={() => void onSavePortalConfig()}
        onCancel={() => setPortalEditorOpen(false)}
        width={1080}
        destroyOnHidden
      >
        <Form form={portalForm} layout="vertical">
          <Collapse
            defaultActiveKey={['features', 'announcements']}
            items={[
              {
                key: 'features',
                label: copy.portalFeaturesSection,
                children: (
                  <Form.List name="featureSections">
                    {(fields, { add, remove }) => (
                      <div className="dashboard-editor-stack">
                        {fields.map((field, index) => (
                          <Card key={field.key} className="dashboard-editor-card" variant="borderless">
                            <div className="dashboard-editor-card-head">
                              <Title level={5}>{`${copy.portalFeatureCard} ${index + 1}`}</Title>
                              <Button danger onClick={() => remove(field.name)}>
                                {copy.actionRemove}
                              </Button>
                            </div>
                            <div className="dashboard-form-grid">
                              <Form.Item label="ID" name={[field.name, 'id']} rules={[{ required: true, whitespace: true }]}>
                                <Input />
                              </Form.Item>
                              <Form.Item label={copy.feedbackFieldIcon} name={[field.name, 'iconKey']} rules={[{ required: true }]}>
                                <Select options={iconOptions} placeholder={copy.portalIconPlaceholder} />
                              </Form.Item>
                              <Form.Item label={copy.portalTitleZh} name={[field.name, 'titleZh']} rules={[{ required: true, whitespace: true }]}>
                                <Input />
                              </Form.Item>
                              <Form.Item label={copy.portalTitleEn} name={[field.name, 'titleEn']} rules={[{ required: true, whitespace: true }]}>
                                <Input />
                              </Form.Item>
                              <Form.Item label={copy.portalButtonLabel} name={[field.name, 'buttonLabelZh']} rules={[{ required: true, whitespace: true }]}>
                                <Input />
                              </Form.Item>
                              <Form.Item label={`${copy.portalButtonLabel} EN`} name={[field.name, 'buttonLabelEn']} rules={[{ required: true, whitespace: true }]}>
                                <Input />
                              </Form.Item>
                              <Form.Item label={copy.feedbackFieldHref} name={[field.name, 'href']} rules={[{ required: true, whitespace: true }]}>
                                <Input placeholder={copy.portalRoutePlaceholder} />
                              </Form.Item>
                              <Form.Item label={copy.portalEnabled} name={[field.name, 'enabled']} valuePropName="checked">
                                <Switch />
                              </Form.Item>
                            </div>
                            <div className="dashboard-form-grid dashboard-form-grid-compact">
                              <Form.Item label={copy.portalSummaryZh} name={[field.name, 'summaryZh']} rules={[{ required: true, whitespace: true }]}>
                                <TextArea rows={4} />
                              </Form.Item>
                              <Form.Item label={copy.portalSummaryEn} name={[field.name, 'summaryEn']} rules={[{ required: true, whitespace: true }]}>
                                <TextArea rows={4} />
                              </Form.Item>
                            </div>
                          </Card>
                        ))}
                        <Button icon={<PlusOutlined />} onClick={() => add({ id: nextId('feature'), iconKey: 'datasets', enabled: true })}>
                          {copy.portalFeatureAdd}
                        </Button>
                      </div>
                    )}
                  </Form.List>
                ),
              },
              {
                key: 'announcements',
                label: copy.portalAnnouncementsSection,
                children: (
                  <Form.List name="announcements">
                    {(fields, { add, remove }) => (
                      <div className="dashboard-editor-stack">
                        {fields.map((field, index) => (
                          <Card key={field.key} className="dashboard-editor-card" variant="borderless">
                            <div className="dashboard-editor-card-head">
                              <Title level={5}>{`${copy.portalAnnouncementCard} ${index + 1}`}</Title>
                              <Button danger onClick={() => remove(field.name)}>
                                {copy.actionRemove}
                              </Button>
                            </div>
                            <div className="dashboard-form-grid">
                              <Form.Item label="ID" name={[field.name, 'id']} rules={[{ required: true, whitespace: true }]}>
                                <Input />
                              </Form.Item>
                              <Form.Item label={copy.feedbackFieldPublishedAt} name={[field.name, 'publishedAt']} rules={[{ required: true, whitespace: true }]}>
                                <Input placeholder="2026-04-05" />
                              </Form.Item>
                              <Form.Item label={copy.portalTitleZh} name={[field.name, 'titleZh']} rules={[{ required: true, whitespace: true }]}>
                                <Input />
                              </Form.Item>
                              <Form.Item label={copy.portalTitleEn} name={[field.name, 'titleEn']} rules={[{ required: true, whitespace: true }]}>
                                <Input />
                              </Form.Item>
                              <Form.Item label={copy.portalTagZh} name={[field.name, 'tagZh']}>
                                <Input />
                              </Form.Item>
                              <Form.Item label={copy.portalTagEn} name={[field.name, 'tagEn']}>
                                <Input />
                              </Form.Item>
                              <Form.Item label={copy.feedbackFieldPublished} name={[field.name, 'published']} valuePropName="checked">
                                <Switch />
                              </Form.Item>
                              <Form.Item label={copy.feedbackFieldPinned} name={[field.name, 'pinned']} valuePropName="checked">
                                <Switch />
                              </Form.Item>
                            </div>
                            <div className="dashboard-form-grid dashboard-form-grid-compact">
                              <Form.Item label={copy.portalSummaryZh} name={[field.name, 'summaryZh']} rules={[{ required: true, whitespace: true }]}>
                                <TextArea rows={4} />
                              </Form.Item>
                              <Form.Item label={copy.portalSummaryEn} name={[field.name, 'summaryEn']} rules={[{ required: true, whitespace: true }]}>
                                <TextArea rows={4} />
                              </Form.Item>
                              <Form.Item label={copy.portalContentZh} name={[field.name, 'contentZh']} rules={[{ required: true, whitespace: true }]}>
                                <TextArea rows={5} />
                              </Form.Item>
                              <Form.Item label={copy.portalContentEn} name={[field.name, 'contentEn']} rules={[{ required: true, whitespace: true }]}>
                                <TextArea rows={5} />
                              </Form.Item>
                            </div>
                          </Card>
                        ))}
                        <Button
                          icon={<PlusOutlined />}
                          onClick={() =>
                            add({
                              id: nextId('announcement'),
                              publishedAt: new Date().toISOString().slice(0, 10),
                              published: true,
                              pinned: false,
                            })
                          }
                        >
                          {copy.portalAnnouncementAdd}
                        </Button>
                      </div>
                    )}
                  </Form.List>
                ),
              },
            ]}
          />
        </Form>
      </Modal>
    </div>
  );
}
