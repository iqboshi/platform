import type {
  DashboardAnnouncementItem,
  FeedbackTicketStatus,
  FeedbackTicketSummary,
} from '@platform/types';
import type { PlatformDataSnapshot } from '@/lib/api';

import {
  App,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { isApiError } from '@/auth/errors';
import { useAuth } from '@/auth/useAuth';
import { LayeredPanelCard, LayeredPanelCardGroup } from '@/components/LayeredPanelCard';
import { useI18n } from '@/i18n/useI18n';
import {
  createFeedbackTicket,
  getFeedbackTicket,
  updateFeedbackTicket,
} from '@/lib/api';
import { workflowRunStatusKey } from '@/lib/i18n-helpers';
import { buildDashboardModuleCards } from '@/lib/workspace-modules';

const { Paragraph, Text, Title } = Typography;
const { TextArea } = Input;

type DashboardLocale = 'zh-CN' | 'en-US';

type ActionQueueItem = {
  key: string;
  priority: 'critical' | 'attention' | 'normal';
  source: string;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
};

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

function formatDate(value: string | undefined, locale: DashboardLocale): string {
  if (!value) {
    return '-';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString(locale);
}

function announcementText(
  announcement: DashboardAnnouncementItem,
  locale: DashboardLocale,
  field: 'title' | 'summary' | 'content' | 'tag',
): string {
  if (locale === 'zh-CN') {
    switch (field) {
      case 'title':
        return announcement.titleZh;
      case 'summary':
        return announcement.summaryZh;
      case 'content':
        return announcement.contentZh;
      case 'tag':
        return announcement.tagZh ?? '';
      default:
        return '';
    }
  }

  switch (field) {
    case 'title':
      return announcement.titleEn;
    case 'summary':
      return announcement.summaryEn;
    case 'content':
      return announcement.contentEn;
    case 'tag':
      return announcement.tagEn ?? '';
    default:
      return '';
  }
}

const DASHBOARD_COPY = {
  'zh-CN': {
    heroKicker: '平台总览',
    heroTitle: '用一个首页串起数据、工作流、模型与团队协作。',
    heroCopy: '这里作为团队进入平台后的总览页，先看当前态势，再继续进入各个功能与协作处理。',
    workspaceReady: '工作空间状态',
    workspaceReadyCopy:
      '首页使用实时快照与共享模块注册表构建，但仍保持总览页应有的整体视角。',
    quickDatasets: '公开数据集',
    quickDatasetsCopy: '查看平台对外展示的数据资产、简介和可下载版本。',
    quickWorkflows: '工作流中心',
    quickWorkflowsCopy: '搭建、测试并运行你的数据处理与模型链路。',
    quickAssets: '个人资产',
    quickAssetsCopy: '统一管理自己的数据集、结果、工作流和凭证资产。',
    quickModels: '模型中心',
    quickModelsCopy: '查看平台内置模型、训练产物和外部 API 模型配置。',
    features: '核心模块',
    featuresCopy: '这里保留平台主功能区的总览入口，并展示各模块可直接衔接的下游去向。',
    actionQueueTitle: '行动队列',
    actionQueueCopy:
      '把运行异常、进行中的流程、待处理工单和首页维护提醒放在同一个列表里优先处理。',
    actionQueueEmpty: '当前没有待跟进事项。',
    actionQueueActionWorkflow: '前往工作流',
    actionQueueActionTicket: '查看工单',
    actionQueueActionPortal: '编辑公告',
    actionQueueSourceWorkflow: '工作流',
    actionQueueSourceFeedback: '反馈',
    actionQueueSourcePortal: '首页维护',
    actionQueuePriorityCritical: '优先处理',
    actionQueuePriorityActive: '进行中',
    actionQueuePriorityNormal: '提醒',
    announcementGapTitle: '首页还没有已发布公告',
    announcementGapDescription: '建议补充至少一条公告，用于说明最近更新、已上线能力或运营提醒。',
    modulesTitle: '模块入口',
    modulesCopy:
      '模块卡片统一来自共享注册表，后续新增功能后这里只需要补模块定义，不再单独维护首页入口。',
    moduleFlowTitle: '可直接衔接',
    moduleSectionWorkspace: '工作区',
    moduleSectionPersonal: '个人',
    moduleSectionAdmin: '管理',
    noFeatures: '当前没有可显示的模块入口。',
    heroPinnedAnnouncementTitle: '置顶公告',
    heroPinnedAnnouncementEmpty: '当前还没有置顶公告。',
    expandDetails: '展开详情',
    collapseDetails: '收起详情',
    announcements: '更新公告',
    announcementsCopy: '查看近期的重要更新、已上线能力和使用说明。',
    notificationsTitle: '站内消息',
    notificationsUnread: '{{count}} 条未读消息',
    notificationsReady: '查看公告通知',
    noAnnouncements: '当前还没有已发布公告。',
    moreAnnouncements: '另有 {{count}} 条已发布公告',
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
    runsTitle: '最近运行记录',
    noRuns: '当前还没有工作流运行记录。',
    runsSubmittedBy: '提交人',
    runsStartedAt: '开始时间',
    statPublicDatasets: '公开数据集',
    statPublicDatasetsDetail: '面向团队展示的数据资产数量。',
    statWorkflowRuns: '工作流运行',
    statWorkflowRunsDetail: '近期工作流执行记录与结果产物。',
    statModelVersions: '模型版本',
    statModelVersionsDetail: '已接入的平台模型与训练权重资产。',
    statFeedback: '活跃工单',
    statFeedbackDetail: '当前仍在跟进中的问题、需求与体验反馈。',
    statModules: '可见模块',
    statModulesDetail: '当前角色在平台中可直接进入的功能入口数量。',
    portalEditTitle: '管理首页公告',
    portalEditSuccess: '首页公告已更新。',
    portalAnnouncementsSection: '公告',
    portalAnnouncementAdd: '新增公告',
    portalAnnouncementCard: '公告',
    portalTitleZh: '中文标题',
    portalTitleEn: '英文标题',
    portalSummaryZh: '中文摘要',
    portalSummaryEn: '英文摘要',
    portalContentZh: '中文正文',
    portalContentEn: '英文正文',
    portalTagZh: '中文标签',
    portalTagEn: '英文标签',
    actionSave: '保存',
    actionClose: '关闭',
    actionRemove: '移除',
    authMissing: '登录状态已失效，请重新登录。',
    ticketMeta: '工单信息',
  },
  'en-US': {
    heroKicker: 'Platform Overview',
    heroTitle: 'Bring data, workflows, models, and collaboration into one overview.',
    heroCopy:
      'Use this as the team landing surface: scan live signals first, then continue into the rest of the platform and collaboration work.',
    workspaceReady: 'Workspace status',
    workspaceReadyCopy:
      'The page is driven by live snapshot data and the shared module registry, while still preserving an actual overview surface.',
    quickDatasets: 'Public datasets',
    quickDatasetsCopy: 'Review published assets, curated descriptions, and downloadable versions.',
    quickWorkflows: 'Workflow center',
    quickWorkflowsCopy: 'Design, test, and run your data processing and model pipelines.',
    quickAssets: 'My assets',
    quickAssetsCopy: 'Manage your datasets, outputs, workflows, and credentials in one place.',
    quickModels: 'Model center',
    quickModelsCopy: 'Inspect packaged models, trained weights, and external API model configs.',
    features: 'Core modules',
    featuresCopy: 'Keep the main module overview here and expose what each module can hand off to next.',
    actionQueueTitle: 'Action queue',
    actionQueueCopy:
      'Put run failures, in-flight processes, open tickets, and homepage maintenance reminders into one prioritized list.',
    actionQueueEmpty: 'There is nothing that currently needs follow-up.',
    actionQueueActionWorkflow: 'Open workflows',
    actionQueueActionTicket: 'Open ticket',
    actionQueueActionPortal: 'Edit announcements',
    actionQueueSourceWorkflow: 'Workflow',
    actionQueueSourceFeedback: 'Feedback',
    actionQueueSourcePortal: 'Homepage',
    actionQueuePriorityCritical: 'Needs priority',
    actionQueuePriorityActive: 'In progress',
    actionQueuePriorityNormal: 'Reminder',
    announcementGapTitle: 'There is no published announcement on the overview',
    announcementGapDescription:
      'Publish at least one announcement to reflect recent changes, operational notes, or newly released capabilities.',
    modulesTitle: 'Module portal',
    modulesCopy:
      'These cards come from the shared registry. New capabilities should only need a module definition instead of separate overview maintenance.',
    moduleFlowTitle: 'Can hand off to',
    moduleSectionWorkspace: 'Workspace',
    moduleSectionPersonal: 'Personal',
    moduleSectionAdmin: 'Admin',
    noFeatures: 'No visible modules are available right now.',
    heroPinnedAnnouncementTitle: 'Pinned announcement',
    heroPinnedAnnouncementEmpty: 'There is no pinned announcement right now.',
    expandDetails: 'Show details',
    collapseDetails: 'Hide details',
    announcements: 'Announcements',
    announcementsCopy: 'Review recent platform updates, released capabilities, and usage notes.',
    notificationsTitle: 'Inbox',
    notificationsUnread: '{{count}} unread messages',
    notificationsReady: 'Open announcement notices',
    noAnnouncements: 'No published announcements are available right now.',
    moreAnnouncements: '{{count}} more published announcements',
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
    runsTitle: 'Recent workflow runs',
    noRuns: 'No workflow runs are available yet.',
    runsSubmittedBy: 'Submitted by',
    runsStartedAt: 'Started at',
    statPublicDatasets: 'Public datasets',
    statPublicDatasetsDetail: 'Published assets visible to the team.',
    statWorkflowRuns: 'Workflow runs',
    statWorkflowRunsDetail: 'Recent executions and produced result artifacts.',
    statModelVersions: 'Model versions',
    statModelVersionsDetail: 'Packaged models and trained weight assets available on the platform.',
    statFeedback: 'Active tickets',
    statFeedbackDetail: 'Open issues, requests, and UX feedback still under follow-up.',
    statModules: 'Visible modules',
    statModulesDetail: 'Entry points currently available to this role.',
    portalEditTitle: 'Manage overview announcements',
    portalEditSuccess: 'Overview announcements updated.',
    portalAnnouncementsSection: 'Announcements',
    portalAnnouncementAdd: 'Add announcement',
    portalAnnouncementCard: 'Announcement',
    portalTitleZh: 'Chinese title',
    portalTitleEn: 'English title',
    portalSummaryZh: 'Chinese summary',
    portalSummaryEn: 'English summary',
    portalContentZh: 'Chinese content',
    portalContentEn: 'English content',
    portalTagZh: 'Chinese tag',
    portalTagEn: 'English tag',
    actionSave: 'Save',
    actionClose: 'Close',
    actionRemove: 'Remove',
    authMissing: 'Authentication is missing. Please sign in again.',
    ticketMeta: 'Ticket meta',
  },
} as const;

type DashboardCopy = (typeof DASHBOARD_COPY)[keyof typeof DASHBOARD_COPY];

function feedbackCategoryLabel(category: string, copy: DashboardCopy): string {
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

function feedbackPriorityLabel(priority: string, copy: DashboardCopy): string {
  switch (priority) {
    case 'low':
      return copy.feedbackPriorityLow;
    case 'high':
      return copy.feedbackPriorityHigh;
    default:
      return copy.feedbackPriorityMedium;
  }
}

function feedbackPriorityColor(priority: string): string {
  switch (priority) {
    case 'low':
      return 'default';
    case 'high':
      return 'red';
    default:
      return 'gold';
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
  const [feedbackCreateOpen, setFeedbackCreateOpen] = useState(false);
  const [feedbackCreateSaving, setFeedbackCreateSaving] = useState(false);
  const [feedbackDetailOpen, setFeedbackDetailOpen] = useState(false);
  const [feedbackDetailLoading, setFeedbackDetailLoading] = useState(false);
  const [feedbackDetailSaving, setFeedbackDetailSaving] = useState(false);
  const [feedbackDetail, setFeedbackDetail] = useState<FeedbackTicketSummary | null>(null);

  const copy = DASHBOARD_COPY[locale];
  const canConfigurePortal = hasPermission('system.configure');
  const isAdmin = canConfigurePortal;

  const recentRuns = useMemo(
    () =>
      [...snapshot.workflowRuns]
        .sort(
          (left, right) =>
            parseDateValue(right.finishedAt ?? right.startedAt) -
            parseDateValue(left.finishedAt ?? left.startedAt),
        )
        .slice(0, 4),
    [snapshot.workflowRuns],
  );
  const publicDatasetCount = useMemo(
    () => snapshot.datasets.filter((item) => item.visibility === 'public').length,
    [snapshot.datasets],
  );
  const publishedAnnouncements = useMemo(
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
  const pinnedAnnouncement = useMemo(
    () => publishedAnnouncements.find((item) => item.pinned) ?? publishedAnnouncements[0] ?? null,
    [publishedAnnouncements],
  );
  const activeTicketCount = isAdmin
    ? snapshot.feedbackSummary.adminOpenCount + snapshot.feedbackSummary.adminInProgressCount
    : snapshot.feedbackSummary.myActiveCount;
  const moduleCards = useMemo(
    () => buildDashboardModuleCards(snapshot, locale, hasPermission),
    [hasPermission, locale, snapshot],
  );
  const moduleSections = useMemo(
    () =>
      [
        {
          key: 'workspace',
          title: copy.moduleSectionWorkspace,
          description:
            locale === 'zh-CN'
              ? '围绕数据、工作流、模型和地图这些核心生产入口。'
              : 'Core production surfaces for data, workflows, models, and maps.',
          items: moduleCards.filter((item) => item.section === 'workspace'),
        },
        {
          key: 'personal',
          title: copy.moduleSectionPersonal,
          description:
            locale === 'zh-CN'
              ? '账号、资产和个人集成能力在这里继续衔接。'
              : 'Account, asset, and personal integration surfaces live here.',
          items: moduleCards.filter((item) => item.section === 'personal'),
        },
        {
          key: 'admin',
          title: copy.moduleSectionAdmin,
          description:
            locale === 'zh-CN'
              ? '治理、审批和工作空间配置能力按权限显示。'
              : 'Governance, approvals, and workspace settings appear when permitted.',
          items: moduleCards.filter((item) => item.section === 'admin'),
        },
      ].filter((section) => section.items.length > 0),
    [copy.moduleSectionAdmin, copy.moduleSectionPersonal, copy.moduleSectionWorkspace, locale, moduleCards],
  );
  const modulePortalCards = useMemo(
    () =>
      moduleSections.flatMap((section) =>
        section.items.map((item) => ({
          ...item,
          sectionKey: section.key,
          sectionLabel: section.title,
        })),
      ),
    [moduleSections],
  );
  const pulseCards = useMemo(
    () => [
      {
        key: 'datasets',
        value: String(publicDatasetCount),
        label: copy.statPublicDatasets,
        detail: copy.statPublicDatasetsDetail,
      },
      {
        key: 'runs',
        value: String(snapshot.workflowRuns.length),
        label: copy.statWorkflowRuns,
        detail: copy.statWorkflowRunsDetail,
      },
      {
        key: 'feedback',
        value: String(activeTicketCount),
        label: copy.statFeedback,
        detail: copy.statFeedbackDetail,
      },
      {
        key: 'modules',
        value: String(modulePortalCards.length),
        label: copy.statModules,
        detail: copy.statModulesDetail,
      },
    ],
    [
      activeTicketCount,
      copy.statFeedback,
      copy.statFeedbackDetail,
      copy.statModules,
      copy.statModulesDetail,
      copy.statPublicDatasets,
      copy.statPublicDatasetsDetail,
      copy.statWorkflowRuns,
      copy.statWorkflowRunsDetail,
      modulePortalCards.length,
      publicDatasetCount,
      snapshot.workflowRuns.length,
    ],
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
        render: (value: string) => (
          <Tag color={feedbackPriorityColor(value)}>{feedbackPriorityLabel(value, copy)}</Tag>
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

  const openFeedbackDetail = useCallback(
    async (ticketId: string) => {
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
    },
    [copy.authMissing, message, t, token],
  );

  const actionQueueItems = useMemo<ActionQueueItem[]>(() => {
    const items: ActionQueueItem[] = [];
    const failedRuns = recentRuns.filter((item) => item.status === 'failed').slice(0, 2);
    const activeRun = recentRuns.find((item) => item.status === 'running' || item.status === 'queued');
    const activeFeedback = snapshot.feedbackTickets.find(
      (item) => item.status === 'open' || item.status === 'in_progress',
    );

    failedRuns.forEach((run) => {
      items.push({
        key: `run-failed-${run.id}`,
        priority: 'critical',
        source: copy.actionQueueSourceWorkflow,
        title:
          locale === 'zh-CN'
            ? `运行失败：${run.workflowName || run.id.slice(0, 12)}`
            : `Run failed: ${run.workflowName || run.id.slice(0, 12)}`,
        description:
          locale === 'zh-CN'
            ? '这个工作流运行需要回到工作流页检查输入、节点配置或运行日志。'
            : 'Open workflows to inspect inputs, node configuration, or run logs.',
        actionLabel: copy.actionQueueActionWorkflow,
        onAction: () => navigate('/workflows'),
      });
    });

    if (activeRun) {
      items.push({
        key: `run-active-${activeRun.id}`,
        priority: 'attention',
        source: copy.actionQueueSourceWorkflow,
        title:
          locale === 'zh-CN'
            ? `进行中的运行：${activeRun.workflowName || activeRun.id.slice(0, 12)}`
            : `Active run: ${activeRun.workflowName || activeRun.id.slice(0, 12)}`,
        description:
          locale === 'zh-CN'
            ? '当前仍有工作流在排队或执行中，建议继续关注结果产出。'
            : 'A workflow is still queued or running. Keep an eye on the output state.',
        actionLabel: copy.actionQueueActionWorkflow,
        onAction: () => navigate('/workflows'),
      });
    }

    if (activeFeedback) {
      items.push({
        key: `feedback-${activeFeedback.id}`,
        priority: activeFeedback.priority === 'high' ? 'critical' : 'attention',
        source: copy.actionQueueSourceFeedback,
        title: activeFeedback.title,
        description:
          locale === 'zh-CN'
            ? '这里有一条仍在跟进中的反馈或工单，可以直接打开详情继续处理。'
            : 'A feedback ticket still needs follow-up. Open it directly from the overview.',
        actionLabel: copy.actionQueueActionTicket,
        onAction: () => void openFeedbackDetail(activeFeedback.id),
      });
    }

    if (canConfigurePortal && publishedAnnouncements.length === 0) {
      items.push({
        key: 'announcement-gap',
        priority: 'normal',
        source: copy.actionQueueSourcePortal,
        title: copy.announcementGapTitle,
        description: copy.announcementGapDescription,
        actionLabel: copy.actionQueueActionPortal,
        onAction: () => navigate('/admin/workspace-settings'),
      });
    }

    return items.slice(0, 4);
  }, [
    canConfigurePortal,
    copy.actionQueueActionPortal,
    copy.actionQueueActionTicket,
    copy.actionQueueActionWorkflow,
    copy.actionQueueSourceFeedback,
    copy.actionQueueSourcePortal,
    copy.actionQueueSourceWorkflow,
    copy.announcementGapDescription,
    copy.announcementGapTitle,
    locale,
    navigate,
    openFeedbackDetail,
    publishedAnnouncements.length,
    recentRuns,
    snapshot.feedbackTickets,
  ]);

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

  const detailEditable =
    feedbackDetail !== null &&
    (isAdmin ||
      (feedbackDetail.status !== 'resolved' && feedbackDetail.status !== 'closed'));

  const currentUserLabel =
    currentUser?.displayName || currentUser?.email || (locale === 'zh-CN' ? '当前用户' : 'Current user');
  const actionQueueSummaryItems =
    actionQueueItems.length > 2 ? actionQueueItems.slice(0, 2) : actionQueueItems;
  const actionQueueDetailItems = actionQueueItems.slice(2);
  const recentRunSummaryItems = recentRuns.length > 2 ? recentRuns.slice(0, 2) : recentRuns;
  const recentRunDetailItems = recentRuns.slice(2);
  const pinnedAnnouncementTitle = pinnedAnnouncement
    ? announcementText(pinnedAnnouncement, locale, 'title')
    : '';
  const pinnedAnnouncementSummary = pinnedAnnouncement
    ? announcementText(pinnedAnnouncement, locale, 'summary') || announcementText(pinnedAnnouncement, locale, 'content')
    : '';
  const pinnedAnnouncementTag = pinnedAnnouncement ? announcementText(pinnedAnnouncement, locale, 'tag') : '';

  const renderActionQueueList = (items: ActionQueueItem[]) =>
    items.length > 0 ? (
      <div className="dashboard-action-list">
        {items.map((item) => (
          <div
            key={item.key}
            className={`dashboard-action-item dashboard-action-item--${item.priority}`}
          >
            <div className="dashboard-action-item-head">
              <div>
                <Title level={5} className="dashboard-action-title">
                  {item.title}
                </Title>
                <Paragraph className="dashboard-action-copy">{item.description}</Paragraph>
              </div>
              <Space wrap>
                <Tag>{item.source}</Tag>
                <Tag
                  color={
                    item.priority === 'critical'
                      ? 'red'
                      : item.priority === 'attention'
                        ? 'gold'
                        : 'default'
                  }
                >
                  {item.priority === 'critical'
                    ? copy.actionQueuePriorityCritical
                    : item.priority === 'attention'
                      ? copy.actionQueuePriorityActive
                      : copy.actionQueuePriorityNormal}
                </Tag>
              </Space>
            </div>
            <div className="dashboard-action-foot">
              <div className="dashboard-action-meta">
                {locale === 'zh-CN'
                  ? '从总览直接处理待跟进事项。'
                  : 'Handle the next important item directly from the overview.'}
              </div>
              <Button type="link" onClick={item.onAction}>
                {item.actionLabel}
              </Button>
            </div>
          </div>
        ))}
      </div>
    ) : (
      <Empty description={copy.actionQueueEmpty} />
    );

  const renderRunList = (items: typeof recentRuns) =>
    items.length > 0 ? (
      <div className="dashboard-run-list">
        {items.map((run) => (
          <div key={run.id} className="dashboard-run-item">
            <div className="dashboard-run-item-head">
              <Title level={5} className="dashboard-run-title">
                {run.workflowName || run.id.slice(0, 12)}
              </Title>
              <Tag>{t(workflowRunStatusKey(run.status))}</Tag>
            </div>
            <div className="dashboard-run-meta">
              <span>{copy.runsSubmittedBy}: {run.submittedBy}</span>
              <span>{copy.runsStartedAt}: {formatDateTime(run.startedAt ?? run.finishedAt, locale)}</span>
            </div>
            {run.resultDatasetVersionId ? (
              <div className="dashboard-action-meta">
                {locale === 'zh-CN'
                  ? `结果数据集：${run.resultDatasetVersionId}`
                  : `Result dataset: ${run.resultDatasetVersionId}`}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    ) : (
      <Empty description={copy.noRuns} />
    );

  return (
    <div className="page-stack dashboard-page">
      <Card className="panel-card dashboard-hero-panel" variant="borderless">
        <div className="dashboard-hero-layout">
          <div className="dashboard-hero-main">
            <div className="hero-kicker">{copy.heroKicker}</div>
            <Title level={1} className="hero-title">
              {copy.heroTitle}
            </Title>
            <Paragraph className="hero-copy">{copy.heroCopy}</Paragraph>
            <div className="dashboard-pulse-grid">
              {pulseCards.map((item) => (
                <div key={item.key} className="dashboard-pulse-card">
                  <div className="dashboard-pulse-value">{item.value}</div>
                  <div className="dashboard-pulse-label">{item.label}</div>
                  <div className="dashboard-pulse-detail">{item.detail}</div>
                </div>
              ))}
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
                {currentUser ? <Tag color="geekblue">{currentUserLabel}</Tag> : null}
              </Space>
            </div>
            <div className="dashboard-hero-note dashboard-hero-announcement-card">
              <div className="panel-kicker">{copy.heroPinnedAnnouncementTitle}</div>
              {pinnedAnnouncement ? (
                <div className="dashboard-hero-announcement-body">
                  <div className="dashboard-hero-announcement-head">
                    <Title level={4} className="dashboard-hero-announcement-title">
                      {pinnedAnnouncementTitle}
                    </Title>
                    <Space wrap>
                      <Tag color="gold">{copy.pinned}</Tag>
                      {pinnedAnnouncementTag ? <Tag>{pinnedAnnouncementTag}</Tag> : null}
                    </Space>
                  </div>
                  <Paragraph className="dashboard-hero-announcement-copy">{pinnedAnnouncementSummary}</Paragraph>
                  <div className="dashboard-hero-announcement-meta">
                    {copy.published}: {formatDate(pinnedAnnouncement.publishedAt, locale)}
                  </div>
                </div>
              ) : (
                <Text type="secondary">{copy.heroPinnedAnnouncementEmpty}</Text>
              )}
            </div>
          </div>
        </div>
      </Card>

      <LayeredPanelCardGroup>
        <div className="dashboard-top-grid">
          <LayeredPanelCard
            kicker={copy.actionQueueTitle}
            title={copy.actionQueueTitle}
            className="dashboard-panel-card dashboard-top-layer-card dashboard-queue-panel"
            expandLabel={copy.expandDetails}
            collapseLabel={copy.collapseDetails}
            summary={
              <>
                <Paragraph className="dashboard-section-copy">{copy.actionQueueCopy}</Paragraph>
                {renderActionQueueList(actionQueueSummaryItems)}
              </>
            }
          >
            {actionQueueDetailItems.length > 0 ? renderActionQueueList(actionQueueDetailItems) : null}
          </LayeredPanelCard>
          <LayeredPanelCard
            kicker={copy.runsTitle}
            title={copy.runsTitle}
            className="dashboard-panel-card dashboard-top-layer-card dashboard-runs-panel"
            extra={
              <Button type="link" onClick={() => navigate('/workflows')}>
                {copy.actionQueueActionWorkflow}
              </Button>
            }
            expandLabel={copy.expandDetails}
            collapseLabel={copy.collapseDetails}
            summary={renderRunList(recentRunSummaryItems)}
          >
            {recentRunDetailItems.length > 0 ? renderRunList(recentRunDetailItems) : null}
          </LayeredPanelCard>
        </div>
      </LayeredPanelCardGroup>

      <Card className="panel-card dashboard-panel-card dashboard-modules-panel" variant="borderless">
        <div className="dashboard-section-head">
          <div>
            <div className="panel-kicker">{copy.modulesTitle}</div>
            <Title level={3} className="section-title">
              {copy.modulesTitle}
            </Title>
            <Paragraph className="dashboard-section-copy">{copy.modulesCopy}</Paragraph>
          </div>
        </div>
        {modulePortalCards.length ? (
          <LayeredPanelCardGroup>
            <div className="dashboard-module-grid dashboard-module-portal-grid">
              {modulePortalCards.map((item) => (
                <LayeredPanelCard
                  key={item.id}
                  className={`dashboard-module-card dashboard-module-card--${item.sectionKey}`}
                  title={item.title}
                  summary={
                    <div className="dashboard-module-summary">
                      <div className="dashboard-module-summary-head">
                        <div className="dashboard-module-icon">{item.icon}</div>
                        <div className="dashboard-module-metric">
                          <div className="dashboard-module-metric-value">{item.metricValue}</div>
                          <div className="dashboard-module-metric-label">{item.metricLabel}</div>
                        </div>
                      </div>
                      <Space wrap>
                        <Tag>{item.sectionLabel}</Tag>
                      </Space>
                      <div className="dashboard-module-copy">{item.summary}</div>
                      <div className="dashboard-module-activity">{item.activity}</div>
                    </div>
                  }
                  extra={
                    <Button type="link" onClick={() => navigate(item.route)}>
                      {item.actionLabel}
                    </Button>
                  }
                  expandLabel={locale === 'zh-CN' ? '查看衔接' : 'Show handoff'}
                  collapseLabel={locale === 'zh-CN' ? '收起衔接' : 'Hide handoff'}
                >
                  <div className="dashboard-module-flow-title">{copy.moduleFlowTitle}</div>
                  <div className="dashboard-module-handoff-list">
                    {item.handoff.map((entry, index) => (
                      <div key={`${item.id}-handoff-${index}`} className="dashboard-module-handoff-item">
                        {entry}
                      </div>
                    ))}
                  </div>
                </LayeredPanelCard>
              ))}
            </div>
          </LayeredPanelCardGroup>
        ) : (
          <Empty description={copy.noFeatures} />
        )}
      </Card>

      <Card className="panel-card dashboard-panel-card dashboard-feedback-panel" variant="borderless">
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
              {isAdmin ? snapshot.feedbackSummary.adminOpenCount : snapshot.feedbackSummary.myOpenCount}
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
            pagination={{ pageSize: 5, hideOnSinglePage: true }}
            size="small"
            onRow={(record) => ({
              onClick: () => void openFeedbackDetail(record.id),
              className: 'dashboard-clickable-row',
            })}
          />
        ) : (
          <Empty description={copy.feedbackEmpty} />
        )}
      </Card>

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

    </div>
  );
}
