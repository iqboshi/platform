import type {
  OcctMeshData,
  OcctModule,
  OcctReadParams,
  OcctReadResult,
} from 'occt-import-js';

import {
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Row,
  Space,
  Spin,
  Switch,
  Tag,
  Typography,
} from 'antd';
import {
  BuildOutlined,
  DownloadOutlined,
  LoadingOutlined,
  ReloadOutlined,
  RotateRightOutlined,
} from '@ant-design/icons';
import { Bounds, Center, ContactShadows, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import occtimportjs from 'occt-import-js';
import occtWasmUrl from 'occt-import-js/dist/occt-import-js.wasm?url';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import { isApiError } from '@/auth/errors';
import { useAuth } from '@/auth/useAuth';
import {
  downloadProductAsset,
  fetchProductAssetArrayBuffer,
  listProductAssets,
} from '@/lib/api';
import type { ProductAssetSummary } from '@platform/types';
import { useI18n } from '@/i18n/useI18n';

const { Paragraph, Text, Title } = Typography;

type ViewerMesh = {
  key: string;
  geometry: THREE.BufferGeometry;
  material: THREE.MeshPhysicalMaterial;
};

type CadViewerModel = {
  sourceName: string;
  fileSize: number;
  meshCount: number;
  triangleCount: number;
  meshes: ViewerMesh[];
};

type ModelRotation = {
  x: number;
  y: number;
  z: number;
};

const PRODUCT_COPY = {
  'zh-CN': {
    kicker: '公开产品展示',
    title: '浏览平台公开的硬件产品资产，并直接在页面中查看 3D 模型。',
    copy:
      '这里展示的是已经被管理员设为公开的产品资产。产品的文件、简介、分类、亮点和规格都来自资产库本身，展示页不再使用本地演示数据。',
    libraryTitle: '公开产品库',
    libraryCopy: '点击左侧产品卡片即可加载对应的公开模型，右侧会自动聚焦并进行缓慢旋转。',
    viewerTitle: '3D 查看器',
    viewerCopy: '支持拖拽旋转、滚轮缩放和自动旋转。模型解析与渲染都在浏览器中完成。',
    activeProduct: '当前产品',
    publicProduct: '公开产品',
    autoRotate: '自动旋转',
    orientation: '姿态校正',
    rotateX: 'X +90°',
    rotateY: 'Y +90°',
    rotateZ: 'Z +90°',
    flipModel: '翻转 180°',
    resetOrientation: '重置姿态',
    reloadModel: '重新加载',
    refreshLibrary: '刷新产品库',
    downloadModel: '下载模型',
    emptyLibrary: '当前还没有公开产品资产。',
    emptyLibraryCopy: '请先在个人资产中上传产品，并由管理员将其设为公开。',
    viewerEmpty: '还没有可显示的产品模型',
    viewerEmptyCopy: '从左侧选择一个公开产品后，这里会显示对应的 3D 模型。',
    productDetails: '产品详情',
    highlightsTitle: '产品亮点',
    fileDetails: '文件信息',
    category: '分类',
    owner: '所有者',
    visibility: '可见性',
    originalFileName: '原始文件名',
    updatedAt: '更新时间',
    fileSize: '文件大小',
    meshCount: '网格数量',
    triangleCount: '三角面数',
    parser: '解析方式',
    parserValue: '浏览器端 STEP/IGES 解析',
    noDetails: '暂无产品详情。',
    unsupported: '仅支持 STP / STEP / IGS / IGES 文件。',
    loadFailed: '产品模型加载失败，请检查文件内容或稍后重试。',
    listLoadFailed: '公开产品列表加载失败，请稍后重试。',
    visibilityPublic: '公开',
  },
  'en-US': {
    kicker: 'Product Showcase',
    title: 'Browse accessible hardware product assets and inspect their 3D models directly in the page.',
    copy:
      'This page shows product assets the current user can access: the user’s own private products plus all public products. Files, descriptions, categories, highlights, and specifications are all sourced from the asset library itself.',
    libraryTitle: 'Product Library',
    libraryCopy: 'Select a product card to load its model. The viewer will fit the geometry and rotate it slowly.',
    viewerTitle: '3D Viewer',
    viewerCopy: 'Drag to rotate, zoom with the wheel, and keep a slow auto-rotation when idle.',
    activeProduct: 'Active product',
    publicProduct: 'Public asset',
    privateProduct: 'Private asset',
    autoRotate: 'Auto rotate',
    orientation: 'Orientation',
    rotateX: 'X +90°',
    rotateY: 'Y +90°',
    rotateZ: 'Z +90°',
    flipModel: 'Flip 180°',
    resetOrientation: 'Reset orientation',
    reloadModel: 'Reload model',
    refreshLibrary: 'Refresh library',
    downloadModel: 'Download model',
    emptyLibrary: 'No accessible product assets are available yet.',
    emptyLibraryCopy:
      'Upload a product in personal assets first. If others should see it, let an administrator publish it.',
    viewerEmpty: 'No product model is currently loaded',
    viewerEmptyCopy: 'Pick a public product on the left to load its 3D model here.',
    productDetails: 'Product Details',
    highlightsTitle: 'Highlights',
    fileDetails: 'File Details',
    category: 'Category',
    owner: 'Owner',
    visibility: 'Visibility',
    originalFileName: 'Original file',
    updatedAt: 'Updated at',
    fileSize: 'File size',
    meshCount: 'Mesh count',
    triangleCount: 'Triangles',
    parser: 'Parser',
    parserValue: 'In-browser STEP/IGES parser',
    noDetails: 'No product details are available.',
    unsupported: 'Only STP / STEP / IGS / IGES files are supported.',
    loadFailed: 'Failed to load the product model. Check the file contents or try again later.',
    listLoadFailed: 'Failed to load public products. Please try again later.',
    visibilityPublic: 'Public',
    visibilityPrivate: 'Private',
  },
} as const;

const triangulationParams: OcctReadParams = {
  linearUnit: 'millimeter',
  linearDeflectionType: 'bounding_box_ratio',
  linearDeflection: 0.0015,
  angularDeflection: 0.35,
};

let occtModulePromise: Promise<OcctModule> | null = null;

function formatBytes(value: number): string {
  if (value <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  const size = value / 1024 ** exponent;
  return `${size >= 100 ? size.toFixed(0) : size.toFixed(1)} ${units[exponent]}`;
}

function isSupportedCadFile(fileName: string): boolean {
  const extension = fileName.split('.').pop()?.toLowerCase();
  return extension !== undefined && ['stp', 'step', 'igs', 'iges'].includes(extension);
}

function formatDateTime(locale: string, value: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function getCadReader(module: OcctModule, fileName: string) {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension === 'igs' || extension === 'iges') {
    return module.ReadIgesFile.bind(module);
  }
  return module.ReadStepFile.bind(module);
}

function buildMeshColor(mesh: OcctMeshData): THREE.Color {
  const fallback = new THREE.Color('#c8d6f5');
  if (!mesh.color || mesh.color.length !== 3) {
    return fallback;
  }
  const normalized = mesh.color.map((value) => (value > 1 ? value / 255 : value));
  return new THREE.Color(
    normalized[0] ?? 0.78,
    normalized[1] ?? 0.84,
    normalized[2] ?? 0.96,
  );
}

function createThreeMesh(mesh: OcctMeshData, index: number): ViewerMesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(mesh.attributes.position.array), 3),
  );
  if (mesh.attributes.normal?.array) {
    geometry.setAttribute(
      'normal',
      new THREE.BufferAttribute(new Float32Array(mesh.attributes.normal.array), 3),
    );
  } else {
    geometry.computeVertexNormals();
  }
  if (mesh.index?.array && mesh.index.array.length > 0) {
    geometry.setIndex(mesh.index.array);
  }
  geometry.computeBoundingSphere();

  const material = new THREE.MeshPhysicalMaterial({
    color: buildMeshColor(mesh),
    metalness: 0.22,
    roughness: 0.34,
    clearcoat: 0.16,
    clearcoatRoughness: 0.28,
  });

  return {
    key: mesh.name || `mesh-${index}`,
    geometry,
    material,
  };
}

function createViewerModel(
  sourceName: string,
  fileSize: number,
  result: OcctReadResult,
): CadViewerModel {
  const meshes = result.meshes.map((mesh, index) => createThreeMesh(mesh, index));
  const triangleCount = result.meshes.reduce((total, mesh) => {
    if (mesh.index?.array?.length) {
      return total + Math.floor(mesh.index.array.length / 3);
    }
    return total + Math.floor(mesh.attributes.position.array.length / 9);
  }, 0);

  return {
    sourceName,
    fileSize,
    meshCount: meshes.length,
    triangleCount,
    meshes,
  };
}

function disposeViewerModel(model: CadViewerModel | null) {
  if (!model) {
    return;
  }
  for (const mesh of model.meshes) {
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
}

async function getOcctModule(): Promise<OcctModule> {
  if (!occtModulePromise) {
    occtModulePromise = occtimportjs({
      locateFile: (path) => (path.endsWith('.wasm') ? occtWasmUrl : path),
    });
  }
  return occtModulePromise;
}

async function parseCadBuffer(
  sourceName: string,
  fileSize: number,
  buffer: ArrayBuffer,
): Promise<CadViewerModel> {
  if (!isSupportedCadFile(sourceName)) {
    throw new Error('unsupported');
  }
  const module = await getOcctModule();
  const read = getCadReader(module, sourceName);
  const result = read(new Uint8Array(buffer), triangulationParams);
  if (!result.success || result.meshes.length === 0) {
    throw new Error('parse_failed');
  }
  return createViewerModel(sourceName, fileSize, result);
}

function ProductScene({
  model,
  autoRotate,
  rotation,
}: {
  model: CadViewerModel;
  autoRotate: boolean;
  rotation: ModelRotation;
}) {
  return (
    <Canvas
      className="product-canvas"
      camera={{ position: [8, 6, 8], fov: 34 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={1.5} />
      <directionalLight position={[12, 10, 8]} intensity={2.2} />
      <directionalLight position={[-10, -8, -6]} intensity={0.8} />
      <hemisphereLight args={['#ffffff', '#dbe6ff', 0.9]} />
      <Bounds fit clip observe margin={1.16}>
        <Center>
          <group rotation={[rotation.x, rotation.y, rotation.z]}>
            {model.meshes.map((mesh) => (
              <mesh
                key={mesh.key}
                geometry={mesh.geometry}
                material={mesh.material}
                castShadow
                receiveShadow
              />
            ))}
          </group>
        </Center>
      </Bounds>
      <ContactShadows position={[0, -1.6, 0]} opacity={0.24} scale={26} blur={2.5} />
      <OrbitControls
        makeDefault
        enablePan
        enableZoom
        enableDamping
        autoRotate={autoRotate}
        autoRotateSpeed={0.65}
        minDistance={1.8}
        maxDistance={32}
      />
    </Canvas>
  );
}

export function ProductsPage() {
  const { message } = App.useApp();
  const { token } = useAuth();
  const { locale } = useI18n();
  const normalizedLocale = locale === 'zh-CN' ? 'zh-CN' : 'en-US';
  const copy = PRODUCT_COPY[normalizedLocale];
  const [products, setProducts] = useState<ProductAssetSummary[]>([]);
  const [activeProductId, setActiveProductId] = useState('');
  const [autoRotate, setAutoRotate] = useState(true);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewerModel, setViewerModel] = useState<CadViewerModel | null>(null);
  const [viewerRevision, setViewerRevision] = useState(0);
  const [modelRotation, setModelRotation] = useState<ModelRotation>({
    x: 0,
    y: 0,
    z: 0,
  });
  const modelRef = useRef<CadViewerModel | null>(null);
  const loadSequenceRef = useRef(0);

  const activeProduct = useMemo(
    () =>
      products.find((item) => item.id === activeProductId) ??
      products[0] ??
      null,
    [activeProductId, products],
  );

  const replaceViewerModel = useCallback((nextModel: CadViewerModel | null) => {
    setViewerModel((previous) => {
      disposeViewerModel(previous);
      return nextModel;
    });
    modelRef.current = nextModel;
    setViewerRevision((value) => value + 1);
  }, []);

  const rotateModel = useCallback((axis: keyof ModelRotation, delta: number) => {
    setModelRotation((current) => ({
      ...current,
      [axis]: current[axis] + delta,
    }));
  }, []);

  const resetModelRotation = useCallback(() => {
    setModelRotation({ x: 0, y: 0, z: 0 });
  }, []);

  const refreshProducts = useCallback(async () => {
    if (!token) {
      return;
    }

    try {
      setLibraryLoading(true);
      const payload = await listProductAssets(token, 'visible');
      setProducts(payload);
      setActiveProductId((current) =>
        current && payload.some((item) => item.id === current)
          ? current
          : (payload[0]?.id ?? ''),
      );
    } catch (error) {
      message.error(isApiError(error) ? error.message : copy.listLoadFailed);
    } finally {
      setLibraryLoading(false);
    }
  }, [copy.listLoadFailed, message, token]);

  const loadProductModel = useCallback(
    async (product: ProductAssetSummary) => {
      if (!token) {
        return;
      }

      const requestId = loadSequenceRef.current + 1;
      loadSequenceRef.current = requestId;
      setModelLoading(true);
      setLoadError(null);

      try {
        const payload = await fetchProductAssetArrayBuffer(token, product.id);
        const resolvedFileName = isSupportedCadFile(payload.fileName)
          ? payload.fileName
          : product.originalFileName;
        const nextModel = await parseCadBuffer(
          resolvedFileName,
          payload.sizeBytes,
          payload.buffer,
        );
        if (loadSequenceRef.current !== requestId) {
          disposeViewerModel(nextModel);
          return;
        }
        replaceViewerModel(nextModel);
      } catch (error) {
        if (loadSequenceRef.current === requestId) {
          const isUnsupported =
            error instanceof Error && error.message === 'unsupported';
          setLoadError(
            isUnsupported
              ? copy.unsupported
              : isApiError(error)
                ? error.message
                : copy.loadFailed,
          );
          replaceViewerModel(null);
        }
      } finally {
        if (loadSequenceRef.current === requestId) {
          setModelLoading(false);
        }
      }
    },
    [copy.loadFailed, copy.unsupported, replaceViewerModel, token],
  );

  useEffect(() => {
    void refreshProducts();
  }, [refreshProducts]);

  useEffect(() => {
    if (!activeProduct) {
      setLoadError(null);
      replaceViewerModel(null);
      return;
    }
    resetModelRotation();
    void loadProductModel(activeProduct);
  }, [activeProduct, loadProductModel, replaceViewerModel, resetModelRotation]);

  useEffect(
    () => () => {
      loadSequenceRef.current += 1;
      disposeViewerModel(modelRef.current);
    },
    [],
  );

  const handleDownload = useCallback(() => {
    if (!token || !activeProduct) {
      return;
    }
    void downloadProductAsset(token, activeProduct.id, activeProduct.originalFileName).catch(
      (error) => {
        message.error(isApiError(error) ? error.message : copy.loadFailed);
      },
    );
  }, [activeProduct, copy.loadFailed, message, token]);

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div className="hero-kicker">{copy.kicker}</div>
        <Title className="hero-title">{copy.title}</Title>
        <Paragraph className="hero-copy">{copy.copy}</Paragraph>
        <Space wrap size={[10, 10]}>
          <Tag color="blue">{copy.publicProduct}</Tag>
          <Tag color="cyan">STP / STEP / IGES</Tag>
          <Tag color="green">Browser 3D</Tag>
        </Space>
      </section>

      <Row gutter={[20, 20]} align="stretch">
        <Col xs={24} xl={9}>
          <Card className="panel-card product-panel-card" variant="borderless">
            <div className="panel-kicker">{copy.libraryTitle}</div>
            <Title level={3} className="section-title">
              {copy.libraryTitle}
            </Title>
            <Paragraph className="section-copy">{copy.libraryCopy}</Paragraph>
            <div className="section-actions">
              <Button
                icon={<ReloadOutlined />}
                onClick={() => void refreshProducts()}
                loading={libraryLoading}
              >
                {copy.refreshLibrary}
              </Button>
            </div>
            {products.length ? (
              <div className="product-library-list">
                {products.map((product) => {
                  const isActive = product.id === activeProduct?.id;
                  return (
                    <button
                      key={product.id}
                      type="button"
                      className={`product-library-card${
                        isActive ? ' product-library-card-active' : ''
                      }`}
                      onClick={() => setActiveProductId(product.id)}
                    >
                      <div className="product-library-card-head">
                        <div>
                          <Text className="product-library-category">
                            {product.category || copy.category}
                          </Text>
                          <Title level={5} className="product-library-name">
                            {product.name}
                          </Title>
                        </div>
                        {isActive ? <Tag color="blue">{copy.activeProduct}</Tag> : null}
                      </div>
                      <Paragraph className="product-library-summary">
                        {product.description || copy.noDetails}
                      </Paragraph>
                      <Space wrap size={[8, 8]}>
                        <Tag>{copy.visibilityPublic}</Tag>
                        {product.ownerDisplayName ? <Tag>{product.ownerDisplayName}</Tag> : null}
                        {(product.tags ?? []).map((tag) => (
                          <Tag key={`${product.id}-${tag}`}>{tag}</Tag>
                        ))}
                      </Space>
                    </button>
                  );
                })}
              </div>
            ) : (
              <Empty
                description={
                  <div>
                    <div>{copy.emptyLibrary}</div>
                    <Text type="secondary">{copy.emptyLibraryCopy}</Text>
                  </div>
                }
              />
            )}
          </Card>
        </Col>

        <Col xs={24} xl={15}>
          <Card className="panel-card product-panel-card" variant="borderless">
            <div className="product-viewer-head">
              <div>
                <div className="panel-kicker">{copy.viewerTitle}</div>
                <Title level={3} className="section-title">
                  {activeProduct?.name ?? copy.viewerTitle}
                </Title>
                <Paragraph className="section-copy">{copy.viewerCopy}</Paragraph>
              </div>
              <Space wrap>
                {activeProduct ? (
                  <Tag icon={<BuildOutlined />}>{copy.publicProduct}</Tag>
                ) : null}
                <div className="product-viewer-toggle">
                  <RotateRightOutlined />
                  <span>{copy.autoRotate}</span>
                  <Switch checked={autoRotate} onChange={setAutoRotate} />
                </div>
                {activeProduct ? (
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={() => void loadProductModel(activeProduct)}
                    loading={modelLoading}
                  >
                    {copy.reloadModel}
                  </Button>
                ) : null}
                {activeProduct ? (
                  <Button icon={<DownloadOutlined />} onClick={handleDownload}>
                    {copy.downloadModel}
                  </Button>
                ) : null}
              </Space>
            </div>

            <div className="product-viewer-stage">
              {modelLoading ? (
                <div className="product-viewer-loading">
                  <Spin indicator={<LoadingOutlined spin />} size="large" />
                </div>
              ) : viewerModel ? (
                <ProductScene
                  key={viewerRevision}
                  model={viewerModel}
                  autoRotate={autoRotate}
                  rotation={modelRotation}
                />
              ) : (
                <Empty
                  description={
                    <div>
                      <div>{copy.viewerEmpty}</div>
                      <Text type="secondary">{copy.viewerEmptyCopy}</Text>
                    </div>
                  }
                />
              )}
            </div>

            {loadError ? <div className="product-error-banner">{loadError}</div> : null}

            {activeProduct ? (
              <Space wrap size={[8, 8]}>
                <Text type="secondary">{copy.orientation}</Text>
                <Button size="small" onClick={() => rotateModel('x', Math.PI / 2)}>
                  {copy.rotateX}
                </Button>
                <Button size="small" onClick={() => rotateModel('y', Math.PI / 2)}>
                  {copy.rotateY}
                </Button>
                <Button size="small" onClick={() => rotateModel('z', Math.PI / 2)}>
                  {copy.rotateZ}
                </Button>
                <Button size="small" onClick={() => rotateModel('x', Math.PI)}>
                  {copy.flipModel}
                </Button>
                <Button size="small" onClick={resetModelRotation}>
                  {copy.resetOrientation}
                </Button>
              </Space>
            ) : null}

            <div className="product-meta-grid">
              <Card className="panel-card product-meta-card" variant="borderless">
                <Title level={5}>{copy.productDetails}</Title>
                {activeProduct ? (
                  <Descriptions
                    size="small"
                    column={1}
                    items={[
                      {
                        key: 'category',
                        label: copy.category,
                        children: activeProduct.category || '-',
                      },
                      {
                        key: 'owner',
                        label: copy.owner,
                        children: activeProduct.ownerDisplayName || '-',
                      },
                      {
                        key: 'visibility',
                        label: copy.visibility,
                        children: copy.visibilityPublic,
                      },
                      {
                        key: 'updatedAt',
                        label: copy.updatedAt,
                        children: formatDateTime(locale, activeProduct.updatedAt),
                      },
                    ]}
                  />
                ) : (
                  <Text type="secondary">{copy.noDetails}</Text>
                )}
              </Card>

              <Card className="panel-card product-meta-card" variant="borderless">
                <Title level={5}>{copy.highlightsTitle}</Title>
                {activeProduct?.highlights?.length ? (
                  <div className="product-highlight-list">
                    {activeProduct.highlights.map((item) => (
                      <div key={item} className="product-highlight-item">
                        <span className="product-highlight-dot" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Text type="secondary">{copy.noDetails}</Text>
                )}
              </Card>
            </div>

            <Card className="panel-card product-meta-card" variant="borderless">
              <Title level={5}>{copy.fileDetails}</Title>
              {activeProduct ? (
                <Descriptions
                  size="small"
                  column={2}
                  items={[
                    {
                      key: 'originalFileName',
                      label: copy.originalFileName,
                      children: activeProduct.originalFileName,
                    },
                    {
                      key: 'fileSize',
                      label: copy.fileSize,
                      children: formatBytes(activeProduct.sizeBytes),
                    },
                    {
                      key: 'meshCount',
                      label: copy.meshCount,
                      children: viewerModel?.meshCount?.toLocaleString() ?? '-',
                    },
                    {
                      key: 'triangleCount',
                      label: copy.triangleCount,
                      children: viewerModel?.triangleCount?.toLocaleString() ?? '-',
                    },
                    {
                      key: 'parser',
                      label: copy.parser,
                      children: copy.parserValue,
                    },
                  ]}
                />
              ) : (
                <Text type="secondary">{copy.noDetails}</Text>
              )}
            </Card>

            <Card className="panel-card product-meta-card" variant="borderless">
              <Title level={5}>{copy.productDetails}</Title>
              {activeProduct ? (
                <>
                  <Paragraph>{activeProduct.description || copy.noDetails}</Paragraph>
                  {Object.keys(activeProduct.specifications ?? {}).length ? (
                    <Descriptions
                      size="small"
                      column={1}
                      items={Object.entries(activeProduct.specifications ?? {}).map(
                        ([label, value]) => ({
                          key: label,
                          label,
                          children: value,
                        }),
                      )}
                    />
                  ) : (
                    <Text type="secondary">{copy.noDetails}</Text>
                  )}
                </>
              ) : (
                <Text type="secondary">{copy.noDetails}</Text>
              )}
            </Card>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
