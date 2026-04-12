import type {
  DashboardAnnouncementItem,
  FeedbackTicketStatus,
  FeedbackTicketSummary,
  PendingUserSummary,
  RoleUpgradeRequestSummary,
} from '@platform/types';
import type { PlatformDataSnapshot } from '@/lib/api';

import {
  BellOutlined,
  CheckCircleOutlined,
  CommentOutlined,
  MessageOutlined,
  SafetyCertificateOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { Badge, Button, Descriptions, Drawer, Empty, Modal, Space, Spin, Tag, Typography } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { useI18n } from '@/i18n/useI18n';
import {
  listMyRoleUpgradeRequests,
  listPendingUsers,
  listRoleUpgradeRequests,
} from '@/lib/api';
import { roleKey } from '@/lib/i18n-helpers';

const { Paragraph, Text } = Typography;

const GLOBAL_INBOX_READ_STORAGE_PREFIX = 'platform.globalInbox.read.v1';

type NotificationLocale = 'zh-CN' | 'en-US';

type InboxItem = {
  id: string;
  readKey: string;
  title: string;
  summary: string;
  time?: string;
  priority: number;
  tone: 'announcement' | 'feedback' | 'approval' | 'success';
  icon: React.ReactNode;
  tags: Array<{ label: string; color?: string }>;
  actionLabel: string;
  onOpen: () => void;
};

const INBOX_COPY = {
  'zh-CN': {
    openInbox: '打开站内消息',
    title: '站内消息',
    unread: '{{count}} 条未读消息',
    noMessages: '当前没有新的站内消息。',
    loading: '正在整理站内消息…',
    announcement: '公告',
    feedbackReply: '反馈回复',
    approval: '审批',
    approvalReview: '去处理',
    openAccount: '查看详情',
    viewDetails: '查看详情',
    pinned: '置顶',
    published: '已发布',
    pendingApprovalTitle: '有新账号等待审批',
    pendingApprovalSummary: '{{name}} 提交了账号申请，等待管理员处理。',
    pendingRoleRequestTitle: '有角色升级申请待处理',
    pendingRoleRequestSummary: '{{name}} 申请升级为 {{role}}。',
    roleRequestApprovedTitle: '你的角色升级申请已通过',
    roleRequestRejectedTitle: '你的角色升级申请被拒绝',
    roleRequestResultSummary: '申请目标：{{role}}',
    feedbackReplyTitle: '你的反馈收到回复',
    feedbackContent: '反馈内容',
    feedbackReplyContent: '管理员回复',
    feedbackStatus: '状态',
    feedbackCreatedAt: '创建时间',
    feedbackUpdatedAt: '更新时间',
    close: '关闭',
  },
  'en-US': {
    openInbox: 'Open inbox',
    title: 'Inbox',
    unread: '{{count}} unread messages',
    noMessages: 'There are no new inbox messages.',
    loading: 'Loading inbox messages…',
    announcement: 'Announcement',
    feedbackReply: 'Feedback reply',
    approval: 'Approval',
    approvalReview: 'Review',
    openAccount: 'Open account',
    viewDetails: 'View details',
    pinned: 'Pinned',
    published: 'Published',
    pendingApprovalTitle: 'A new account is waiting for approval',
    pendingApprovalSummary: '{{name}} submitted an account request and is waiting for review.',
    pendingRoleRequestTitle: 'A role upgrade request needs review',
    pendingRoleRequestSummary: '{{name}} requested the {{role}} role.',
    roleRequestApprovedTitle: 'Your role upgrade request was approved',
    roleRequestRejectedTitle: 'Your role upgrade request was rejected',
    roleRequestResultSummary: 'Requested role: {{role}}',
    feedbackReplyTitle: 'Your feedback received a reply',
    feedbackContent: 'Feedback',
    feedbackReplyContent: 'Administrator reply',
    feedbackStatus: 'Status',
    feedbackCreatedAt: 'Created at',
    feedbackUpdatedAt: 'Updated at',
    close: 'Close',
  },
} as const;

function pickLocalizedValue(
  locale: NotificationLocale,
  valueZh: string | undefined,
  valueEn: string | undefined,
): string {
  return locale === 'zh-CN' ? valueZh ?? valueEn ?? '' : valueEn ?? valueZh ?? '';
}

function parseDateValue(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function formatDateTime(value: string | undefined, locale: NotificationLocale): string {
  if (!value) {
    return '-';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString(locale);
}

function feedbackStatusLabel(status: FeedbackTicketStatus, locale: NotificationLocale): string {
  if (locale === 'zh-CN') {
    switch (status) {
      case 'in_progress':
        return '处理中';
      case 'resolved':
        return '已解决';
      case 'closed':
        return '已关闭';
      default:
        return '待处理';
    }
  }

  switch (status) {
    case 'in_progress':
      return 'In progress';
    case 'resolved':
      return 'Resolved';
    case 'closed':
      return 'Closed';
    default:
      return 'Open';
  }
}

function inboxReadKey(prefix: string, ...parts: Array<string | undefined>): string {
  return [prefix, ...parts.map((part) => part ?? '')].join(':');
}

export function GlobalNotificationCenter({
  snapshot,
  onRefresh,
}: {
  snapshot: PlatformDataSnapshot;
  onRefresh: () => Promise<void>;
}) {
  const { currentUser, hasPermission, token } = useAuth();
  const { locale, t } = useI18n();
  const navigate = useNavigate();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [announcementOpen, setAnnouncementOpen] = useState<DashboardAnnouncementItem | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState<FeedbackTicketSummary | null>(null);
  const [supplementalLoading, setSupplementalLoading] = useState(false);
  const [pendingUsers, setPendingUsers] = useState<PendingUserSummary[]>([]);
  const [roleRequests, setRoleRequests] = useState<RoleUpgradeRequestSummary[]>([]);
  const [readKeys, setReadKeys] = useState<string[]>([]);

  const copy = INBOX_COPY[locale];
  const canApproveUsers = hasPermission('user.approve');
  const readStorageKey = currentUser?.id
    ? `${GLOBAL_INBOX_READ_STORAGE_PREFIX}.${currentUser.id}`
    : null;

  useEffect(() => {
    if (!readStorageKey || typeof window === 'undefined') {
      setReadKeys([]);
      return;
    }
    try {
      const rawValue = window.localStorage.getItem(readStorageKey);
      if (!rawValue) {
        setReadKeys([]);
        return;
      }
      const parsedValue = JSON.parse(rawValue);
      if (Array.isArray(parsedValue)) {
        setReadKeys(parsedValue.filter((item): item is string => typeof item === 'string'));
        return;
      }
      setReadKeys([]);
    } catch {
      window.localStorage.removeItem(readStorageKey);
      setReadKeys([]);
    }
  }, [readStorageKey]);

  useEffect(() => {
    if (!readStorageKey || typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(readStorageKey, JSON.stringify(readKeys));
  }, [readKeys, readStorageKey]);

  const refreshSupplemental = useCallback(async () => {
    if (!token) {
      setPendingUsers([]);
      setRoleRequests([]);
      return;
    }

    setSupplementalLoading(true);
    try {
      if (canApproveUsers) {
        const [users, requests] = await Promise.all([
          listPendingUsers(token),
          listRoleUpgradeRequests(token),
        ]);
        setPendingUsers(users);
        setRoleRequests(requests);
        return;
      }

      if (currentUser?.role === 'MEMBER') {
        const requests = await listMyRoleUpgradeRequests(token);
        setPendingUsers([]);
        setRoleRequests(requests);
        return;
      }

      setPendingUsers([]);
      setRoleRequests([]);
    } catch {
      setPendingUsers([]);
      setRoleRequests([]);
    } finally {
      setSupplementalLoading(false);
    }
  }, [canApproveUsers, currentUser?.role, token]);

  useEffect(() => {
    void refreshSupplemental();

    if (typeof window === 'undefined') {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshSupplemental();
    }, 60000);

    return () => window.clearInterval(timer);
  }, [refreshSupplemental]);

  const announcements = useMemo(
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

  const feedbackReplies = useMemo(
    () =>
      [...snapshot.feedbackTickets]
        .filter(
          (item) => item.createdBy === currentUser?.id && Boolean(item.adminReply && item.adminReply.trim()),
        )
        .sort((left, right) => parseDateValue(right.updatedAt) - parseDateValue(left.updatedAt)),
    [currentUser?.id, snapshot.feedbackTickets],
  );

  const pendingRoleRequests = useMemo(
    () => roleRequests.filter((item) => item.status === 'pending'),
    [roleRequests],
  );

  const reviewedRoleRequests = useMemo(
    () => roleRequests.filter((item) => item.status !== 'pending'),
    [roleRequests],
  );

  const inboxItems = useMemo<InboxItem[]>(() => {
    const items: InboxItem[] = announcements.map((item) => ({
      id: `announcement:${item.id}`,
      readKey: inboxReadKey('announcement', item.id, item.publishedAt),
      title: pickLocalizedValue(locale, item.titleZh, item.titleEn),
      summary: pickLocalizedValue(locale, item.summaryZh, item.summaryEn),
      time: item.publishedAt,
      priority: item.pinned ? 60 : 30,
      tone: 'announcement',
      icon: <MessageOutlined />,
      tags: [
        ...(item.pinned ? [{ label: copy.pinned, color: 'gold' }] : []),
        {
          label: pickLocalizedValue(locale, item.tagZh, item.tagEn) || copy.published,
          color: 'blue',
        },
      ],
      actionLabel: copy.viewDetails,
      onOpen: () => setAnnouncementOpen(item),
    }));

    feedbackReplies.forEach((item) => {
      items.push({
        id: `feedback:${item.id}`,
        readKey: inboxReadKey('feedback-reply', item.id, item.updatedAt),
        title: copy.feedbackReplyTitle,
        summary: item.adminReply?.trim() || item.title,
        time: item.updatedAt,
        priority: 50,
        tone: 'feedback',
        icon: <CommentOutlined />,
        tags: [
          { label: copy.feedbackReply, color: 'purple' },
          { label: feedbackStatusLabel(item.status, locale), color: 'processing' },
        ],
        actionLabel: copy.viewDetails,
        onOpen: () => setFeedbackOpen(item),
      });
    });

    if (canApproveUsers) {
      pendingUsers.forEach((item) => {
        items.push({
          id: `pending-user:${item.id}`,
          readKey: inboxReadKey('pending-user', item.id, item.createdAt),
          title: copy.pendingApprovalTitle,
          summary: copy.pendingApprovalSummary.replace('{{name}}', item.displayName || item.email),
          time: item.createdAt,
          priority: 80,
          tone: 'approval',
          icon: <UserAddOutlined />,
          tags: [{ label: copy.approval, color: 'red' }],
          actionLabel: copy.approvalReview,
          onOpen: () => navigate('/admin/users'),
        });
      });

      pendingRoleRequests.forEach((item) => {
        items.push({
          id: `role-request:${item.id}`,
          readKey: inboxReadKey('role-request', item.id, item.createdAt, item.status),
          title: copy.pendingRoleRequestTitle,
          summary: copy.pendingRoleRequestSummary
            .replace('{{name}}', item.userDisplayName || item.userEmail)
            .replace('{{role}}', t(roleKey(item.requestedRole))),
          time: item.createdAt,
          priority: 70,
          tone: 'approval',
          icon: <SafetyCertificateOutlined />,
          tags: [{ label: copy.approval, color: 'red' }],
          actionLabel: copy.approvalReview,
          onOpen: () => navigate('/admin/users'),
        });
      });
    } else if (currentUser?.role === 'MEMBER') {
      reviewedRoleRequests.forEach((item) => {
        items.push({
          id: `reviewed-role-request:${item.id}`,
          readKey: inboxReadKey('role-request-reviewed', item.id, item.status, item.reviewedAt),
          title:
            item.status === 'approved'
              ? copy.roleRequestApprovedTitle
              : copy.roleRequestRejectedTitle,
          summary:
            item.reviewNote?.trim() ||
            copy.roleRequestResultSummary.replace('{{role}}', t(roleKey(item.requestedRole))),
          time: item.reviewedAt ?? item.createdAt,
          priority: item.status === 'approved' ? 55 : 45,
          tone: item.status === 'approved' ? 'success' : 'approval',
          icon: <CheckCircleOutlined />,
          tags: [
            {
              label: item.status === 'approved' ? t('common.approve') : t('common.reject'),
              color: item.status === 'approved' ? 'green' : 'red',
            },
          ],
          actionLabel: copy.openAccount,
          onOpen: () => navigate('/account'),
        });
      });
    }

    return items.sort((left, right) => {
      if (left.priority !== right.priority) {
        return right.priority - left.priority;
      }
      return parseDateValue(right.time) - parseDateValue(left.time);
    });
  }, [
    announcements,
    canApproveUsers,
    copy,
    currentUser?.role,
    feedbackReplies,
    locale,
    navigate,
    pendingRoleRequests,
    pendingUsers,
    reviewedRoleRequests,
    t,
  ]);

  const readKeySet = useMemo(() => new Set(readKeys), [readKeys]);

  const unreadCount = useMemo(
    () => inboxItems.reduce((count, item) => count + (readKeySet.has(item.readKey) ? 0 : 1), 0),
    [inboxItems, readKeySet],
  );

  const markRead = useCallback((keys: string[]) => {
    if (keys.length === 0) {
      return;
    }
    setReadKeys((previous) => [...new Set([...previous, ...keys])]);
  }, []);

  useEffect(() => {
    if (!drawerOpen || inboxItems.length === 0) {
      return;
    }
    markRead(inboxItems.map((item) => item.readKey));
  }, [drawerOpen, inboxItems, markRead]);

  const openDrawer = () => {
    setDrawerOpen(true);
    void onRefresh();
    void refreshSupplemental();
  };

  return (
    <>
      <button
        type="button"
        className="nav-notification-button"
        onClick={openDrawer}
        aria-label={copy.openInbox}
      >
        <Badge dot={unreadCount > 0} color="#ff4d4f">
          <BellOutlined />
        </Badge>
      </button>

      <Drawer
        open={drawerOpen}
        title={copy.title}
        width={540}
        onClose={() => setDrawerOpen(false)}
      >
        <div className="global-inbox-shell">
          <div className="global-inbox-summary">
            <Text type="secondary">
              {copy.unread.replace('{{count}}', String(unreadCount))}
            </Text>
          </div>

          {supplementalLoading && inboxItems.length === 0 ? (
            <div className="page-fallback">
              <Space direction="vertical" align="center">
                <Spin />
                <Text>{copy.loading}</Text>
              </Space>
            </div>
          ) : inboxItems.length > 0 ? (
            <div className="global-inbox-list">
              {inboxItems.map((item) => {
                const unread = !readKeySet.has(item.readKey);
                return (
                  <div
                    key={item.id}
                    className={`global-inbox-item global-inbox-item-${item.tone}${unread ? ' global-inbox-item-unread' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setDrawerOpen(false);
                      item.onOpen();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setDrawerOpen(false);
                        item.onOpen();
                      }
                    }}
                  >
                    <div className={`global-inbox-icon global-inbox-icon-${item.tone}`}>{item.icon}</div>
                    <div className="global-inbox-body">
                      <div className="global-inbox-head">
                        <Text strong className="global-inbox-title">
                          {item.title}
                        </Text>
                        <Text className="global-inbox-time">{formatDateTime(item.time, locale)}</Text>
                      </div>
                      <Space wrap className="global-inbox-tags">
                        {item.tags.map((tag) => (
                          <Tag key={`${item.id}:${tag.label}`} color={tag.color}>
                            {tag.label}
                          </Tag>
                        ))}
                      </Space>
                      <Paragraph className="global-inbox-copy">{item.summary}</Paragraph>
                    </div>
                    <Button
                      type="link"
                      className="global-inbox-action"
                      onClick={(event) => {
                        event.stopPropagation();
                        setDrawerOpen(false);
                        item.onOpen();
                      }}
                    >
                      {item.actionLabel}
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty description={copy.noMessages} />
          )}
        </div>
      </Drawer>

      <Modal
        open={announcementOpen !== null}
        title={
          announcementOpen
            ? pickLocalizedValue(locale, announcementOpen.titleZh, announcementOpen.titleEn)
            : copy.announcement
        }
        footer={<Button onClick={() => setAnnouncementOpen(null)}>{copy.close}</Button>}
        onCancel={() => setAnnouncementOpen(null)}
        width={720}
        destroyOnHidden
      >
        {announcementOpen ? (
          <div className="global-inbox-detail-stack">
            <Space wrap>
              {announcementOpen.pinned ? <Tag color="gold">{copy.pinned}</Tag> : null}
              <Tag>{pickLocalizedValue(locale, announcementOpen.tagZh, announcementOpen.tagEn) || copy.published}</Tag>
              <Text className="global-inbox-time">{formatDateTime(announcementOpen.publishedAt, locale)}</Text>
            </Space>
            <Paragraph className="global-inbox-detail-copy">
              {pickLocalizedValue(locale, announcementOpen.contentZh, announcementOpen.contentEn)}
            </Paragraph>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={feedbackOpen !== null}
        title={feedbackOpen?.title ?? copy.feedbackReply}
        footer={<Button onClick={() => setFeedbackOpen(null)}>{copy.close}</Button>}
        onCancel={() => setFeedbackOpen(null)}
        width={760}
        destroyOnHidden
      >
        {feedbackOpen ? (
          <div className="global-inbox-detail-stack">
            <Descriptions
              bordered
              size="small"
              column={1}
              items={[
                {
                  key: 'status',
                  label: copy.feedbackStatus,
                  children: feedbackStatusLabel(feedbackOpen.status, locale),
                },
                {
                  key: 'createdAt',
                  label: copy.feedbackCreatedAt,
                  children: formatDateTime(feedbackOpen.createdAt, locale),
                },
                {
                  key: 'updatedAt',
                  label: copy.feedbackUpdatedAt,
                  children: formatDateTime(feedbackOpen.updatedAt, locale),
                },
              ]}
            />
            <div className="global-inbox-detail-block">
              <Text strong>{copy.feedbackContent}</Text>
              <Paragraph className="global-inbox-detail-copy">{feedbackOpen.content}</Paragraph>
            </div>
            <div className="global-inbox-detail-block">
              <Text strong>{copy.feedbackReplyContent}</Text>
              <Paragraph className="global-inbox-detail-copy">
                {feedbackOpen.adminReply?.trim() || '-'}
              </Paragraph>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
