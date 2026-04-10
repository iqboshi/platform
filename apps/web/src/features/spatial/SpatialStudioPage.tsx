import type { PlatformDataSnapshot } from '@/lib/api';
import type { AssetScope, SpatialOverlaySummary, SpatialRoiSummary } from '@platform/types';

import {
  App,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  Segmented,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/auth/useAuth';
import {
  SpatialMapCanvas,
  type SpatialDraftGeometry,
  type SpatialMapFocusRequest,
} from '@/components/SpatialMapCanvas';
import {
  listMapBaseLayerOptions,
  persistMapBaseLayer,
  readStoredMapBaseLayer,
  type MapBaseLayerKey,
} from '@/components/map-base-layers';
import { StatCard } from '@/components/StatCard';
import { useI18n } from '@/i18n/useI18n';
import {
  createSpatialOverlay,
  createSpatialRoi,
  deleteSpatialOverlay,
  deleteSpatialRoi,
  listDatasetVersions,
  listDatasets,
  listSpatialOverlays,
  listSpatialRois,
  updateSpatialOverlay,
  updateSpatialRoi,
} from '@/lib/api';
import { isApiError } from '@/auth/errors';
import { datasetKindKey } from '@/lib/i18n-helpers';

const { Paragraph } = Typography;

interface RoiFormValues {
  name: string;
  description?: string;
  tagsText?: string;
}

interface OverlayFormValues {
  datasetVersionId: string;
  name: string;
  description?: string;
  opacity: number;
}

interface SavedCoordinatePoint {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  createdAt: number;
}

interface CoordinateHistoryItem {
  id: string;
  longitude: number;
  latitude: number;
  createdAt: number;
}

const MAX_COORDINATE_HISTORY = 24;

function parseTags(tagsText: string | undefined): string[] {
  return String(tagsText ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function overlayCandidateMatches(version: PlatformDataSnapshot['datasetVersions'][number]): boolean {
  const metadata = version.metadata ?? {};
  const contentType = String(metadata.content_type ?? '').toLowerCase();
  const originalFileName = String(metadata.original_file_name ?? '').toLowerCase();

  if (
    contentType.includes('tiff') ||
    contentType.includes('geotiff') ||
    originalFileName.endsWith('.tif') ||
    originalFileName.endsWith('.tiff')
  ) {
    return true;
  }

  if (
    contentType.includes('geo+json') ||
    contentType.endsWith('/json') ||
    originalFileName.endsWith('.geojson') ||
    originalFileName.endsWith('.json')
  ) {
    return true;
  }

  return false;
}

function bboxText(bbox: [number, number, number, number] | undefined): string {
  if (!bbox) {
    return '-';
  }
  return bbox.map((value) => value.toFixed(4)).join(', ');
}

function parseCoordinateInput(
  rawInput: string,
): { longitude: number; latitude: number } | null {
  const normalized = rawInput.trim().replaceAll('，', ',');
  if (!normalized) {
    return null;
  }
  const parts = normalized.split(/[,\s]+/).filter(Boolean);
  if (parts.length !== 2) {
    return null;
  }

  const first = Number(parts[0]);
  const second = Number(parts[1]);
  if (!Number.isFinite(first) || !Number.isFinite(second)) {
    return null;
  }

  let longitude = first;
  let latitude = second;
  if (Math.abs(first) <= 90 && Math.abs(second) > 90 && Math.abs(second) <= 180) {
    latitude = first;
    longitude = second;
  }

  if (Math.abs(longitude) > 180 || Math.abs(latitude) > 90) {
    return null;
  }

  return { longitude, latitude };
}

function formatCoordinateNumber(value: number): string {
  return value.toFixed(6);
}

function isValidSavedCoordinatePoint(value: unknown): value is SavedCoordinatePoint {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const item = value as Partial<SavedCoordinatePoint>;
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.longitude === 'number' &&
    Number.isFinite(item.longitude) &&
    typeof item.latitude === 'number' &&
    Number.isFinite(item.latitude) &&
    Math.abs(item.longitude) <= 180 &&
    Math.abs(item.latitude) <= 90 &&
    typeof item.createdAt === 'number' &&
    Number.isFinite(item.createdAt)
  );
}

function isValidCoordinateHistoryItem(value: unknown): value is CoordinateHistoryItem {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const item = value as Partial<CoordinateHistoryItem>;
  return (
    typeof item.id === 'string' &&
    typeof item.longitude === 'number' &&
    Number.isFinite(item.longitude) &&
    typeof item.latitude === 'number' &&
    Number.isFinite(item.latitude) &&
    Math.abs(item.longitude) <= 180 &&
    Math.abs(item.latitude) <= 90 &&
    typeof item.createdAt === 'number' &&
    Number.isFinite(item.createdAt)
  );
}

export function SpatialStudioPage({
  snapshot,
}: {
  snapshot: PlatformDataSnapshot;
  onRefresh: () => Promise<void>;
}) {
  const { message, modal } = App.useApp();
  const { currentUser, token } = useAuth();
  const { locale, t } = useI18n();
  const [roiForm] = Form.useForm<RoiFormValues>();
  const [overlayForm] = Form.useForm<OverlayFormValues>();
  const [loading, setLoading] = useState(false);
  const [savingRoi, setSavingRoi] = useState(false);
  const [savingOverlay, setSavingOverlay] = useState(false);
  const [rois, setRois] = useState<SpatialRoiSummary[]>([]);
  const [overlays, setOverlays] = useState<SpatialOverlaySummary[]>([]);
  const [datasets, setDatasets] = useState<PlatformDataSnapshot['datasets']>([]);
  const [datasetVersions, setDatasetVersions] = useState<PlatformDataSnapshot['datasetVersions']>([]);
  const [selectedRoiId, setSelectedRoiId] = useState<string>();
  const [selectedOverlayId, setSelectedOverlayId] = useState<string>();
  const [draftGeometry, setDraftGeometry] = useState<SpatialDraftGeometry>();
  const [drawMode, setDrawMode] = useState<'rectangle' | 'polygon' | null>(null);
  const [baseLayerKey, setBaseLayerKey] = useState<MapBaseLayerKey>(() => readStoredMapBaseLayer());
  const [geometryEditEnabled, setGeometryEditEnabled] = useState(false);
  const [selectedOverlayIds, setSelectedOverlayIds] = useState<string[]>([]);
  const [overlayOpacities, setOverlayOpacities] = useState<Record<string, number>>({});
  const [coordinateInput, setCoordinateInput] = useState('');
  const [coordinateNameInput, setCoordinateNameInput] = useState('');
  const [showSavedCoordinateLabels, setShowSavedCoordinateLabels] = useState(false);
  const [focusRequest, setFocusRequest] = useState<SpatialMapFocusRequest>();
  const [savedCoordinates, setSavedCoordinates] = useState<SavedCoordinatePoint[]>([]);
  const [coordinateHistory, setCoordinateHistory] = useState<CoordinateHistoryItem[]>([]);
  const [hydratedStorageKeys, setHydratedStorageKeys] = useState<{
    saved: string;
    history: string;
  } | null>(null);

  const copy = useMemo(
    () =>
      locale === 'zh-CN'
        ? {
            kicker: '空间工作台',
            title: '绘制感兴趣区域、叠加空间数据并沉淀为可复用资产。',
            body:
              '这里负责地图侧的空间交互。你可以把 ROI、GeoJSON 图层和 GeoTIFF 影像保存下来，后续在 Sentinel-2 下载等工作流节点里直接复用。',
            roiEditor: 'ROI 编辑器',
            roiEditorCopy: '先绘制矩形或多边形，再保存为私有 ROI 资产。',
            newRoi: '新建 ROI',
            drawRectangle: '绘制矩形',
            drawPolygon: '绘制多边形',
            stopDrawing: '停止绘制',
            editGeometry: '编辑已选 ROI 几何',
            bbox: '范围',
            tags: '标签',
            tagsPlaceholder: '如：sentinel, beijing, demo',
            geometryMissing: '请先在地图上绘制一个 ROI。',
            roiSaved: 'ROI 已保存。',
            roiDeleted: 'ROI 已删除。',
            overlayEditor: '叠加图层',
            overlayEditorCopy: '从已有数据集版本创建地图叠加图层，支持 GeoJSON 和 GeoTIFF。',
            newOverlay: '新建图层',
            overlaySaved: '叠加图层已保存。',
            overlayDeleted: '叠加图层已删除。',
            overlayDataset: '数据集版本',
            opacity: '透明度',
            visible: '显示',
            roiAssets: '已保存 ROI',
            overlayAssets: '已保存图层',
            noRoi: '还没有 ROI 资产。',
            noOverlay: '还没有叠加图层资产。',
            mapTitle: '空间地图',
            mapCopy:
              '默认使用国内底图并支持切换。ROI 始终显示在图层上方，便于编辑和选择。',
            selectedRoi: '当前 ROI',
            selectedOverlay: '当前图层',
            availableOverlaySources: '可用空间数据版本',
            owner: '所有者',
            update: '保存修改',
            create: '保存为资产',
            delete: '删除',
            name: '名称',
            description: '说明',
            activeLayers: '激活图层',
            baseMap: '底图',
            drawHintRectangle: '正在绘制矩形',
            drawHintPolygon: '正在绘制多边形',
            mapSelectionHint: '点击地图中的 ROI 可以在右侧高亮并载入编辑表单。',
          }
        : {
            kicker: 'Spatial Studio',
            title: 'Draw regions of interest, overlay spatial datasets, and keep them as reusable assets.',
            body:
              'This page owns the map-side spatial workflow. Save ROIs, GeoJSON layers, and GeoTIFF imagery here, then reuse them in downstream features such as Sentinel-2 download nodes.',
            roiEditor: 'ROI Editor',
            roiEditorCopy: 'Draw a rectangle or polygon first, then save it as a private ROI asset.',
            newRoi: 'New ROI',
            drawRectangle: 'Draw Rectangle',
            drawPolygon: 'Draw Polygon',
            stopDrawing: 'Stop Drawing',
            editGeometry: 'Edit Selected ROI Geometry',
            bbox: 'BBox',
            tags: 'Tags',
            tagsPlaceholder: 'Example: sentinel, beijing, demo',
            geometryMissing: 'Draw an ROI on the map first.',
            roiSaved: 'ROI saved.',
            roiDeleted: 'ROI deleted.',
            overlayEditor: 'Overlay Editor',
            overlayEditorCopy: 'Create map overlays from existing dataset versions. GeoJSON and GeoTIFF are supported.',
            newOverlay: 'New Overlay',
            overlaySaved: 'Overlay saved.',
            overlayDeleted: 'Overlay deleted.',
            overlayDataset: 'Dataset Version',
            opacity: 'Opacity',
            visible: 'Visible',
            roiAssets: 'Saved ROIs',
            overlayAssets: 'Saved Overlays',
            noRoi: 'No ROI assets yet.',
            noOverlay: 'No overlay assets yet.',
            mapTitle: 'Spatial Map',
            mapCopy:
              'The map defaults to a domestic basemap with switchable providers. ROI layers always stay above overlays for easier selection and editing.',
            selectedRoi: 'Selected ROI',
            selectedOverlay: 'Selected Overlay',
            availableOverlaySources: 'Spatial-ready dataset versions',
            owner: 'Owner',
            update: 'Save Changes',
            create: 'Save Asset',
            delete: 'Delete',
            name: 'Name',
            description: 'Description',
            activeLayers: 'Active overlays',
            baseMap: 'Basemap',
            drawHintRectangle: 'Drawing rectangle',
            drawHintPolygon: 'Drawing polygon',
            mapSelectionHint: 'Click an ROI on the map to highlight it in the asset list and load its edit form.',
          },
    [locale],
  );

  const isAdmin = currentUser?.role === 'ADMIN';
  const scope: AssetScope = isAdmin ? 'all' : 'mine';
  const datasetNameById = useMemo(
    () => new Map(datasets.map((item) => [item.id, item.name])),
    [datasets],
  );
  const overlayCandidates = useMemo(
    () =>
      datasetVersions.filter((version) => {
        const dataset = datasets.find((item) => item.id === version.datasetId);
        return dataset && ['raster', 'vector'].includes(dataset.kind) && overlayCandidateMatches(version);
      }),
    [datasetVersions, datasets],
  );
  const overlayOptions = useMemo(
    () =>
      overlayCandidates.map((version) => ({
        value: version.id,
        label: `${datasetNameById.get(version.datasetId) ?? version.datasetId} / v${version.version}`,
      })),
    [datasetNameById, overlayCandidates],
  );
  const selectedRoi = useMemo(
    () => rois.find((item) => item.id === selectedRoiId),
    [rois, selectedRoiId],
  );
  const selectedOverlay = useMemo(
    () => overlays.find((item) => item.id === selectedOverlayId),
    [overlays, selectedOverlayId],
  );
  const baseLayerOptions = useMemo(() => listMapBaseLayerOptions(locale), [locale]);
  const coordinatePlaceholder =
    locale === 'zh-CN'
      ? '经度,纬度 例如 116.397,39.908'
      : 'longitude,latitude e.g. 116.397,39.908';
  const coordinateButtonText = locale === 'zh-CN' ? '定位' : 'Locate';
  const coordinateLabel = locale === 'zh-CN' ? '坐标' : 'Coordinate';
  const coordinateInvalidMessage =
    locale === 'zh-CN'
      ? '请输入有效经纬度，格式示例：116.397,39.908'
      : 'Enter valid coordinates, e.g. 116.397,39.908';
  const coordinateNameLabel = locale === 'zh-CN' ? '\u70b9\u4f4d\u540d\u79f0' : 'Point Name';
  const coordinateNamePlaceholder =
    locale === 'zh-CN' ? '\u4f8b\u5982\uff1a\u5317\u4eac\u57ce\u533a\u4e2d\u5fc3' : 'Example: Beijing Center';
  const coordinateSaveButtonText = locale === 'zh-CN' ? '\u6536\u85cf\u5750\u6807' : 'Save Point';
  const coordinateSavedMessage = locale === 'zh-CN' ? '\u5750\u6807\u5df2\u6536\u85cf\u3002' : 'Coordinate saved.';
  const coordinateToolsTitle =
    locale === 'zh-CN' ? '\u5750\u6807\u6536\u85cf\u4e0e\u5386\u53f2' : 'Coordinate Bookmarks';
  const coordinateSavedListTitle = locale === 'zh-CN' ? '\u6536\u85cf\u70b9\u4f4d' : 'Saved Points';
  const coordinateHistoryTitle = locale === 'zh-CN' ? '\u6700\u8fd1\u5b9a\u4f4d\u5386\u53f2' : 'Recent History';
  const coordinateNoSavedText =
    locale === 'zh-CN' ? '\u8fd8\u6ca1\u6709\u6536\u85cf\u5750\u6807\u3002' : 'No saved points yet.';
  const coordinateNoHistoryText =
    locale === 'zh-CN' ? '\u8fd8\u6ca1\u6709\u5b9a\u4f4d\u5386\u53f2\u3002' : 'No coordinate history yet.';
  const coordinateJumpButtonText = locale === 'zh-CN' ? '\u8df3\u8f6c' : 'Go';
  const coordinateClearHistoryText = locale === 'zh-CN' ? '\u6e05\u7a7a\u5386\u53f2' : 'Clear History';
  const coordinateClearSavedText = locale === 'zh-CN' ? '\u6e05\u7a7a\u6536\u85cf' : 'Clear Saved';
  const coordinateClearedMessage = locale === 'zh-CN' ? '\u5df2\u6e05\u7a7a\u3002' : 'Cleared.';
  const coordinateLabelSwitchText =
    locale === 'zh-CN' ? '\u663e\u793a\u6536\u85cf\u6807\u7b7e' : 'Show Saved Labels';
  const coordinateStorageKeys = useMemo(
    () => ({
      saved: `platform.spatial.savedCoordinates.v1.${currentUser?.id ?? 'anonymous'}`,
      history: `platform.spatial.coordinateHistory.v1.${currentUser?.id ?? 'anonymous'}`,
    }),
    [currentUser?.id],
  );

  const refreshSpatial = useCallback(async () => {
    if (!token) {
      return;
    }

    setLoading(true);
    try {
      const [nextRois, nextOverlays, nextDatasets, nextDatasetVersions] = await Promise.all([
        listSpatialRois(token, scope),
        listSpatialOverlays(token, scope),
        listDatasets(token, isAdmin ? 'all' : 'visible'),
        listDatasetVersions(token, isAdmin ? 'all' : 'visible'),
      ]);
      setRois(nextRois);
      setOverlays(nextOverlays);
      setDatasets(nextDatasets);
      setDatasetVersions(nextDatasetVersions);
      setSelectedOverlayIds((current) => {
        const validIds = new Set(nextOverlays.map((item) => item.id));
        return current.filter((id) => validIds.has(id));
      });
      setOverlayOpacities((current) =>
        Object.fromEntries(nextOverlays.map((item) => [item.id, current[item.id] ?? item.opacity])),
      );
      setSelectedRoiId((current) =>
        current && nextRois.some((item) => item.id === current) ? current : undefined,
      );
      setSelectedOverlayId((current) =>
        current && nextOverlays.some((item) => item.id === current) ? current : undefined,
      );
    } catch (error) {
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    } finally {
      setLoading(false);
    }
  }, [isAdmin, message, scope, t, token]);

  useEffect(() => {
    void refreshSpatial();
  }, [refreshSpatial]);

  useEffect(() => {
    if (!selectedRoi) {
      return;
    }
    roiForm.setFieldsValue({
      name: selectedRoi.name,
      description: selectedRoi.description ?? '',
      tagsText: (selectedRoi.tags ?? []).join(', '),
    });
    setDrawMode(null);
  }, [roiForm, selectedRoi]);

  useEffect(() => {
    if (!selectedOverlay) {
      return;
    }
    overlayForm.setFieldsValue({
      datasetVersionId: selectedOverlay.datasetVersionId,
      name: selectedOverlay.name,
      description: selectedOverlay.description ?? '',
      opacity: overlayOpacities[selectedOverlay.id] ?? selectedOverlay.opacity,
    });
  }, [overlayForm, overlayOpacities, selectedOverlay]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    setHydratedStorageKeys(null);

    try {
      const savedRaw = window.localStorage.getItem(coordinateStorageKeys.saved);
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw) as unknown;
        if (Array.isArray(parsed)) {
          setSavedCoordinates(parsed.filter(isValidSavedCoordinatePoint));
        } else {
          setSavedCoordinates([]);
        }
      } else {
        setSavedCoordinates([]);
      }
    } catch {
      setSavedCoordinates([]);
    }

    try {
      const historyRaw = window.localStorage.getItem(coordinateStorageKeys.history);
      if (historyRaw) {
        const parsed = JSON.parse(historyRaw) as unknown;
        if (Array.isArray(parsed)) {
          setCoordinateHistory(parsed.filter(isValidCoordinateHistoryItem));
        } else {
          setCoordinateHistory([]);
        }
      } else {
        setCoordinateHistory([]);
      }
    } catch {
      setCoordinateHistory([]);
    }

    setHydratedStorageKeys({
      saved: coordinateStorageKeys.saved,
      history: coordinateStorageKeys.history,
    });
  }, [coordinateStorageKeys.history, coordinateStorageKeys.saved]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (hydratedStorageKeys?.saved !== coordinateStorageKeys.saved) {
      return;
    }
    window.localStorage.setItem(coordinateStorageKeys.saved, JSON.stringify(savedCoordinates));
  }, [coordinateStorageKeys.saved, hydratedStorageKeys?.saved, savedCoordinates]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (hydratedStorageKeys?.history !== coordinateStorageKeys.history) {
      return;
    }
    window.localStorage.setItem(coordinateStorageKeys.history, JSON.stringify(coordinateHistory));
  }, [coordinateHistory, coordinateStorageKeys.history, hydratedStorageKeys?.history]);

  const startNewRoi = (nextDrawMode: 'rectangle' | 'polygon' | null = null) => {
    setSelectedRoiId(undefined);
    setGeometryEditEnabled(false);
    setDraftGeometry(undefined);
    roiForm.resetFields();
    setDrawMode(nextDrawMode);
  };

  const startNewOverlay = () => {
    setSelectedOverlayId(undefined);
    overlayForm.setFieldsValue({
      datasetVersionId: overlayOptions[0]?.value ?? '',
      name: '',
      description: '',
      opacity: 0.85,
    });
  };

  const handleSaveRoi = async () => {
    if (!token) {
      return;
    }

    try {
      const values = await roiForm.validateFields();
      const geometry =
        draftGeometry ??
        (selectedRoi
          ? {
              geometryType: selectedRoi.geometryType,
              geometry: selectedRoi.geometry,
              bbox: selectedRoi.bbox,
            }
          : undefined);
      if (!geometry) {
        message.warning(copy.geometryMissing);
        return;
      }

      setSavingRoi(true);
      if (selectedRoiId) {
        const updated = await updateSpatialRoi(token, selectedRoiId, {
          name: values.name,
          description: values.description,
          tags: parseTags(values.tagsText),
          geometryType: geometry.geometryType,
          geometry: geometry.geometry,
        });
        setSelectedRoiId(updated.id);
      } else {
        const created = await createSpatialRoi(token, {
          workspaceId: snapshot.workspace.id,
          name: values.name,
          description: values.description,
          tags: parseTags(values.tagsText),
          geometryType: geometry.geometryType,
          geometry: geometry.geometry,
        });
        setSelectedRoiId(created.id);
      }

      setGeometryEditEnabled(false);
      setDrawMode(null);
      message.success(copy.roiSaved);
      await refreshSpatial();
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'errorFields' in error) {
        return;
      }
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    } finally {
      setSavingRoi(false);
    }
  };

  const handleDeleteSelectedRoi = () => {
    if (!token || !selectedRoiId) {
      return;
    }

    modal.confirm({
      title: copy.delete,
      content: selectedRoi?.name,
      onOk: async () => {
        try {
          await deleteSpatialRoi(token, selectedRoiId);
          message.success(copy.roiDeleted);
          setSelectedRoiId(undefined);
          setDraftGeometry(undefined);
          roiForm.resetFields();
          await refreshSpatial();
        } catch (error) {
          message.error(isApiError(error) ? error.message : t('error.request_failed'));
          throw error;
        }
      },
    });
  };

  const handleSaveOverlay = async () => {
    if (!token) {
      return;
    }

    try {
      const values = await overlayForm.validateFields();
      setSavingOverlay(true);
      if (selectedOverlayId) {
        const updated = await updateSpatialOverlay(token, selectedOverlayId, {
          name: values.name,
          description: values.description,
          opacity: values.opacity,
        });
        setSelectedOverlayId(updated.id);
      } else {
        const created = await createSpatialOverlay(token, {
          workspaceId: snapshot.workspace.id,
          datasetVersionId: values.datasetVersionId,
          name: values.name,
          description: values.description,
          opacity: values.opacity,
        });
        setSelectedOverlayId(created.id);
      }
      message.success(copy.overlaySaved);
      await refreshSpatial();
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'errorFields' in error) {
        return;
      }
      message.error(isApiError(error) ? error.message : t('error.request_failed'));
    } finally {
      setSavingOverlay(false);
    }
  };

  const handleDeleteSelectedOverlay = () => {
    if (!token || !selectedOverlayId) {
      return;
    }

    modal.confirm({
      title: copy.delete,
      content: selectedOverlay?.name,
      onOk: async () => {
        try {
          await deleteSpatialOverlay(token, selectedOverlayId);
          message.success(copy.overlayDeleted);
          setSelectedOverlayId(undefined);
          startNewOverlay();
          await refreshSpatial();
        } catch (error) {
          message.error(isApiError(error) ? error.message : t('error.request_failed'));
          throw error;
        }
      },
    });
  };

  const jumpToCoordinate = (longitude: number, latitude: number) => {
    setCoordinateInput(`${formatCoordinateNumber(longitude)}, ${formatCoordinateNumber(latitude)}`);
    setFocusRequest({
      requestId: Date.now(),
      longitude,
      latitude,
      zoom: 13,
    });
  };

  const appendCoordinateHistory = (longitude: number, latitude: number) => {
    setCoordinateHistory((current) => {
      const deduped = current.filter(
        (item) =>
          !(
            Math.abs(item.longitude - longitude) < 0.000001 &&
            Math.abs(item.latitude - latitude) < 0.000001
          ),
      );
      return [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          longitude,
          latitude,
          createdAt: Date.now(),
        },
        ...deduped,
      ].slice(0, MAX_COORDINATE_HISTORY);
    });
  };

  const handleCoordinateSearch = () => {
    const parsed = parseCoordinateInput(coordinateInput);
    if (!parsed) {
      message.warning(coordinateInvalidMessage);
      return;
    }

    jumpToCoordinate(parsed.longitude, parsed.latitude);
    appendCoordinateHistory(parsed.longitude, parsed.latitude);
  };

  const handleSaveCoordinatePoint = () => {
    const parsed = parseCoordinateInput(coordinateInput);
    if (!parsed) {
      message.warning(coordinateInvalidMessage);
      return;
    }
    const nextName = coordinateNameInput.trim() || `${coordinateSavedListTitle} ${savedCoordinates.length + 1}`;
    setSavedCoordinates((current) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: nextName,
        longitude: parsed.longitude,
        latitude: parsed.latitude,
        createdAt: Date.now(),
      },
      ...current,
    ]);
    setCoordinateNameInput('');
    message.success(coordinateSavedMessage);
  };

  const handleRemoveSavedPoint = (id: string) => {
    setSavedCoordinates((current) => current.filter((item) => item.id !== id));
  };

  const handleClearSavedPoints = () => {
    setSavedCoordinates([]);
    message.success(coordinateClearedMessage);
  };

  const handleClearCoordinateHistory = () => {
    setCoordinateHistory([]);
    message.success(coordinateClearedMessage);
  };

  return (
    <div className="page-stack">
      <div className="section-header">
        <div>
          <div className="panel-kicker">{copy.kicker}</div>
          <h2 className="section-title">{copy.title}</h2>
          <Paragraph className="section-copy">{copy.body}</Paragraph>
        </div>
      </div>

      <div className="spatial-stats-grid">
        <StatCard label={copy.roiAssets} value={String(rois.length)} detail={copy.mapSelectionHint} />
        <StatCard
          label={copy.activeLayers}
          value={String(selectedOverlayIds.length)}
          detail={copy.availableOverlaySources}
        />
        <StatCard
          label={copy.availableOverlaySources}
          value={String(overlayCandidates.length)}
          detail={loading ? t('common.loading') : snapshot.workspace.name}
        />
      </div>

      <div className="spatial-studio-grid">
        <div className="spatial-side-column">
          <Card className="panel-card spatial-panel-card" variant="borderless">
            <div className="panel-kicker">{copy.roiEditor}</div>
            <Paragraph className="section-copy">{copy.roiEditorCopy}</Paragraph>
            <Space wrap>
              <Button onClick={() => startNewRoi()}>{copy.newRoi}</Button>
              <Button type={drawMode === 'rectangle' ? 'primary' : 'default'} onClick={() => startNewRoi('rectangle')}>
                {copy.drawRectangle}
              </Button>
              <Button type={drawMode === 'polygon' ? 'primary' : 'default'} onClick={() => startNewRoi('polygon')}>
                {copy.drawPolygon}
              </Button>
              {drawMode ? <Button onClick={() => setDrawMode(null)}>{copy.stopDrawing}</Button> : null}
            </Space>
            <div className="spatial-mode-bar">
              {drawMode === 'rectangle' ? <Tag color="blue">{copy.drawHintRectangle}</Tag> : null}
              {drawMode === 'polygon' ? <Tag color="gold">{copy.drawHintPolygon}</Tag> : null}
              {selectedRoi ? (
                <Switch
                  checked={geometryEditEnabled}
                  onChange={setGeometryEditEnabled}
                  checkedChildren={copy.editGeometry}
                  unCheckedChildren={copy.editGeometry}
                />
              ) : null}
            </div>
            <Form form={roiForm} layout="vertical" initialValues={{ name: '', description: '', tagsText: '' }}>
              <Form.Item name="name" label={copy.name} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="description" label={copy.description}>
                <Input.TextArea rows={3} />
              </Form.Item>
              <Form.Item name="tagsText" label={copy.tags}>
                <Input placeholder={copy.tagsPlaceholder} />
              </Form.Item>
            </Form>
            <Descriptions
              size="small"
              column={1}
              items={[
                {
                  key: 'bbox',
                  label: copy.bbox,
                  children: bboxText(draftGeometry?.bbox ?? selectedRoi?.bbox),
                },
                {
                  key: 'selected',
                  label: copy.selectedRoi,
                  children: selectedRoi?.name ?? '-',
                },
              ]}
            />
            <Space wrap>
              <Button type="primary" loading={savingRoi} onClick={() => void handleSaveRoi()}>
                {selectedRoiId ? copy.update : copy.create}
              </Button>
              {selectedRoiId ? (
                <Button danger onClick={handleDeleteSelectedRoi}>
                  {copy.delete}
                </Button>
              ) : null}
            </Space>
          </Card>

          <Card className="panel-card spatial-panel-card" variant="borderless">
            <div className="panel-kicker">{copy.overlayEditor}</div>
            <Paragraph className="section-copy">{copy.overlayEditorCopy}</Paragraph>
            <Space wrap>
              <Button onClick={startNewOverlay}>{copy.newOverlay}</Button>
            </Space>
            <Form
              form={overlayForm}
              layout="vertical"
              initialValues={{
                datasetVersionId: overlayOptions[0]?.value ?? '',
                name: '',
                description: '',
                opacity: 0.85,
              }}
            >
              <Form.Item name="datasetVersionId" label={copy.overlayDataset} rules={[{ required: true }]}>
                <Select
                  showSearch
                  disabled={Boolean(selectedOverlayId)}
                  options={overlayOptions}
                />
              </Form.Item>
              <Form.Item name="name" label={copy.name} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="description" label={copy.description}>
                <Input.TextArea rows={3} />
              </Form.Item>
              <Form.Item name="opacity" label={copy.opacity} rules={[{ required: true }]}>
                <InputNumber min={0.05} max={1} step={0.05} style={{ width: '100%' }} />
              </Form.Item>
            </Form>
            <Space wrap>
              <Button type="primary" loading={savingOverlay} onClick={() => void handleSaveOverlay()}>
                {selectedOverlayId ? copy.update : copy.create}
              </Button>
              {selectedOverlayId ? (
                <Button danger onClick={handleDeleteSelectedOverlay}>
                  {copy.delete}
                </Button>
              ) : null}
            </Space>
          </Card>
        </div>

        <Card className="panel-card spatial-map-panel" variant="borderless">
          <div className="spatial-map-panel-head">
            <div>
              <div className="panel-kicker">{copy.mapTitle}</div>
              <Paragraph className="section-copy">{copy.mapCopy}</Paragraph>
            </div>
            <Space wrap>
              <Tag>{copy.selectedRoi}: {selectedRoi?.name ?? '-'}</Tag>
              <Tag>{copy.activeLayers}: {selectedOverlayIds.length}</Tag>
              <div className="spatial-map-coordinate-search">
                <span>{coordinateLabel}</span>
                <Input.Search
                  allowClear
                  value={coordinateInput}
                  placeholder={coordinatePlaceholder}
                  enterButton={<Button type="primary">{coordinateButtonText}</Button>}
                  onChange={(event) => setCoordinateInput(event.target.value)}
                  onSearch={() => handleCoordinateSearch()}
                />
              </div>
              <div className="spatial-map-label-switcher">
                <span>{coordinateLabelSwitchText}</span>
                <Switch
                  checked={showSavedCoordinateLabels}
                  onChange={setShowSavedCoordinateLabels}
                />
              </div>
              <div className="spatial-map-basemap-switcher">
                <span>{copy.baseMap}</span>
                <Segmented
                  size="small"
                  value={baseLayerKey}
                  options={baseLayerOptions}
                  onChange={(value) => {
                    const nextValue = value as MapBaseLayerKey;
                    setBaseLayerKey(nextValue);
                    persistMapBaseLayer(nextValue);
                  }}
                />
              </div>
            </Space>
          </div>
          <SpatialMapCanvas
            token={token}
            rois={rois}
            overlays={overlays}
            savedCoordinatePoints={savedCoordinates.map((item) => ({
              id: item.id,
              name: item.name,
              longitude: item.longitude,
              latitude: item.latitude,
            }))}
            showSavedCoordinateLabels={showSavedCoordinateLabels}
            baseLayerKey={baseLayerKey}
            selectedRoiId={selectedRoiId}
            selectedOverlayIds={selectedOverlayIds}
            overlayOpacities={overlayOpacities}
            drawMode={drawMode}
            draftGeometry={draftGeometry}
            focusRequest={focusRequest}
            geometryEditEnabled={geometryEditEnabled}
            onDrawComplete={(geometry) => {
              setDraftGeometry(geometry);
              setSelectedRoiId(undefined);
              setGeometryEditEnabled(false);
            }}
            onSelectRoi={(roiId) => {
              setSelectedRoiId(roiId);
              setDrawMode(null);
              setDraftGeometry(undefined);
            }}
            onSelectedRoiGeometryChange={(geometry) => setDraftGeometry(geometry)}
            onOverlayError={(errorMessage) => message.warning(errorMessage)}
            onBaseLayerFallback={(nextBaseLayer, reason) => {
              setBaseLayerKey(nextBaseLayer);
              persistMapBaseLayer(nextBaseLayer);
              message.warning(reason);
            }}
          />
        </Card>

        <div className="spatial-side-column">
          <Card className="panel-card spatial-panel-card" variant="borderless">
            <div className="panel-kicker">{copy.roiAssets}</div>
            <div className="spatial-asset-list">
              {rois.length ? (
                rois.map((roi) => (
                  <button
                    key={roi.id}
                    type="button"
                    className={`spatial-asset-item${roi.id === selectedRoiId ? ' is-selected' : ''}`}
                    onClick={() => {
                      setSelectedRoiId(roi.id);
                      setGeometryEditEnabled(false);
                      setDrawMode(null);
                      setDraftGeometry(undefined);
                    }}
                  >
                    <div className="spatial-asset-item-head">
                      <strong>{roi.name}</strong>
                      <Tag>{roi.geometryType}</Tag>
                    </div>
                    {roi.description ? <div className="spatial-asset-item-copy">{roi.description}</div> : null}
                    <div className="spatial-asset-item-meta">
                      <span>{copy.owner}: {roi.ownerDisplayName ?? '-'}</span>
                    </div>
                    <div className="spatial-asset-item-meta">
                      <span>{copy.bbox}: {bboxText(roi.bbox)}</span>
                    </div>
                    {(roi.tags ?? []).length ? (
                      <Space wrap>
                        {(roi.tags ?? []).map((tag) => (
                          <Tag key={tag}>{tag}</Tag>
                        ))}
                      </Space>
                    ) : null}
                  </button>
                ))
              ) : (
                <Empty description={copy.noRoi} />
              )}
            </div>
          </Card>

          <Card className="panel-card spatial-panel-card" variant="borderless">
            <div className="panel-kicker">{copy.overlayAssets}</div>
            <div className="spatial-asset-list">
              {overlays.length ? (
                overlays.map((overlay) => (
                  <div
                    key={overlay.id}
                    className={`spatial-asset-item${overlay.id === selectedOverlayId ? ' is-selected' : ''}`}
                  >
                    <button
                      type="button"
                      className="spatial-asset-item-button"
                      onClick={() => setSelectedOverlayId(overlay.id)}
                    >
                      <div className="spatial-asset-item-head">
                        <strong>{overlay.name}</strong>
                        <Tag>{overlay.overlayType}</Tag>
                      </div>
                      {overlay.description ? (
                        <div className="spatial-asset-item-copy">{overlay.description}</div>
                      ) : null}
                      <div className="spatial-asset-item-meta">
                        <span>{overlay.datasetName} / v{overlay.datasetVersionNumber}</span>
                        <span>{t(datasetKindKey(overlay.datasetKind))}</span>
                      </div>
                    </button>
                    <div className="spatial-overlay-controls">
                      <div className="spatial-overlay-switch">
                        <span>{copy.visible}</span>
                        <Switch
                          checked={selectedOverlayIds.includes(overlay.id)}
                          onChange={(checked) => {
                            if (checked && overlay.bbox && overlay.bbox.length === 4) {
                              setFocusRequest({
                                requestId: Date.now(),
                                bbox: overlay.bbox,
                                zoom: 13,
                              });
                            }
                            setSelectedOverlayIds((current) =>
                              checked
                                ? Array.from(new Set([...current, overlay.id]))
                                : current.filter((id) => id !== overlay.id),
                            );
                          }}
                        />
                      </div>
                      <div className="spatial-overlay-opacity">
                        <span>{copy.opacity}</span>
                        <InputNumber
                          min={0.05}
                          max={1}
                          step={0.05}
                          value={overlayOpacities[overlay.id] ?? overlay.opacity}
                          onChange={(value) =>
                            setOverlayOpacities((current) => ({
                              ...current,
                              [overlay.id]: typeof value === 'number' ? value : overlay.opacity,
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <Empty description={copy.noOverlay} />
              )}
            </div>
          </Card>

          <Card className="panel-card spatial-panel-card" variant="borderless">
            <div className="panel-kicker">{coordinateToolsTitle}</div>
            <div className="spatial-coordinate-bookmark-toolbar">
              <Input
                value={coordinateNameInput}
                placeholder={coordinateNamePlaceholder}
                addonBefore={coordinateNameLabel}
                onChange={(event) => setCoordinateNameInput(event.target.value)}
              />
              <Space wrap>
                <Button type="primary" onClick={handleSaveCoordinatePoint}>
                  {coordinateSaveButtonText}
                </Button>
                <Button onClick={handleClearSavedPoints}>{coordinateClearSavedText}</Button>
                <Button onClick={handleClearCoordinateHistory}>{coordinateClearHistoryText}</Button>
              </Space>
            </div>

            <div className="spatial-coordinate-group">
              <div className="panel-kicker">{coordinateSavedListTitle}</div>
              <div className="spatial-asset-list">
                {savedCoordinates.length ? (
                  savedCoordinates.map((item) => (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      className="spatial-asset-item spatial-saved-point-item"
                      onClick={() => {
                        jumpToCoordinate(item.longitude, item.latitude);
                        appendCoordinateHistory(item.longitude, item.latitude);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          jumpToCoordinate(item.longitude, item.latitude);
                          appendCoordinateHistory(item.longitude, item.latitude);
                        }
                      }}
                    >
                      <div className="spatial-asset-item-head">
                        <strong>{item.name}</strong>
                        <Tag>
                          {formatCoordinateNumber(item.longitude)}, {formatCoordinateNumber(item.latitude)}
                        </Tag>
                      </div>
                      <div className="spatial-asset-item-meta">
                        <span>{new Date(item.createdAt).toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-US')}</span>
                      </div>
                      <Space wrap>
                        <Button
                          size="small"
                          onClick={(event) => {
                            event.stopPropagation();
                            jumpToCoordinate(item.longitude, item.latitude);
                            appendCoordinateHistory(item.longitude, item.latitude);
                          }}
                        >
                          {coordinateJumpButtonText}
                        </Button>
                        <Button
                          size="small"
                          danger
                          onClick={(event) => {
                            event.stopPropagation();
                            handleRemoveSavedPoint(item.id);
                          }}
                        >
                          {copy.delete}
                        </Button>
                      </Space>
                    </div>
                  ))
                ) : (
                  <Empty description={coordinateNoSavedText} />
                )}
              </div>
            </div>

            <div className="spatial-coordinate-group">
              <div className="panel-kicker">{coordinateHistoryTitle}</div>
              <div className="spatial-asset-list">
                {coordinateHistory.length ? (
                  coordinateHistory.map((item) => (
                    <div key={item.id} className="spatial-asset-item">
                      <div className="spatial-asset-item-head">
                        <strong>
                          {formatCoordinateNumber(item.longitude)}, {formatCoordinateNumber(item.latitude)}
                        </strong>
                        <Tag>{new Date(item.createdAt).toLocaleTimeString(locale === 'zh-CN' ? 'zh-CN' : 'en-US')}</Tag>
                      </div>
                      <Space wrap>
                        <Button
                          size="small"
                          onClick={() => jumpToCoordinate(item.longitude, item.latitude)}
                        >
                          {coordinateJumpButtonText}
                        </Button>
                      </Space>
                    </div>
                  ))
                ) : (
                  <Empty description={coordinateNoHistoryText} />
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
