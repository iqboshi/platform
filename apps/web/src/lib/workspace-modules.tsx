import type { PermissionKey, WorkflowRunStatus } from '@platform/types';
import type { PlatformDataSnapshot } from '@/lib/api';

import {
  BuildOutlined,
  EnvironmentOutlined,
  FolderOpenOutlined,
  InboxOutlined,
  RadarChartOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';

import workspaceModuleData from '@/config/workspace-modules.json';

export type WorkspaceSection = 'workspace' | 'admin' | 'personal';
export type WorkspaceModuleLocale = 'zh-CN' | 'en-US';
export type WorkspaceModuleMenuLabelKey =
  | 'menu.datasets'
  | 'menu.products'
  | 'menu.spatial'
  | 'menu.workflows'
  | 'menu.models'
  | 'menu.approvals'
  | 'menu.workspaceSettings'
  | 'menu.account'
  | 'menu.assets';

type LocalizedText = {
  zh: string;
  en: string;
};

type WorkspaceModuleRecord = {
  id: string;
  route: string;
  section: WorkspaceSection;
  menuLabelKey: WorkspaceModuleMenuLabelKey;
  permission?: PermissionKey;
  iconKey:
    | 'datasets'
    | 'products'
    | 'spatial'
    | 'workflows'
    | 'models'
    | 'approvals'
    | 'settings'
    | 'account'
    | 'assets';
  dashboard: {
    titleZh: string;
    titleEn: string;
    summaryZh: string;
    summaryEn: string;
    actionZh: string;
    actionEn: string;
    handoffZh: string[];
    handoffEn: string[];
  };
};

export interface WorkspaceModule {
  id: string;
  route: string;
  section: WorkspaceSection;
  menuLabelKey: WorkspaceModuleMenuLabelKey;
  permission?: PermissionKey;
  icon: ReactNode;
  title: LocalizedText;
  summary: LocalizedText;
  actionLabel: LocalizedText;
  handoff: LocalizedText[];
}

export interface DashboardModuleCard {
  id: string;
  route: string;
  section: WorkspaceSection;
  icon: ReactNode;
  title: string;
  summary: string;
  actionLabel: string;
  metricValue: string;
  metricLabel: string;
  activity: string;
  handoff: string[];
}

function iconForKey(key: WorkspaceModuleRecord['iconKey']): ReactNode {
  switch (key) {
    case 'datasets':
      return <FolderOpenOutlined />;
    case 'products':
      return <BuildOutlined />;
    case 'spatial':
      return <EnvironmentOutlined />;
    case 'workflows':
      return <ThunderboltOutlined />;
    case 'models':
      return <RadarChartOutlined />;
    case 'approvals':
      return <SafetyCertificateOutlined />;
    case 'settings':
      return <SettingOutlined />;
    case 'account':
      return <UserOutlined />;
    case 'assets':
      return <InboxOutlined />;
    default:
      return <FolderOpenOutlined />;
  }
}

function localizeText(locale: WorkspaceModuleLocale, value: LocalizedText): string {
  return locale === 'zh-CN' ? value.zh : value.en;
}

function formatActivityDate(value: string | undefined, locale: WorkspaceModuleLocale): string {
  if (!value) {
    return locale === 'zh-CN' ? '暂无最近活动' : 'No recent activity';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString(locale);
}

function workflowStatusLabel(status: WorkflowRunStatus, locale: WorkspaceModuleLocale): string {
  if (locale !== 'zh-CN') {
    return status;
  }

  switch (status) {
    case 'draft':
      return '草稿';
    case 'queued':
      return '排队中';
    case 'running':
      return '运行中';
    case 'succeeded':
      return '成功';
    default:
      return '失败';
  }
}

const sectionRank: Record<WorkspaceSection, number> = {
  workspace: 0,
  personal: 1,
  admin: 2,
};

const moduleRecords = workspaceModuleData as WorkspaceModuleRecord[];

export const workspaceModules: WorkspaceModule[] = moduleRecords.map((item) => ({
  id: item.id,
  route: item.route,
  section: item.section,
  menuLabelKey: item.menuLabelKey,
  permission: item.permission,
  icon: iconForKey(item.iconKey),
  title: {
    zh: item.dashboard.titleZh,
    en: item.dashboard.titleEn,
  },
  summary: {
    zh: item.dashboard.summaryZh,
    en: item.dashboard.summaryEn,
  },
  actionLabel: {
    zh: item.dashboard.actionZh,
    en: item.dashboard.actionEn,
  },
  handoff: item.dashboard.handoffZh.map((zh, index) => ({
    zh,
    en: item.dashboard.handoffEn[index] ?? item.dashboard.handoffEn[0] ?? zh,
  })),
}));

export function isWorkspaceModuleVisible(
  module: Pick<WorkspaceModule, 'permission'>,
  hasPermission: (permission: PermissionKey) => boolean,
): boolean {
  return module.permission ? hasPermission(module.permission) : true;
}

function moduleMetric(
  module: WorkspaceModule,
  snapshot: PlatformDataSnapshot,
  locale: WorkspaceModuleLocale,
): Pick<DashboardModuleCard, 'metricValue' | 'metricLabel' | 'activity'> {
  switch (module.id) {
    case 'datasets': {
      const publicDatasets = snapshot.datasets.filter((item) => item.visibility === 'public');
      const latestDataset = [...snapshot.datasets].sort((left, right) =>
        String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? '')),
      )[0];
      return {
        metricValue: String(publicDatasets.length),
        metricLabel: locale === 'zh-CN' ? '已发布数据集' : 'Published datasets',
        activity:
          latestDataset?.updatedAt
            ? locale === 'zh-CN'
              ? `最近更新 ${formatActivityDate(latestDataset.updatedAt, locale)}`
              : `Last updated ${formatActivityDate(latestDataset.updatedAt, locale)}`
            : formatActivityDate(undefined, locale),
      };
    }
    case 'products': {
      const latestProduct = [...snapshot.products].sort((left, right) =>
        String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? '')),
      )[0];
      return {
        metricValue: String(snapshot.products.length),
        metricLabel: locale === 'zh-CN' ? '可访问产品' : 'Accessible products',
        activity:
          latestProduct?.updatedAt
            ? locale === 'zh-CN'
              ? `最新产品更新 ${formatActivityDate(latestProduct.updatedAt, locale)}`
              : `Latest product update ${formatActivityDate(latestProduct.updatedAt, locale)}`
            : formatActivityDate(undefined, locale),
      };
    }
    case 'spatial': {
      const spatialReadyVersions = snapshot.datasetVersions.filter((item) => {
        const metadata = item.metadata ?? {};
        const fileName = String(metadata.original_file_name ?? '').toLowerCase();
        const contentType = String(metadata.content_type ?? '').toLowerCase();
        return (
          fileName.endsWith('.geojson') ||
          fileName.endsWith('.json') ||
          fileName.endsWith('.tif') ||
          fileName.endsWith('.tiff') ||
          contentType.includes('geo+json') ||
          contentType.includes('geotiff') ||
          contentType.includes('tiff')
        );
      });
      const latestVersion = [...spatialReadyVersions].sort((left, right) =>
        String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? '')),
      )[0];
      return {
        metricValue: String(spatialReadyVersions.length),
        metricLabel: locale === 'zh-CN' ? '可上图版本' : 'Map-ready versions',
        activity:
          latestVersion?.createdAt
            ? locale === 'zh-CN'
              ? `最新空间资产 ${formatActivityDate(latestVersion.createdAt, locale)}`
              : `Latest spatial asset ${formatActivityDate(latestVersion.createdAt, locale)}`
            : formatActivityDate(undefined, locale),
      };
    }
    case 'workflows': {
      const latestRun = [...snapshot.workflowRuns].sort((left, right) =>
        String(right.startedAt ?? right.finishedAt ?? '').localeCompare(
          String(left.startedAt ?? left.finishedAt ?? ''),
        ),
      )[0];
      return {
        metricValue: String(snapshot.workflowRuns.length),
        metricLabel: locale === 'zh-CN' ? '工作流运行' : 'Workflow runs',
        activity:
          latestRun
            ? locale === 'zh-CN'
              ? `最新运行状态：${workflowStatusLabel(latestRun.status, locale)}`
              : `Latest run status: ${workflowStatusLabel(latestRun.status, locale)}`
            : formatActivityDate(undefined, locale),
      };
    }
    case 'models': {
      const latestModel = [...snapshot.modelVersions].sort((left, right) =>
        String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? '')),
      )[0];
      return {
        metricValue: String(snapshot.modelVersions.length),
        metricLabel: locale === 'zh-CN' ? '模型版本' : 'Model versions',
        activity:
          latestModel?.createdAt
            ? locale === 'zh-CN'
              ? `最新模型更新 ${formatActivityDate(latestModel.createdAt, locale)}`
              : `Latest model update ${formatActivityDate(latestModel.createdAt, locale)}`
            : formatActivityDate(undefined, locale),
      };
    }
    case 'account': {
      return {
        metricValue: String(snapshot.geeCredentials.length),
        metricLabel: locale === 'zh-CN' ? '个人凭证' : 'Personal credentials',
        activity:
          snapshot.geeCredentials.length > 0
            ? locale === 'zh-CN'
              ? '工作流与空间模块可直接复用'
              : 'Reusable from workflows and spatial modules'
            : formatActivityDate(undefined, locale),
      };
    }
    case 'assets': {
      const totalAssets =
        snapshot.datasets.length +
        snapshot.products.length +
        snapshot.modelVersions.length +
        snapshot.workflowRuns.filter((item) => item.primaryOutputAssetVersionId).length;
      return {
        metricValue: String(totalAssets),
        metricLabel: locale === 'zh-CN' ? '关联资产' : 'Connected assets',
        activity:
          locale === 'zh-CN'
            ? '沉淀输入、结果与发布状态'
            : 'Collects inputs, outputs, and publication state',
      };
    }
    case 'approvals': {
      return {
        metricValue: String(snapshot.feedbackSummary.adminOpenCount),
        metricLabel: locale === 'zh-CN' ? '待处理事项' : 'Pending actions',
        activity:
          locale === 'zh-CN'
            ? '审批结果会回写到总览与入口权限'
            : 'Approval outcomes feed overview state and access',
      };
    }
    case 'workspace-settings': {
      return {
        metricValue: String(snapshot.dashboardConfig.announcements.filter((item) => item.published).length),
        metricLabel: locale === 'zh-CN' ? '已发布公告' : 'Published announcements',
        activity:
          locale === 'zh-CN'
            ? '总览公告与平台配置在这里统一维护'
            : 'Overview announcements and platform settings live here',
      };
    }
    default:
      return {
        metricValue: '0',
        metricLabel: locale === 'zh-CN' ? '状态' : 'Status',
        activity: formatActivityDate(undefined, locale),
      };
  }
}

export function buildDashboardModuleCards(
  snapshot: PlatformDataSnapshot,
  locale: WorkspaceModuleLocale,
  hasPermission: (permission: PermissionKey) => boolean,
): DashboardModuleCard[] {
  return workspaceModules
    .filter((item) => isWorkspaceModuleVisible(item, hasPermission))
    .sort((left, right) => sectionRank[left.section] - sectionRank[right.section])
    .map((item) => {
      const metric = moduleMetric(item, snapshot, locale);
      return {
        id: item.id,
        route: item.route,
        section: item.section,
        icon: item.icon,
        title: localizeText(locale, item.title),
        summary: localizeText(locale, item.summary),
        actionLabel: localizeText(locale, item.actionLabel),
        metricValue: metric.metricValue,
        metricLabel: metric.metricLabel,
        activity: metric.activity,
        handoff: item.handoff.map((entry) => localizeText(locale, entry)),
      };
    });
}
