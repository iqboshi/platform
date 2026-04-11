import type { AssetOverview } from '@/lib/api';
import type { AssetScope } from '@platform/types';

import { Card, Empty, Select, Table, Tabs } from 'antd';
import type { SelectProps, TableProps } from 'antd';

type AssetCatalogRow = object;

export interface AssetCatalogSection {
  key: string;
  label: string;
  rows: readonly AssetCatalogRow[];
  columns: TableProps<AssetCatalogRow>['columns'];
  emptyLabel: string;
}

interface AssetsCatalogCardProps {
  overview: AssetOverview | null;
  scope: AssetScope;
  scopeOptions: SelectProps['options'];
  sections: AssetCatalogSection[];
  loading: boolean;
  pagination: TableProps<AssetCatalogRow>['pagination'];
  loadingLabel: string;
  onScopeChange: (scope: AssetScope) => void;
}

export function AssetsCatalogCard({
  overview,
  scope,
  scopeOptions,
  sections,
  loading,
  pagination,
  loadingLabel,
  onScopeChange,
}: AssetsCatalogCardProps) {
  const tabs = sections.map((section) => ({
    key: section.key,
    label: `${section.label} (${section.rows.length})`,
    children: section.rows.length ? (
      <Table<AssetCatalogRow>
        rowKey="id"
        loading={loading}
        pagination={pagination}
        columns={section.columns}
        dataSource={section.rows}
      />
    ) : (
      <Empty description={section.emptyLabel} />
    ),
  }));

  return (
    <Card className="panel-card" variant="borderless">
      {overview ? (
        <Tabs
          tabBarExtraContent={
            <Select
              value={scope}
              onChange={(value) => onScopeChange(value as AssetScope)}
              style={{ width: 180 }}
              options={scopeOptions}
            />
          }
          items={tabs}
        />
      ) : (
        <Empty description={loadingLabel} />
      )}
    </Card>
  );
}
