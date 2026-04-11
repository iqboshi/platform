import type { AuthUser, RoleUpgradeRequestSummary } from '@platform/types';

import { Button, Card, Descriptions, Empty, Form, Input, Table, Typography } from 'antd';
import type { FormInstance, TableProps } from 'antd';
import type { ReactNode } from 'react';

const { Paragraph, Text } = Typography;

interface PasswordCopy {
  passwordTitle: string;
  passwordCopy: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface RoleRequestCopy {
  title: string;
  copy: string;
  latestTitle: string;
  tableReviewNote: string;
  reviewedBy: string;
  reviewedAt: string;
  reasonLabel: string;
  submit: string;
  currentRoleOnly: string;
  empty: string;
}

interface AccountSidebarCardsProps {
  currentUser: AuthUser | null;
  latestRoleRequest: RoleUpgradeRequestSummary | undefined;
  roleRequests: RoleUpgradeRequestSummary[];
  roleRequestsLoading: boolean;
  roleRequestSaving: boolean;
  passwordSaving: boolean;
  passwordForm: FormInstance;
  roleRequestForm: FormInstance;
  passwordCopy: PasswordCopy;
  roleRequestCopy: RoleRequestCopy;
  roleRequestColumns: TableProps<RoleUpgradeRequestSummary>['columns'];
  roleRequestPagination: TableProps<RoleUpgradeRequestSummary>['pagination'];
  renderRoleRequestStatusTag: (status: RoleUpgradeRequestSummary['status']) => ReactNode;
  latestRoleRequestReviewedAtText: string;
  onChangePassword: () => void;
  onCreateRoleRequest: () => void;
}

export function AccountSidebarCards({
  currentUser,
  latestRoleRequest,
  roleRequests,
  roleRequestsLoading,
  roleRequestSaving,
  passwordSaving,
  passwordForm,
  roleRequestForm,
  passwordCopy,
  roleRequestCopy,
  roleRequestColumns,
  roleRequestPagination,
  renderRoleRequestStatusTag,
  latestRoleRequestReviewedAtText,
  onChangePassword,
  onCreateRoleRequest,
}: AccountSidebarCardsProps) {
  return (
    <div className="profile-security-stack">
      <Card className="panel-card" variant="borderless">
        <div className="panel-kicker">{passwordCopy.passwordTitle}</div>
        <Paragraph className="section-copy">{passwordCopy.passwordCopy}</Paragraph>
        <Form form={passwordForm} layout="vertical">
          <Form.Item name="currentPassword" label={passwordCopy.currentPassword} rules={[{ required: true, min: 8 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="newPassword" label={passwordCopy.newPassword} rules={[{ required: true, min: 8 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="confirmPassword" label={passwordCopy.confirmPassword} rules={[{ required: true, min: 8 }]}>
            <Input.Password />
          </Form.Item>
          <Button type="primary" onClick={onChangePassword} loading={passwordSaving}>
            {passwordCopy.passwordTitle}
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
                  children: latestRoleRequestReviewedAtText,
                },
              ]}
            />
          </div>
        ) : null}
        {currentUser?.role === 'MEMBER' ? (
          <Form form={roleRequestForm} layout="vertical">
            <Form.Item name="reason" label={roleRequestCopy.reasonLabel} rules={[{ required: true, min: 4 }]}>
              <Input.TextArea rows={4} />
            </Form.Item>
            <Button type="primary" onClick={onCreateRoleRequest} loading={roleRequestSaving}>
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
              pagination={roleRequestPagination}
              columns={roleRequestColumns}
              dataSource={roleRequests}
              size="small"
            />
          ) : (
            <Empty description={roleRequestCopy.empty} />
          )}
        </div>
      </Card>
    </div>
  );
}
