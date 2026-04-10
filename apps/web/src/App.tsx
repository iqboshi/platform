import type { MenuProps } from 'antd';
import type { PermissionKey } from '@platform/types';

import {
  AppstoreOutlined,
  BuildOutlined,
  DeploymentUnitOutlined,
  EnvironmentOutlined,
  FolderOpenOutlined,
  GlobalOutlined,
  LogoutOutlined,
  RadarChartOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
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
const SpatialStudioPage = lazy(() =>
  import('./features/spatial/SpatialStudioPage').then((module) => ({
    default: module.SpatialStudioPage,
  })),
);
const ProductsPage = lazy(() =>
  import('./features/products/ProductsPage').then((module) => ({
    default: module.ProductsPage,
  })),
);
const PersonalAssetsPage = lazy(() =>
  import('./features/assets/PersonalAssetsPage').then((module) => ({
    default: module.PersonalAssetsPage,
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

const { Content, Sider } = Layout;
const { Title, Paragraph, Text } = Typography;

interface ShellMenuItem {
  key: string;
  permission?: PermissionKey;
  icon: ReactNode;
  section: 'workspace' | 'admin' | 'personal';
  labelKey:
    | 'menu.overview'
    | 'menu.datasets'
    | 'menu.products'
    | 'menu.spatial'
    | 'menu.assets'
    | 'menu.workflows'
    | 'menu.models'
    | 'menu.approvals';
}

const menuConfig: ShellMenuItem[] = [
  { key: '/', icon: <AppstoreOutlined />, section: 'workspace', labelKey: 'menu.overview' },
  { key: '/datasets', icon: <FolderOpenOutlined />, section: 'workspace', labelKey: 'menu.datasets' },
  { key: '/products', icon: <BuildOutlined />, section: 'workspace', labelKey: 'menu.products' },
  { key: '/spatial', icon: <EnvironmentOutlined />, section: 'workspace', labelKey: 'menu.spatial' },
  { key: '/workflows', icon: <DeploymentUnitOutlined />, section: 'workspace', labelKey: 'menu.workflows' },
  {
    key: '/models',
    icon: <RadarChartOutlined />,
    section: 'workspace',
    labelKey: 'menu.models',
    permission: 'model.view',
  },
  {
    key: '/admin/users',
    icon: <SafetyCertificateOutlined />,
    section: 'admin',
    labelKey: 'menu.approvals',
    permission: 'user.approve',
  },
  { key: '/assets', icon: <UserOutlined />, section: 'personal', labelKey: 'menu.assets' },
];

function routeKey(pathname: string): string {
  if (pathname.startsWith('/datasets')) return '/datasets';
  if (pathname.startsWith('/products')) return '/products';
  if (pathname.startsWith('/spatial')) return '/spatial';
  if (pathname.startsWith('/assets')) return '/assets';
  if (pathname.startsWith('/workflows')) return '/workflows';
  if (pathname.startsWith('/models')) return '/models';
  if (pathname.startsWith('/approvals')) return '/admin/users';
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
  const sectionTitles = useMemo(
    () =>
      locale === 'zh-CN'
        ? {
            workspace: '工作区',
            admin: '管理中心',
            personal: '个人',
          }
        : {
            workspace: 'Workspace',
            admin: 'Administration',
            personal: 'Personal',
          },
    [locale],
  );
  const workspaceMenuItems = useMemo<MenuProps['items']>(
    () =>
      menuConfig
        .filter((item) => item.section === 'workspace')
        .filter((item) => (item.permission ? hasPermission(item.permission) : true))
        .map((item) => ({
          key: item.key,
          icon: item.icon,
          label: t(item.labelKey),
        })),
    [hasPermission, t],
  );
  const adminMenuItems = useMemo<MenuProps['items']>(
    () =>
      menuConfig
        .filter((item) => item.section === 'admin')
        .filter((item) => (item.permission ? hasPermission(item.permission) : true))
        .map((item) => ({
          key: item.key,
          icon: item.icon,
          label: t(item.labelKey),
        })),
    [hasPermission, t],
  );
  const personalMenuItems = useMemo<MenuProps['items']>(
    () =>
      menuConfig
        .filter((item) => item.section === 'personal')
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
        <div className="sider-shell">
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
          <div className="sider-nav-shell">
            <div className="nav-menu-stack">
              {workspaceMenuItems && workspaceMenuItems.length > 0 ? (
                <div className="nav-menu-section">
                  <div className="nav-section-title">{sectionTitles.workspace}</div>
                  <div className="nav-menu-block">
                    <Menu
                      mode="inline"
                      selectedKeys={[selectedKey]}
                      items={workspaceMenuItems}
                      onClick={({ key }) => navigate(key)}
                      className="nav-menu nav-menu-primary"
                    />
                  </div>
                </div>
              ) : null}
              {adminMenuItems && adminMenuItems.length > 0 ? (
                <div className="nav-menu-section">
                  <div className="nav-section-title">{sectionTitles.admin}</div>
                  <div className="nav-menu-block">
                    <Menu
                      mode="inline"
                      selectedKeys={[selectedKey]}
                      items={adminMenuItems}
                      onClick={({ key }) => navigate(key)}
                      className="nav-menu nav-menu-primary"
                    />
                  </div>
                </div>
              ) : null}
            </div>
            <div className="nav-bottom-panel">
              {currentUser ? (
                <div className="nav-profile-card">
                  <div className="nav-profile-name">{currentUser.displayName}</div>
                  <div className="nav-profile-role">{t(roleKey(currentUser.role))}</div>
                  <div className="nav-profile-tools">
                    <Select
                      value={locale}
                      onChange={setLocale}
                      suffixIcon={<GlobalOutlined />}
                      options={[
                        { value: 'zh-CN', label: t('locale.zh-CN') },
                        { value: 'en-US', label: t('locale.en-US') },
                      ]}
                      className="nav-utility-select"
                    />
                    <Button
                      icon={<LogoutOutlined />}
                      onClick={() => void logout().then(() => navigate('/login'))}
                      className="nav-utility-button"
                    >
                      {t('common.logout')}
                    </Button>
                  </div>
                </div>
              ) : null}
              {personalMenuItems && personalMenuItems.length > 0 ? (
                <div className="nav-menu-section nav-menu-section-secondary">
                  <div className="nav-section-title">{sectionTitles.personal}</div>
                  <div className="nav-menu-block nav-menu-block-secondary">
                    <Menu
                      mode="inline"
                      selectedKeys={[selectedKey]}
                      items={personalMenuItems}
                      onClick={({ key }) => navigate(key)}
                      className="nav-menu nav-menu-secondary"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </Sider>
      <Layout>
        <Content className="app-content">
          <Suspense fallback={<RouteSpinner />}>
            <Routes>
              <Route path="/" element={<DashboardPage snapshot={snapshot} onRefresh={onRefresh} />} />
              <Route path="/datasets" element={<DatasetsPage snapshot={snapshot} onRefresh={onRefresh} />} />
              <Route path="/products" element={<ProductsPage />} />
              <Route path="/spatial" element={<SpatialStudioPage snapshot={snapshot} onRefresh={onRefresh} />} />
              <Route path="/assets" element={<PersonalAssetsPage snapshot={snapshot} onRefresh={onRefresh} />} />
              <Route path="/workflows" element={<WorkflowsPage snapshot={snapshot} onRefresh={onRefresh} />} />
              <Route
                path="/models"
                element={
                  <RequirePermission permission="model.view">
                    <ModelsPage snapshot={snapshot} onRefresh={onRefresh} />
                  </RequirePermission>
                }
              />
              <Route
                path="/approvals"
                element={<Navigate to="/admin/users" replace />}
              />
              <Route
                path="/admin/approvals"
                element={<Navigate to="/admin/users" replace />}
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
        includeAdminData: hasPermission('system.configure'),
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
