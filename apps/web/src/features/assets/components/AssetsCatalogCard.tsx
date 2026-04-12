import type { AssetOverview } from '@/lib/api';
import type { AssetScope } from '@platform/types';

import { Card, Empty, Select, Space, Table, Typography } from 'antd';
import type { SelectProps, TableProps } from 'antd';

import { LayeredPanelCard } from '@/components/LayeredPanelCard';
import { useI18n } from '@/i18n/useI18n';

const { Text, Title } = Typography;

type AssetCatalogRow = object;

export interface AssetCatalogSection {
  key: string;
  label: string;
  rows: readonly AssetCatalogRow[];
  columns: TableProps<AssetCatalogRow>['columns'];
  emptyLabel: string;
  groupKey?: string;
  groupLabel?: string;
  summary?: string;
  detail?: string;
  defaultExpanded?: boolean;
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

interface AssetCatalogGroup {
  key: string;
  label: string;
  sections: AssetCatalogSection[];
}

function buildGroups(sections: AssetCatalogSection[]): AssetCatalogGroup[] {
  const grouped = new Map<string, AssetCatalogGroup>();

  for (const section of sections) {
    const key = section.groupKey ?? 'default';
    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        label: section.groupLabel ?? '',
        sections: [],
      });
    }
    grouped.get(key)?.sections.push(section);
  }

  return [...grouped.values()];
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
  const { locale } = useI18n();
  const groups = buildGroups(sections);
  const totalRows = sections.reduce((count, section) => count + section.rows.length, 0);
  const copy =
    locale === 'zh-CN'
      ? {
          kicker: '资产目录',
          title: overview ? `${sections.length} 个分区，${totalRows} 条资产记录` : loadingLabel,
          body: '用折叠分区保持首屏简洁，同时保留完整表格与操作入口。',
          scope: '范围',
          expand: '展开详情',
          collapse: '收起详情',
        }
      : {
          kicker: 'Asset Catalog',
          title: overview ? `${sections.length} sections, ${totalRows} asset records` : loadingLabel,
          body: 'Keep the first screen readable while preserving full tables and actions.',
          scope: 'Scope',
          expand: 'Show details',
          collapse: 'Hide details',
        };

  return (
    <div className="asset-catalog-shell">
      <Card className="panel-card asset-catalog-toolbar-card" variant="borderless">
        <div className="asset-catalog-toolbar">
          <div>
            <div className="panel-kicker">{copy.kicker}</div>
            <Title level={4} className="asset-catalog-toolbar-title">
              {copy.title}
            </Title>
            <Text type="secondary">{copy.body}</Text>
          </div>
          <Space align="center" wrap>
            <Text type="secondary">{copy.scope}</Text>
            <Select
              value={scope}
              onChange={(value) => onScopeChange(value as AssetScope)}
              style={{ width: 180 }}
              options={scopeOptions}
            />
          </Space>
        </div>
      </Card>

      {overview ? (
        groups.map((group) => (
          <div key={group.key} className="asset-catalog-group">
            {group.label ? <div className="asset-catalog-group-title">{group.label}</div> : null}
            <div className="asset-catalog-section-stack">
              {group.sections.map((section) => (
                <LayeredPanelCard
                  key={section.key}
                  title={`${section.label} (${section.rows.length})`}
                  summary={
                    <div className="asset-catalog-section-summary">
                      {section.summary ? (
                        <div className="asset-catalog-section-line">{section.summary}</div>
                      ) : null}
                      {section.detail ? (
                        <div className="asset-catalog-section-detail">{section.detail}</div>
                      ) : null}
                    </div>
                  }
                  defaultExpanded={section.defaultExpanded}
                  expandLabel={copy.expand}
                  collapseLabel={copy.collapse}
                >
                  {section.rows.length ? (
                    <Table<AssetCatalogRow>
                      rowKey="id"
                      loading={loading}
                      pagination={pagination}
                      columns={section.columns}
                      dataSource={section.rows}
                    />
                  ) : (
                    <Empty description={section.emptyLabel} />
                  )}
                </LayeredPanelCard>
              ))}
            </div>
          </div>
        ))
      ) : (
        <Card className="panel-card" variant="borderless">
          <Empty description={loadingLabel} />
        </Card>
      )}
    </div>
  );
}
