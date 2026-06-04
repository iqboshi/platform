import type { CadViewerModel, ModelRotation } from './product-viewer-runtime';

import {
  App,
  Button,
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
  DownloadOutlined,
  LoadingOutlined,
  ReloadOutlined,
  RotateRightOutlined,
} from '@ant-design/icons';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { isApiError } from '@/auth/errors';
import { useAuth } from '@/auth/useAuth';
import {
  downloadProductAsset,
  fetchProductAssetArrayBuffer,
  listProductAssets,
} from '@/lib/api';
import type { ProductAssetSummary } from '@platform/types';
import { useI18n } from '@/i18n/useI18n';
import { LayeredPanelCard } from '@/components/LayeredPanelCard';

const { Paragraph, Text, Title } = Typography;

const PRODUCT_COPY = {
  'zh-CN': {
    kicker: '公开产品展示',
    title: '浏览平台公开的硬件产品资产，并直接在页面中查看 3D 模型。',
    copy:
      '公开产品资产来自资产库，包括文件、简介、分类、亮点和规格信息。',
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
    accessibleCount: '可访问',
    visibilityPublic: '公开',
    visibilityPrivate: '私有',
    specificationsTitle: '规格参数',
    specificationsEmpty: '暂无规格参数。',
    tagsTitle: '标签',
    expandDetails: '展开详情',
    collapseDetails: '收起详情',
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
      'Upload a product in personal assets first, then publish it when it is ready for shared viewing.',
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
    accessibleCount: 'Accessible',
    visibilityPublic: 'Public',
    visibilityPrivate: 'Private',
    specificationsTitle: 'Specifications',
    specificationsEmpty: 'No specifications were provided.',
    tagsTitle: 'Tags',
    expandDetails: 'Expand details',
    collapseDetails: 'Collapse details',
  },
} as const;

type ProductViewerRuntime = typeof import('./product-viewer-runtime');

let productViewerRuntime: ProductViewerRuntime | null = null;
let productViewerRuntimePromise: Promise<ProductViewerRuntime> | null = null;

function loadProductViewerRuntime(): Promise<ProductViewerRuntime> {
  if (productViewerRuntime) {
    return Promise.resolve(productViewerRuntime);
  }
  if (!productViewerRuntimePromise) {
    productViewerRuntimePromise = import('./product-viewer-runtime').then((module) => {
      productViewerRuntime = module;
      return module;
    });
  }
  return productViewerRuntimePromise;
}

const ProductScene = lazy(() =>
  import('./product-viewer').then((module) => ({
    default: module.ProductScene,
  })),
);

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

function disposeViewerModel(model: CadViewerModel | null) {
  if (!model || !productViewerRuntime) {
    return;
  }
  productViewerRuntime.disposeCadViewerModel(model);
}

function isPrivateProduct(visibility: ProductAssetSummary['visibility'] | undefined): boolean {
  return visibility === 'private';
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
  const productCounts = useMemo(() => {
    const privateCount = products.filter((item) => isPrivateProduct(item.visibility)).length;
    return {
      total: products.length,
      privateCount,
      publicCount: products.length - privateCount,
    };
  }, [products]);
  const activeHighlights = activeProduct?.highlights ?? [];
  const highlightPreview = activeHighlights.slice(0, 2);
  const activeSpecifications = useMemo(
    () => Object.entries(activeProduct?.specifications ?? {}),
    [activeProduct?.specifications],
  );
  const specificationPreview = activeSpecifications.slice(0, 3);
  const activeVisibilityLabel = activeProduct
    ? isPrivateProduct(activeProduct.visibility)
      ? copy.visibilityPrivate
      : copy.visibilityPublic
    : null;

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
        const [payload, viewerRuntime] = await Promise.all([
          fetchProductAssetArrayBuffer(token, product.id),
          loadProductViewerRuntime(),
        ]);
        const resolvedFileName = payload.fileName || product.originalFileName;
        const nextModel = await viewerRuntime.loadCadViewerModel(
          resolvedFileName,
          payload.sizeBytes,
          payload.buffer,
        );
        if (loadSequenceRef.current !== requestId) {
          viewerRuntime.disposeCadViewerModel(nextModel);
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
    if (products.length > 0) {
      void loadProductViewerRuntime();
    }
  }, [products.length]);

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

  const renderVisibilityTag = useCallback(
    (visibility: ProductAssetSummary['visibility'] | undefined) => (
      <Tag color={isPrivateProduct(visibility) ? 'default' : 'blue'}>
        {isPrivateProduct(visibility) ? copy.visibilityPrivate : copy.visibilityPublic}
      </Tag>
    ),
    [copy.visibilityPrivate, copy.visibilityPublic],
  );

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
          <LayeredPanelCard
            className="product-panel-card"
            kicker={copy.libraryTitle}
            title={copy.libraryTitle}
            summary={
              <div className="product-library-summary-stack">
                <Paragraph className="section-copy">{copy.libraryCopy}</Paragraph>
                <div className="product-library-metrics">
                  <div className="product-summary-chip">
                    <Text type="secondary">{copy.accessibleCount}</Text>
                    <Title level={4}>{productCounts.total}</Title>
                  </div>
                  <div className="product-summary-chip">
                    <Text type="secondary">{copy.visibilityPublic}</Text>
                    <Title level={4}>{productCounts.publicCount}</Title>
                  </div>
                  <div className="product-summary-chip">
                    <Text type="secondary">{copy.visibilityPrivate}</Text>
                    <Title level={4}>{productCounts.privateCount}</Title>
                  </div>
                </div>
              </div>
            }
            extra={
              <Button
                icon={<ReloadOutlined />}
                onClick={() => void refreshProducts()}
                loading={libraryLoading}
              >
                {copy.refreshLibrary}
              </Button>
            }
            defaultExpanded
            expandLabel={copy.expandDetails}
            collapseLabel={copy.collapseDetails}
          >
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
                        {renderVisibilityTag(product.visibility)}
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
          </LayeredPanelCard>
        </Col>

        <Col xs={24} xl={15}>
          <div className="product-page-stack">
            <LayeredPanelCard
              className="product-panel-card product-viewer-card"
              kicker={copy.viewerTitle}
              title={activeProduct?.name ?? copy.viewerTitle}
              summary={
                <div className="product-viewer-summary">
                  <Paragraph className="section-copy">{copy.viewerCopy}</Paragraph>
                  {activeProduct ? (
                    <Space wrap size={[8, 8]}>
                      {renderVisibilityTag(activeProduct.visibility)}
                      {activeProduct.ownerDisplayName ? <Tag>{activeProduct.ownerDisplayName}</Tag> : null}
                      {activeProduct.category ? <Tag>{activeProduct.category}</Tag> : null}
                    </Space>
                  ) : null}
                  <div className="product-viewer-stage">
                    {modelLoading ? (
                      <div className="product-viewer-loading">
                        <Spin indicator={<LoadingOutlined spin />} size="large" />
                      </div>
                    ) : viewerModel ? (
                      <Suspense
                        fallback={
                          <div className="product-viewer-loading">
                            <Spin indicator={<LoadingOutlined spin />} size="large" />
                          </div>
                        }
                      >
                        <ProductScene
                          key={viewerRevision}
                          model={viewerModel}
                          autoRotate={autoRotate}
                          rotation={modelRotation}
                        />
                      </Suspense>
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
                </div>
              }
              extra={
                <Space wrap>
                  <div className="product-viewer-toggle">
                    <RotateRightOutlined />
                    <span>{copy.autoRotate}</span>
                    <Switch checked={autoRotate} onChange={setAutoRotate} disabled={!activeProduct} />
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
              }
              expandLabel={copy.expandDetails}
              collapseLabel={copy.collapseDetails}
            >
              {activeProduct ? (
                <div className="product-orientation-panel">
                  <Text type="secondary">{copy.orientation}</Text>
                  <Space wrap size={[8, 8]}>
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
                </div>
              ) : null}
            </LayeredPanelCard>

            <div className="product-detail-grid">
              <LayeredPanelCard
                className="product-detail-card"
                kicker={activeProduct?.category || copy.productDetails}
                title={copy.productDetails}
                summary={
                  activeProduct ? (
                    <div className="product-detail-summary">
                      <Paragraph className="product-detail-description">
                        {activeProduct.description || copy.noDetails}
                      </Paragraph>
                      <Space wrap size={[8, 8]}>
                        {activeVisibilityLabel ? (
                          <Tag color={isPrivateProduct(activeProduct.visibility) ? 'default' : 'blue'}>
                            {activeVisibilityLabel}
                          </Tag>
                        ) : null}
                        {activeProduct.ownerDisplayName ? <Tag>{activeProduct.ownerDisplayName}</Tag> : null}
                        {(activeProduct.tags ?? []).map((tag) => (
                          <Tag key={`${activeProduct.id}-${tag}`}>{tag}</Tag>
                        ))}
                      </Space>
                    </div>
                  ) : (
                    <Text type="secondary">{copy.noDetails}</Text>
                  )
                }
                defaultExpanded
                expandLabel={copy.expandDetails}
                collapseLabel={copy.collapseDetails}
              >
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
                        children: activeVisibilityLabel ?? '-',
                      },
                      {
                        key: 'updatedAt',
                        label: copy.updatedAt,
                        children: formatDateTime(locale, activeProduct.updatedAt),
                      },
                      {
                        key: 'tags',
                        label: copy.tagsTitle,
                        children:
                          activeProduct.tags?.length ? (
                            <Space wrap size={[8, 8]}>
                              {activeProduct.tags.map((tag) => (
                                <Tag key={`${activeProduct.id}-detail-${tag}`}>{tag}</Tag>
                              ))}
                            </Space>
                          ) : (
                            '-'
                          ),
                      },
                    ]}
                  />
                ) : (
                  <Text type="secondary">{copy.noDetails}</Text>
                )}
              </LayeredPanelCard>

              <LayeredPanelCard
                className="product-detail-card"
                kicker={copy.fileDetails}
                title={copy.fileDetails}
                summary={
                  activeProduct ? (
                    <div className="product-file-stat-grid">
                      <div className="product-file-stat">
                        <Text type="secondary">{copy.fileSize}</Text>
                        <strong>{formatBytes(activeProduct.sizeBytes)}</strong>
                      </div>
                      <div className="product-file-stat">
                        <Text type="secondary">{copy.meshCount}</Text>
                        <strong>{viewerModel?.meshCount?.toLocaleString() ?? '-'}</strong>
                      </div>
                      <div className="product-file-stat">
                        <Text type="secondary">{copy.triangleCount}</Text>
                        <strong>{viewerModel?.triangleCount?.toLocaleString() ?? '-'}</strong>
                      </div>
                    </div>
                  ) : (
                    <Text type="secondary">{copy.noDetails}</Text>
                  )
                }
                expandLabel={copy.expandDetails}
                collapseLabel={copy.collapseDetails}
              >
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
              </LayeredPanelCard>

              <LayeredPanelCard
                className="product-detail-card"
                kicker={copy.highlightsTitle}
                title={copy.highlightsTitle}
                summary={
                  highlightPreview.length ? (
                    <div className="product-highlight-list product-highlight-list-compact">
                      {highlightPreview.map((item) => (
                        <div key={item} className="product-highlight-item">
                          <span className="product-highlight-dot" />
                          <span>{item}</span>
                        </div>
                      ))}
                      {activeHighlights.length > highlightPreview.length ? (
                        <Text type="secondary">{`+${activeHighlights.length - highlightPreview.length}`}</Text>
                      ) : null}
                    </div>
                  ) : (
                    <Text type="secondary">{copy.noDetails}</Text>
                  )
                }
                expandLabel={copy.expandDetails}
                collapseLabel={copy.collapseDetails}
              >
                {activeHighlights.length ? (
                  <div className="product-highlight-list">
                    {activeHighlights.map((item) => (
                      <div key={item} className="product-highlight-item">
                        <span className="product-highlight-dot" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Text type="secondary">{copy.noDetails}</Text>
                )}
              </LayeredPanelCard>

              <LayeredPanelCard
                className="product-detail-card"
                kicker={copy.specificationsTitle}
                title={copy.specificationsTitle}
                summary={
                  specificationPreview.length ? (
                    <div className="product-spec-preview-list">
                      {specificationPreview.map(([label, value]) => (
                        <div key={label} className="product-spec-preview-item">
                          <Text type="secondary">{label}</Text>
                          <strong>{value}</strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Text type="secondary">{copy.specificationsEmpty}</Text>
                  )
                }
                expandLabel={copy.expandDetails}
                collapseLabel={copy.collapseDetails}
              >
                {activeSpecifications.length ? (
                  <Descriptions
                    size="small"
                    column={1}
                    items={activeSpecifications.map(([label, value]) => ({
                      key: label,
                      label,
                      children: value,
                    }))}
                  />
                ) : (
                  <Text type="secondary">{copy.specificationsEmpty}</Text>
                )}
              </LayeredPanelCard>
            </div>
          </div>
        </Col>
      </Row>
    </div>
  );
}
