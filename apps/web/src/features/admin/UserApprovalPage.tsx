import type { PendingUserSummary, RoleKey } from '@platform/types';

import { App, Button, Card, Empty, Select, Table, Typography } from 'antd';
import { useCallback, useEffect, useState } from 'react';

import { isApiError } from '@/auth/errors';
import { useAuth } from '@/auth/useAuth';
import { approvePendingUser, listPendingUsers, rejectPendingUser } from '@/lib/api';
import { useI18n } from '@/i18n/useI18n';
import { roleKey } from '@/lib/i18n-helpers';

const { Paragraph } = Typography;

export function UserApprovalPage() {
  const { message } = App.useApp();
  const { currentUser, token } = useAuth();
  const { locale, t } = useI18n();
  const [pendingUsers, setPendingUsers] = useState<PendingUserSummary[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<Record<string, RoleKey>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) {
      return;
    }
    setLoading(true);
    try {
      const users = await listPendingUsers(token);
      setPendingUsers(users);
      setSelectedRoles(
        Object.fromEntries(users.map((user) => [user.id, user.role])),
      );
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

  return (
    <div className="page-stack">
      <div className="section-header">
        <div className="panel-kicker">{t('approvals.kicker')}</div>
        <h2 className="section-title">{t('approvals.title')}</h2>
        <Paragraph className="section-copy">{t('approvals.copy')}</Paragraph>
      </div>

      <Card className="panel-card" variant="borderless">
        {pendingUsers.length === 0 && !loading ? (
          <Empty description={t('approvals.empty')} />
        ) : (
          <Table
            rowKey="id"
            loading={loading}
            pagination={false}
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
                  new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
                    new Date(value),
                  ),
              },
              {
                title: t('common.actions'),
                render: (_, record) => (
                  <div className="approval-actions">
                    <Button type="primary" onClick={() => onApprove(record.id)}>
                      {t('common.approve')}
                    </Button>
                    <Button danger onClick={() => onReject(record.id)}>
                      {t('common.reject')}
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        )}
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
