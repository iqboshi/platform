import type { AssetOverview } from '@/lib/api';
import type { AssetScope, GeeCredentialSummary } from '@platform/types';

import { Card, Empty, Select, Table, Typography } from 'antd';
import type { TableProps } from 'antd';

const { Paragraph } = Typography;

interface GeeCredentialsSectionCardProps {
  overview: AssetOverview | null;
  scope: AssetScope;
  scopeOptions: Array<{ value: string; label: string }>;
  loading: boolean;
  columns: TableProps<GeeCredentialSummary>['columns'];
  pagination: TableProps<GeeCredentialSummary>['pagination'];
  tabLabel: string;
  sectionCopy: string;
  emptyLabel: string;
  loadingLabel: string;
  onScopeChange: (scope: AssetScope) => void;
}

export function GeeCredentialsSectionCard({
  overview,
  scope,
  scopeOptions,
  loading,
  columns,
  pagination,
  tabLabel,
  sectionCopy,
  emptyLabel,
  loadingLabel,
  onScopeChange,
}: GeeCredentialsSectionCardProps) {
  return (
    <Card className="panel-card" variant="borderless">
      <div className="section-header-actions">
        <div>
          <div className="panel-kicker">{tabLabel}</div>
          <Paragraph className="section-copy">{sectionCopy}</Paragraph>
        </div>
        {overview ? (
          <Select
            value={scope}
            onChange={(value) => onScopeChange(value as AssetScope)}
            style={{ width: 180 }}
            options={scopeOptions}
          />
        ) : null}
      </div>
      {overview ? (
        overview.geeCredentials.length ? (
          <Table
            rowKey="id"
            loading={loading}
            pagination={pagination}
            columns={columns}
            dataSource={overview.geeCredentials}
          />
        ) : (
          <Empty description={emptyLabel} />
        )
      ) : (
        <Empty description={loadingLabel} />
      )}
    </Card>
  );
}
