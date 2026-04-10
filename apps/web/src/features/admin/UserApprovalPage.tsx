import type { PendingUserSummary, RoleKey, RoleUpgradeRequestSummary } from '@platform/types';

import { App, Button, Card, Empty, Select, Table, Tabs, Tag, Typography } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { isApiError } from '@/auth/errors';
import { useAuth } from '@/auth/useAuth';
import {
  approvePendingUser,
  approveRoleUpgradeRequest,
  listPendingUsers,
  listRoleUpgradeRequests,
  rejectPendingUser,
  rejectRoleUpgradeRequest,
} from '@/lib/api';
import { useI18n } from '@/i18n/useI18n';
import { roleKey } from '@/lib/i18n-helpers';

const { Paragraph } = Typography;

const APPROVAL_TABLE_PAGINATION = {
  pageSize: 8,
  showSizeChanger: true,
  pageSizeOptions: ['8', '20', '50'],
  hideOnSinglePage: true,
};

export function UserApprovalPage() {
  const { message } = App.useApp();
  const { currentUser, token } = useAuth();
  const { locale, t } = useI18n();
  const [pendingUsers, setPendingUsers] = useState<PendingUserSummary[]>([]);
  const [roleUpgradeRequests, setRoleUpgradeRequests] = useState<RoleUpgradeRequestSummary[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<Record<string, RoleKey>>({});
  const [loading, setLoading] = useState(true);

  const requestCopy = useMemo(
    () =>
      locale === 'zh-CN'
        ? {
            tab: '权限申请',
            empty: '当前没有权限提升申请。',
            requester: '申请人',
            currentRole: '当前角色',
            requestedRole: '目标角色',
            reason: '申请理由',
            reviewNote: '审批备注',
            pending: '待审批',
            approved: '已通过',
            rejected: '已拒绝',
            approvedMessage: '权限申请已通过。',
            rejectedMessage: '权限申请已拒绝。',
          }
        : {
            tab: 'Role requests',
            empty: 'No role upgrade requests.',
            requester: 'Requester',
            currentRole: 'Current role',
            requestedRole: 'Requested role',
            reason: 'Reason',
            reviewNote: 'Review note',
            pending: 'Pending',
            approved: 'Approved',
            rejected: 'Rejected',
            approvedMessage: 'Role request approved.',
            rejectedMessage: 'Role request rejected.',
          },
    [locale],
  );

  const load = useCallback(async () => {
    if (!token) {
      return;
    }
    setLoading(true);
    try {
      const [users, requests] = await Promise.all([
        listPendingUsers(token),
        listRoleUpgradeRequests(token),
      ]);
      setPendingUsers(users);
      setRoleUpgradeRequests(requests);
      setSelectedRoles(Object.fromEntries(users.map((user) => [user.id, user.role])));
    } catch (error) {
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    } finally {
      setLoading(false);
    }
  }, [message, t, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const onApprove = async (userId: string) => {
    if (!token) {
      return;
    }
    try {
      await approvePendingUser(token, userId, selectedRoles[userId] ?? 'MEMBER');
      message.success(t('approvals.approved'));
      await load();
    } catch (error) {
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    }
  };

  const onReject = async (userId: string) => {
    if (!token) {
      return;
    }
    try {
      await rejectPendingUser(token, userId);
      message.success(t('approvals.rejected'));
      await load();
    } catch (error) {
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    }
  };

  const onApproveRoleRequest = useCallback(
    async (requestId: string) => {
      if (!token) {
        return;
      }
      try {
        await approveRoleUpgradeRequest(token, requestId);
        message.success(requestCopy.approvedMessage);
        await load();
      } catch (error) {
        message.error(isApiError(error) ? error.message : t('error.request_failed'));
      }
    },
    [load, message, requestCopy.approvedMessage, t, token],
  );

  const onRejectRoleRequest = useCallback(
    async (requestId: string) => {
      if (!token) {
        return;
      }
      try {
        await rejectRoleUpgradeRequest(token, requestId);
        message.success(requestCopy.rejectedMessage);
        await load();
      } catch (error) {
        message.error(isApiError(error) ? error.message : t('error.request_failed'));
      }
    },
    [load, message, requestCopy.rejectedMessage, t, token],
  );

  const requestColumns = useMemo(
    () => [
      {
        title: requestCopy.requester,
        dataIndex: 'userDisplayName',
        render: (value: string, record: RoleUpgradeRequestSummary) => `${value} / ${record.userEmail}`,
      },
      {
        title: requestCopy.currentRole,
        dataIndex: 'currentRole',
        render: (value: RoleUpgradeRequestSummary['currentRole']) => t(roleKey(value)),
      },
      {
        title: requestCopy.requestedRole,
        dataIndex: 'requestedRole',
        render: (value: RoleUpgradeRequestSummary['requestedRole']) => t(roleKey(value)),
      },
      { title: requestCopy.reason, dataIndex: 'reason' },
      {
        title: t('common.status'),
        dataIndex: 'status',
        render: (value: RoleUpgradeRequestSummary['status']) => (
          <Tag color={value === 'approved' ? 'green' : value === 'rejected' ? 'red' : 'gold'}>
            {value === 'approved'
              ? requestCopy.approved
              : value === 'rejected'
                ? requestCopy.rejected
                : requestCopy.pending}
          </Tag>
        ),
      },
      {
        title: requestCopy.reviewNote,
        dataIndex: 'reviewNote',
        render: (value: string | undefined) => value || '-',
      },
      {
        title: t('common.actions'),
        render: (_: unknown, record: RoleUpgradeRequestSummary) =>
          record.status === 'pending' ? (
            <div className="approval-actions">
              <Button type="primary" onClick={() => void onApproveRoleRequest(record.id)}>
                {t('common.approve')}
              </Button>
              <Button danger onClick={() => void onRejectRoleRequest(record.id)}>
                {t('common.reject')}
              </Button>
            </div>
          ) : (
            '-'
          ),
      },
    ],
    [onApproveRoleRequest, onRejectRoleRequest, requestCopy, t],
  );

  return (
    <div className="page-stack">
      <div className="section-header">
        <div className="panel-kicker">{t('approvals.kicker')}</div>
        <h2 className="section-title">{t('approvals.title')}</h2>
        <Paragraph className="section-copy">{t('approvals.copy')}</Paragraph>
      </div>

      <Card className="panel-card" variant="borderless">
        <Tabs
          items={[
            {
              key: 'pending-users',
              label: t('approvals.pendingUsers'),
              children:
                pendingUsers.length === 0 && !loading ? (
                  <Empty description={t('approvals.empty')} />
                ) : (
                  <Table
                    rowKey="id"
                    loading={loading}
                    pagination={APPROVAL_TABLE_PAGINATION}
                    dataSource={pendingUsers}
                    columns={[
                      { title: t('common.displayName'), dataIndex: 'displayName' },
                      { title: t('common.email'), dataIndex: 'email' },
                      {
                        title: t('approvals.roleToGrant'),
                        render: (_, record) => (
                          <Select
                            value={selectedRoles[record.id] ?? record.role}
                            onChange={(value) =>
                              setSelectedRoles((current) => ({ ...current, [record.id]: value }))
                            }
                            options={[
                              { value: 'MEMBER', label: t('role.MEMBER') },
                              { value: 'ML_ENGINEER', label: t('role.ML_ENGINEER') },
                              { value: 'ADMIN', label: t('role.ADMIN') },
                            ]}
                            style={{ minWidth: 150 }}
                          />
                        ),
                      },
                      {
                        title: t('common.createdAt'),
                        dataIndex: 'createdAt',
                        render: (value: string) =>
                          new Intl.DateTimeFormat(locale, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          }).format(new Date(value)),
                      },
                      {
                        title: t('common.actions'),
                        render: (_, record) => (
                          <div className="approval-actions">
                            <Button type="primary" onClick={() => void onApprove(record.id)}>
                              {t('common.approve')}
                            </Button>
                            <Button danger onClick={() => void onReject(record.id)}>
                              {t('common.reject')}
                            </Button>
                          </div>
                        ),
                      },
                    ]}
                  />
                ),
            },
            {
              key: 'role-requests',
              label: requestCopy.tab,
              children:
                roleUpgradeRequests.length === 0 && !loading ? (
                  <Empty description={requestCopy.empty} />
                ) : (
                  <Table
                    rowKey="id"
                    loading={loading}
                    pagination={APPROVAL_TABLE_PAGINATION}
                    dataSource={roleUpgradeRequests}
                    columns={requestColumns}
                  />
                ),
            },
          ]}
        />
      </Card>

      {currentUser ? (
        <Card className="panel-card" variant="borderless">
          <div className="panel-kicker">{t('header.signedInAs')}</div>
          <Paragraph>
            {currentUser.displayName} / {t(roleKey(currentUser.role))}
          </Paragraph>
        </Card>
      ) : null}
    </div>
  );
}
