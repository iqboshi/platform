import type { MenuProps } from 'antd';
import type { PlatformDataSnapshot } from './lib/api';

import {
  AppstoreOutlined,
  DeploymentUnitOutlined,
  FolderOpenOutlined,
  RadarChartOutlined,
} from '@ant-design/icons';
import { ConfigProvider, Layout, Menu, Spin, Tag, Typography } from 'antd';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import { loadPlatformData } from './lib/api';

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

const { Header, Content, Sider } = Layout;
const { Title, Paragraph } = Typography;

const menuItems: MenuProps['items'] = [
  { key: '/', icon: <AppstoreOutlined />, label: 'Overview' },
  { key: '/datasets', icon: <FolderOpenOutlined />, label: 'Datasets' },
  { key: '/workflows', icon: <DeploymentUnitOutlined />, label: 'Workflows' },
  { key: '/models', icon: <RadarChartOutlined />, label: 'Models' },
];

function routeKey(pathname: string): string {
  if (pathname.startsWith('/datasets')) return '/datasets';
  if (pathname.startsWith('/workflows')) return '/workflows';
  if (pathname.startsWith('/models')) return '/models';
  return '/';
}

function AppShell({ snapshot }: { snapshot: PlatformDataSnapshot }) {
  const navigate = useNavigate();
  const location = useLocation();

  const selectedKey = useMemo(() => routeKey(location.pathname), [location.pathname]);

  return (
    <Layout className="app-shell">
      <Sider breakpoint="lg" collapsedWidth="0" width={280} className="app-sider">
        <div className="brand-panel">
          <div className="brand-kicker">Remote Sensing Studio</div>
          <Title level={3} className="brand-title">
            {snapshot.workspace.name}
          </Title>
          <Paragraph className="brand-copy">{snapshot.workspace.description}</Paragraph>
          <Tag color={snapshot.source === 'api' ? 'green' : 'gold'}>
            Data Source: {snapshot.source.toUpperCase()}
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
            <div className="header-eyebrow">Workspace</div>
            <Title level={2} className="header-title">
              {snapshot.workspace.name}
            </Title>
          </div>
          <div className="header-meta">
            <span>{snapshot.workspace.memberCount} members</span>
            <span>{snapshot.datasets.length} datasets</span>
            <span>{snapshot.workflowRuns.length} runs</span>
          </div>
        </Header>
        <Content className="app-content">
          <Suspense
            fallback={
              <div className="page-fallback">
                <Spin />
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<DashboardPage snapshot={snapshot} />} />
              <Route path="/datasets" element={<DatasetsPage snapshot={snapshot} />} />
              <Route path="/workflows" element={<WorkflowsPage snapshot={snapshot} />} />
              <Route path="/models" element={<ModelsPage snapshot={snapshot} />} />
            </Routes>
          </Suspense>
        </Content>
      </Layout>
    </Layout>
  );
}

export default function App() {
  const [snapshot, setSnapshot] = useState<PlatformDataSnapshot | null>(null);

  useEffect(() => {
    loadPlatformData().then(setSnapshot);
  }, []);

  if (!snapshot) {
    return (
      <div className="loading-screen">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#0f766e',
          borderRadius: 18,
          fontFamily: "'Aptos', 'Trebuchet MS', 'Segoe UI', sans-serif",
        },
      }}
    >
      <AppShell snapshot={snapshot} />
    </ConfigProvider>
  );
}
