import type { MenuProps } from 'antd';
import type { PermissionKey } from '@platform/types';

import {
  AppstoreOutlined,
  DeploymentUnitOutlined,
  FolderOpenOutlined,
  GlobalOutlined,
  LogoutOutlined,
  RadarChartOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { Button, Card, Layout, Menu, Select, Space, Spin, Tag, Typography } from 'antd';
import { lazy, type ReactNode, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import { AuthProvider } from './auth/AuthProvider';
import { useAuth } from './auth/useAuth';
import { I18nProvider } from './i18n/I18nProvider';
import { useI18n } from './i18n/useI18n';
import { loadPlatformData, type PlatformDataSnapshot } from './lib/api';
import { roleKey } from './lib/i18n-helpers';

const DashboardPage = lazy(() =>
  import('./features/dashboard/DashboardPage').then((module) => ({
    default: module.DashboardPage,
  })),
);
const DatasetsPage = lazy(() =>
  import('./features/datasets/DatasetsPage').then((module) => ({
    default: module.DatasetsPage,
  })),
);
const WorkflowsPage = lazy(() =>
  import('./features/workflows/WorkflowsPage').then((module) => ({
    default: module.WorkflowsPage,
  })),
);
const ModelsPage = lazy(() =>
  import('./features/models/ModelsPage').then((module) => ({
    default: module.ModelsPage,
  })),
);
const LoginPage = lazy(() =>
  import('./features/auth/LoginPage').then((module) => ({
    default: module.LoginPage,
  })),
);
const RegisterPage = lazy(() =>
  import('./features/auth/RegisterPage').then((module) => ({
    default: module.RegisterPage,
  })),
);
const PendingApprovalPage = lazy(() =>
  import('./features/auth/PendingApprovalPage').then((module) => ({
    default: module.PendingApprovalPage,
  })),
);
const ForbiddenPage = lazy(() =>
  import('./features/auth/ForbiddenPage').then((module) => ({
    default: module.ForbiddenPage,
  })),
);
const UserApprovalPage = lazy(() =>
  import('./features/admin/UserApprovalPage').then((module) => ({
    default: module.UserApprovalPage,
  })),
);

const { Header, Content, Sider } = Layout;
const { Title, Paragraph, Text } = Typography;

interface ShellMenuItem {
  key: string;
  permission?: PermissionKey;
  icon: ReactNode;
  labelKey:
    | 'menu.overview'
    | 'menu.datasets'
    | 'menu.workflows'
    | 'menu.models'
    | 'menu.approvals';
}

const menuConfig: ShellMenuItem[] = [
  { key: '/', icon: <AppstoreOutlined />, labelKey: 'menu.overview' },
  { key: '/datasets', icon: <FolderOpenOutlined />, labelKey: 'menu.datasets' },
  { key: '/workflows', icon: <DeploymentUnitOutlined />, labelKey: 'menu.workflows' },
  { key: '/models', icon: <RadarChartOutlined />, labelKey: 'menu.models', permission: 'model.view' },
  {
    key: '/admin/users',
    icon: <SafetyCertificateOutlined />,
    labelKey: 'menu.approvals',
    permission: 'user.approve',
  },
];

function routeKey(pathname: string): string {
  if (pathname.startsWith('/datasets')) return '/datasets';
  if (pathname.startsWith('/workflows')) return '/workflows';
  if (pathname.startsWith('/models')) return '/models';
  if (pathname.startsWith('/admin')) return '/admin/users';
  return '/';
}

function RouteSpinner() {
  const { t } = useI18n();
  return (
    <div className="page-fallback">
      <Space direction="vertical" align="center">
        <Spin />
        <Text>{t('common.loading')}</Text>
      </Space>
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { currentUser, status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <RouteSpinner />;
  }
  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (currentUser.approvalStatus !== 'APPROVED') {
    return <Navigate to="/pending" replace />;
  }
  return <>{children}</>;
}

function RequirePermission({
  permission,
  children,
}: {
  permission: PermissionKey;
  children: ReactNode;
}) {
  const { hasPermission } = useAuth();

  if (!hasPermission(permission)) {
    return <Navigate to="/forbidden" replace />;
  }
  return <>{children}</>;
}

function AppShell({
  snapshot,
  onRefresh,
}: {
  snapshot: PlatformDataSnapshot;
  onRefresh: () => Promise<void>;
}) {
  const { currentUser, hasPermission, logout } = useAuth();
  const { locale, setLocale, t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();

  const selectedKey = useMemo(() => routeKey(location.pathname), [location.pathname]);
  const menuItems = useMemo<MenuProps['items']>(
    () =>
      menuConfig
        .filter((item) => (item.permission ? hasPermission(item.permission) : true))
        .map((item) => ({
          key: item.key,
          icon: item.icon,
          label: t(item.labelKey),
        })),
    [hasPermission, t],
  );

  return (
    <Layout className="app-shell">
      <Sider breakpoint="lg" collapsedWidth="0" width={280} className="app-sider">
        <div className="brand-panel">
          <div className="brand-kicker">{t('app.title')}</div>
          <Title level={3} className="brand-title">
            {snapshot.workspace.name}
          </Title>
          <Paragraph className="brand-copy">{snapshot.workspace.description}</Paragraph>
          <Tag color={snapshot.source === 'api' ? 'green' : 'gold'}>
            {t('header.dataSource')}: {snapshot.source.toUpperCase()}
          </Tag>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          className="nav-menu"
        />
      </Sider>
      <Layout>
        <Header className="app-header">
          <div>
            <div className="header-eyebrow">{t('header.workspace')}</div>
            <Title level={2} className="header-title">
              {snapshot.workspace.name}
            </Title>
          </div>
          <Space size="middle" wrap className="header-actions">
            <div className="header-meta">
              <span>
                {snapshot.workspace.memberCount} {t('header.members')}
              </span>
              <span>
                {snapshot.datasets.length} {t('header.datasets')}
              </span>
              <span>
                {snapshot.workflowRuns.length} {t('header.runs')}
              </span>
            </div>
            {currentUser ? (
              <Tag color="blue">
                {t('header.signedInAs')}: {currentUser.displayName} / {t(roleKey(currentUser.role))}
              </Tag>
            ) : null}
            <Select
              value={locale}
              onChange={setLocale}
              suffixIcon={<GlobalOutlined />}
              options={[
                { value: 'zh-CN', label: t('locale.zh-CN') },
                { value: 'en-US', label: t('locale.en-US') },
              ]}
              style={{ width: 140 }}
            />
            <Button icon={<LogoutOutlined />} onClick={() => void logout().then(() => navigate('/login'))}>
              {t('common.logout')}
            </Button>
          </Space>
        </Header>
        <Content className="app-content">
          <Suspense fallback={<RouteSpinner />}>
            <Routes>
              <Route path="/" element={<DashboardPage snapshot={snapshot} />} />
              <Route path="/datasets" element={<DatasetsPage snapshot={snapshot} onRefresh={onRefresh} />} />
              <Route path="/workflows" element={<WorkflowsPage snapshot={snapshot} onRefresh={onRefresh} />} />
              <Route
                path="/models"
                element={
                  <RequirePermission permission="model.view">
                    <ModelsPage snapshot={snapshot} />
                  </RequirePermission>
                }
              />
              <Route
                path="/admin/users"
                element={
                  <RequirePermission permission="user.approve">
                    <UserApprovalPage />
                  </RequirePermission>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </Content>
      </Layout>
    </Layout>
  );
}

function ProtectedWorkspace() {
  const { currentUser, hasPermission, status, token } = useAuth();
  const { applyPreferredLocale, t } = useI18n();
  const [snapshot, setSnapshot] = useState<PlatformDataSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser) {
      applyPreferredLocale(currentUser.preferredLocale);
    }
  }, [applyPreferredLocale, currentUser]);

  const refreshSnapshot = useCallback(async () => {
    if (!token || !currentUser || status !== 'authenticated') {
      return;
    }

    try {
      const nextSnapshot = await loadPlatformData(token, {
        includeModels: hasPermission('model.view'),
      });
      setSnapshot(nextSnapshot);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load workspace.');
    }
  }, [currentUser, hasPermission, status, token]);

  useEffect(() => {
    void refreshSnapshot();
  }, [refreshSnapshot]);

  if (loadError) {
    return (
      <Card className="panel-card" variant="borderless">
        <Title level={3}>{t('workspace.loadFailedTitle')}</Title>
        <Paragraph>{t('workspace.loadFailedBody')}</Paragraph>
        <Paragraph>{loadError}</Paragraph>
        <Button onClick={() => void refreshSnapshot()}>{t('common.refresh')}</Button>
      </Card>
    );
  }

  if (!snapshot) {
    return <RouteSpinner />;
  }

  return <AppShell snapshot={snapshot} onRefresh={refreshSnapshot} />;
}

function AppRoutes() {
  return (
    <Suspense fallback={<RouteSpinner />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/pending" element={<PendingApprovalPage />} />
        <Route path="/forbidden" element={<ForbiddenPage />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <ProtectedWorkspace />
            </RequireAuth>
          }
        />
      </Routes>
    </Suspense>
  );
}

function AppRoot() {
  return (
    <I18nProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </I18nProvider>
  );
}

export default AppRoot;
