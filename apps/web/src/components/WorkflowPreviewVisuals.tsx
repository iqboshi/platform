import type {
  DatasetSummary,
  DatasetVersionSummary,
  WorkflowNodePreviewValue,
} from '@platform/types';

import { Empty, Spin, Tag, Typography } from 'antd';
import Feature from 'ol/Feature';
import { fromExtent } from 'ol/geom/Polygon';
import type Geometry from 'ol/geom/Geometry';
import ImageLayer from 'ol/layer/Image';
import VectorLayer from 'ol/layer/Vector';
import WebGLTileLayer from 'ol/layer/WebGLTile';
import Map from 'ol/Map';
import { unByKey } from 'ol/Observable';
import type { EventsKey } from 'ol/events';
import { Fill, Stroke, Style } from 'ol/style';
import View from 'ol/View';
import { fromLonLat, transformExtent } from 'ol/proj';
import GeoTIFFSource from 'ol/source/GeoTIFF';
import ImageStatic from 'ol/source/ImageStatic';
import VectorSource from 'ol/source/Vector';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useI18n } from '@/i18n/useI18n';
import { fetchDatasetVersionBlob, fetchDatasetVersionText } from '@/lib/api';
import {
  createBaseTileLayer,
  getMapBaseLayerLabel,
  getMapBaseLayerSourceHint,
  getNextMapBaseLayerKey,
  persistMapBaseLayer,
  readStoredMapBaseLayer,
  type MapBaseLayerKey,
} from '@/components/map-base-layers';

const { Text } = Typography;

const previewExtentStyle = new Style({
  stroke: new Stroke({ color: 'rgba(245, 158, 11, 0.96)', width: 2 }),
  fill: new Fill({ color: 'rgba(245, 158, 11, 0.1)' }),
});

interface TimeSeriesRow {
  date: string;
  band: string | undefined;
  value: number;
}

function getStringField(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function getRecordField(record: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = record[key];
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function normalizeBBox(value: unknown): [number, number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 4) {
    return undefined;
  }
  const bbox = value.map((item) => Number(item));
  if (!bbox.every((item) => Number.isFinite(item))) {
    return undefined;
  }
  if (bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) {
    return undefined;
  }
  return bbox as [number, number, number, number];
}

function normalizeTimeSeriesRows(value: unknown): TimeSeriesRow[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }
      const row = item as Record<string, unknown>;
      const date = getStringField(row, 'date');
      const band = getStringField(row, 'band');
      const rawValue = row.value;
      const numericValue =
        typeof rawValue === 'number'
          ? rawValue
          : typeof rawValue === 'string'
            ? Number(rawValue)
            : Number.NaN;
      if (!date || !Number.isFinite(numericValue)) {
        return null;
      }
      return {
        date,
        band,
        value: numericValue,
      };
    })
    .filter((item): item is TimeSeriesRow => Boolean(item));
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (character === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }
    current += character;
  }

  cells.push(current);
  return cells.map((item) => item.trim());
}

function parseTimeSeriesCsv(text: string): TimeSeriesRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(lines[0]);
  const dateIndex = headers.findIndex((header) => header === 'date');
  const bandIndex = headers.findIndex((header) => header === 'band');
  const valueIndex = headers.findIndex((header) => header === 'value');
  if (dateIndex < 0 || valueIndex < 0) {
    return [];
  }

  return lines
    .slice(1)
    .map((line) => parseCsvLine(line))
    .map((cells) => {
      const value = Number(cells[valueIndex] ?? '');
      if (!Number.isFinite(value)) {
        return null;
      }
      const date = String(cells[dateIndex] ?? '').trim();
      if (!date) {
        return null;
      }
      const band = bandIndex >= 0 ? String(cells[bandIndex] ?? '').trim() || undefined : undefined;
      return { date, band, value };
    })
    .filter((item): item is TimeSeriesRow => Boolean(item));
}

function looksLikeTimeSeriesPreview(
  preview: WorkflowNodePreviewValue,
  datasetVersion?: DatasetVersionSummary,
): boolean {
  const previewRecord = preview as Record<string, unknown>;
  const previewOperation = getStringField(previewRecord, 'operation');
  if (previewOperation === 'nee_point_timeseries_export') {
    return true;
  }

  const metadataRecord = datasetVersion?.metadata ?? {};
  const metadataOperation = getStringField(metadataRecord, 'operation');
  if (metadataOperation === 'nee_point_timeseries_export') {
    return true;
  }

  return (
    normalizeTimeSeriesRows(previewRecord.rows).length > 0 ||
    normalizeTimeSeriesRows(previewRecord.sampleRows).length > 0 ||
    normalizeTimeSeriesRows(previewRecord.sample_rows).length > 0
  );
}

function looksLikeSpatialPreview(
  preview: WorkflowNodePreviewValue,
  dataset?: DatasetSummary,
  datasetVersion?: DatasetVersionSummary,
): boolean {
  const previewRecord = preview as Record<string, unknown>;
  const previewOperation = getStringField(previewRecord, 'operation');
  if (previewOperation === 'nee_map_export') {
    return true;
  }

  const metadataRecord = datasetVersion?.metadata ?? {};
  const metadataOperation = getStringField(metadataRecord, 'operation');
  if (metadataOperation === 'nee_map_export') {
    return true;
  }

  const thumbnailUrl = getStringField(previewRecord, 'thumbnailUrl', 'thumbnail_url');
  if (thumbnailUrl) {
    return true;
  }

  return dataset?.kind === 'raster';
}

function formatPreviewNumber(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '-';
}

function WorkflowTimeSeriesPreview({
  preview,
  datasetVersionId,
  authToken,
  datasetVersion,
  compact = false,
}: {
  preview: WorkflowNodePreviewValue;
  datasetVersionId?: string;
  authToken?: string | null;
  datasetVersion?: DatasetVersionSummary;
  compact?: boolean;
}) {
  const { locale } = useI18n();
  const previewRecord = preview as Record<string, unknown>;
  const previewRows = useMemo(
    () =>
      normalizeTimeSeriesRows(previewRecord.rows).length
        ? normalizeTimeSeriesRows(previewRecord.rows)
        : normalizeTimeSeriesRows(previewRecord.sampleRows).length
          ? normalizeTimeSeriesRows(previewRecord.sampleRows)
          : normalizeTimeSeriesRows(previewRecord.sample_rows),
    [previewRecord.rows, previewRecord.sampleRows, previewRecord.sample_rows],
  );
  const [remoteRows, setRemoteRows] = useState<TimeSeriesRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (previewRows.length || !datasetVersionId || !authToken) {
      return;
    }
    if (!looksLikeTimeSeriesPreview(preview, datasetVersion)) {
      return;
    }

    let disposed = false;
    setLoading(true);
    setError(undefined);
    void fetchDatasetVersionText(authToken, datasetVersionId)
      .then((text) => {
        if (disposed) {
          return;
        }
        setRemoteRows(parseTimeSeriesCsv(text));
      })
      .catch((fetchError) => {
        if (disposed) {
          return;
        }
        setError(fetchError instanceof Error ? fetchError.message : 'Failed to load CSV preview.');
      })
      .finally(() => {
        if (!disposed) {
          setLoading(false);
        }
      });

    return () => {
      disposed = true;
    };
  }, [authToken, datasetVersion, datasetVersionId, preview, previewRows.length]);

  const rows = previewRows.length ? previewRows : remoteRows;
  const sortedRows = useMemo(() => {
    return [...rows].sort((left, right) => {
      const leftTime = Date.parse(left.date);
      const rightTime = Date.parse(right.date);
      if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
        return left.date.localeCompare(right.date);
      }
      return leftTime - rightTime;
    });
  }, [rows]);

  const chartWidth = 320;
  const chartHeight = compact ? 150 : 180;
  const paddingLeft = 18;
  const paddingRight = 10;
  const paddingTop = 12;
  const paddingBottom = 22;
  const values = sortedRows.map((item) => item.value);
  const minValue = values.length ? Math.min(...values) : 0;
  const maxValue = values.length ? Math.max(...values) : 0;
  const valueRange = maxValue - minValue || 1;
  const usableWidth = chartWidth - paddingLeft - paddingRight;
  const usableHeight = chartHeight - paddingTop - paddingBottom;
  const path = sortedRows
    .map((item, index) => {
      const x =
        paddingLeft +
        (sortedRows.length <= 1 ? usableWidth / 2 : (index / (sortedRows.length - 1)) * usableWidth);
      const y =
        paddingTop + (1 - (item.value - minValue) / valueRange) * usableHeight;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');

  const bandLabel =
    getStringField(previewRecord, 'band') ??
    sortedRows.find((item) => item.band)?.band ??
    getStringField(datasetVersion?.metadata ?? {}, 'band');
  const chartTitle = locale === 'zh-CN' ? '时间序列预览' : 'Time-Series Preview';
  const emptyText = locale === 'zh-CN' ? '暂无可绘制的时间序列点。' : 'No time-series points available.';

  if (loading) {
    return (
      <div className="workflow-preview-visual workflow-preview-visual-loading">
        <Spin size="small" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="workflow-preview-visual">
        <Text type="danger">{error}</Text>
      </div>
    );
  }

  if (!sortedRows.length) {
    return (
      <div className="workflow-preview-visual">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />
      </div>
    );
  }

  return (
    <div className={`workflow-preview-visual workflow-timeseries-preview${compact ? ' is-compact' : ''}`}>
      <div className="workflow-preview-visual-head">
        <strong>{chartTitle}</strong>
        {bandLabel ? <Tag bordered={false}>{bandLabel}</Tag> : null}
      </div>
      <svg
        className="workflow-timeseries-chart"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        role="img"
        aria-label={chartTitle}
      >
        <line
          x1={paddingLeft}
          x2={chartWidth - paddingRight}
          y1={chartHeight - paddingBottom}
          y2={chartHeight - paddingBottom}
          className="workflow-timeseries-axis-line"
        />
        <line
          x1={paddingLeft}
          x2={paddingLeft}
          y1={paddingTop}
          y2={chartHeight - paddingBottom}
          className="workflow-timeseries-axis-line"
        />
        <path d={path} className="workflow-timeseries-path" />
        {sortedRows.map((item, index) => {
          const x =
            paddingLeft +
            (sortedRows.length <= 1
              ? usableWidth / 2
              : (index / (sortedRows.length - 1)) * usableWidth);
          const y =
            paddingTop + (1 - (item.value - minValue) / valueRange) * usableHeight;
          return (
            <circle
              key={`${item.date}-${index}`}
              cx={x}
              cy={y}
              r={3}
              className="workflow-timeseries-point"
            />
          );
        })}
      </svg>
      <div className="workflow-timeseries-axis-labels">
        <span>{sortedRows[0]?.date}</span>
        <span>{sortedRows[sortedRows.length - 1]?.date}</span>
      </div>
      <div className="workflow-timeseries-stats">
        <span>{locale === 'zh-CN' ? `点数 ${sortedRows.length}` : `${sortedRows.length} points`}</span>
        <span>{locale === 'zh-CN' ? `最小 ${formatPreviewNumber(minValue)}` : `min ${formatPreviewNumber(minValue)}`}</span>
        <span>{locale === 'zh-CN' ? `最大 ${formatPreviewNumber(maxValue)}` : `max ${formatPreviewNumber(maxValue)}`}</span>
      </div>
    </div>
  );
}

function WorkflowSpatialPreviewMap({
  bbox,
  thumbnailUrl,
  datasetVersionId,
  datasetKind,
  authToken,
  compact = false,
}: {
  bbox: [number, number, number, number];
  thumbnailUrl?: string;
  datasetVersionId?: string;
  datasetKind?: DatasetSummary['kind'];
  authToken?: string | null;
  compact?: boolean;
}) {
  const { locale } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fallbackTriedKeysRef = useRef<MapBaseLayerKey[]>([]);
  const [baseLayerKey, setBaseLayerKey] = useState<MapBaseLayerKey>(() => readStoredMapBaseLayer());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [baseLayerWarning, setBaseLayerWarning] = useState<string>();

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    let disposed = false;
    let rasterObjectUrl: string | undefined;
    const listeners: EventsKey[] = [];
    const baseLayer = createBaseTileLayer(baseLayerKey);
    const baseSource = baseLayer.getSource();
    let firstTileLoaded = false;
    let tileErrorCount = 0;
    let switchedByFallback = false;
    if (!fallbackTriedKeysRef.current.includes(baseLayerKey)) {
      fallbackTriedKeysRef.current = [...fallbackTriedKeysRef.current, baseLayerKey];
    }

    setBaseLayerWarning(undefined);
    setError(undefined);

    if (baseSource && 'on' in baseSource) {
      listeners.push(
        baseSource.on('tileloadend', () => {
          firstTileLoaded = true;
          if (!disposed) {
            setBaseLayerWarning(undefined);
          }
        }),
      );
      listeners.push(
        baseSource.on('tileloaderror', () => {
          tileErrorCount += 1;
          if (!disposed && tileErrorCount === 1) {
            setBaseLayerWarning(
              locale === 'zh-CN'
                ? `底图请求失败：${getMapBaseLayerSourceHint(baseLayerKey)}`
                : `Basemap request failed: ${getMapBaseLayerSourceHint(baseLayerKey)}`,
            );
          }
          if (firstTileLoaded || switchedByFallback || tileErrorCount < 8) {
            return;
          }
          const nextBaseLayer = getNextMapBaseLayerKey(
            baseLayerKey,
            fallbackTriedKeysRef.current,
          );
          if (!nextBaseLayer || disposed) {
            return;
          }
          switchedByFallback = true;
          fallbackTriedKeysRef.current = [...fallbackTriedKeysRef.current, nextBaseLayer];
          setBaseLayerKey(nextBaseLayer);
          persistMapBaseLayer(nextBaseLayer);
          setBaseLayerWarning(
            locale === 'zh-CN'
              ? `当前底图不可用，已切换到 ${getMapBaseLayerLabel(nextBaseLayer, locale)}。`
              : `Current basemap is unavailable, switched to ${getMapBaseLayerLabel(nextBaseLayer, locale)}.`,
          );
        }),
      );
    }

    const map = new Map({
      target: containerRef.current,
      layers: [baseLayer],
      view: new View({
        center: fromLonLat([116.5, 39.95]),
        zoom: 9,
      }),
    });

    const projectedExtent = transformExtent(bbox, 'EPSG:4326', 'EPSG:3857');
    const extentFeature = new Feature({
      geometry: fromExtent(projectedExtent),
    }) as Feature<Geometry>;
    const extentLayer = new VectorLayer({
      source: new VectorSource({ features: [extentFeature] }),
      style: previewExtentStyle,
      zIndex: 30,
    });
    map.addLayer(extentLayer);

    const loadPreviewLayer = async (): Promise<void> => {
      if (thumbnailUrl) {
        const imageLayer = new ImageLayer({
          source: new ImageStatic({
            url: thumbnailUrl,
            imageExtent: projectedExtent,
            crossOrigin: 'anonymous',
          }),
          opacity: 0.86,
          zIndex: 16,
        });
        map.addLayer(imageLayer);
        return;
      }

      if (datasetVersionId && datasetKind === 'raster' && authToken) {
        setLoading(true);
        try {
          const blob = await fetchDatasetVersionBlob(authToken, datasetVersionId);
          if (disposed) {
            return;
          }
          rasterObjectUrl = URL.createObjectURL(blob);
          const rasterLayer = new WebGLTileLayer({
            source: new GeoTIFFSource({
              sources: [{ url: rasterObjectUrl }],
            }),
            opacity: 0.9,
            zIndex: 14,
          });
          map.addLayer(rasterLayer);
        } catch (previewError) {
          if (!disposed) {
            setError(
              previewError instanceof Error
                ? previewError.message
                : locale === 'zh-CN'
                  ? '栅格预览加载失败。'
                  : 'Failed to load raster preview.',
            );
          }
        } finally {
          if (!disposed) {
            setLoading(false);
          }
        }
      }
    };

    void loadPreviewLayer();
    map.getView().fit(projectedExtent, {
      padding: [20, 20, 20, 20],
      maxZoom: 13,
    });

    return () => {
      disposed = true;
      unByKey(listeners);
      if (rasterObjectUrl) {
        URL.revokeObjectURL(rasterObjectUrl);
      }
      map.setTarget(undefined);
    };
  }, [authToken, baseLayerKey, bbox, datasetKind, datasetVersionId, locale, thumbnailUrl]);

  return (
    <div className={`workflow-preview-visual workflow-spatial-preview${compact ? ' is-compact' : ''}`}>
      {loading ? (
        <div className="workflow-preview-visual-loading">
          <Spin size="small" />
        </div>
      ) : null}
      <div ref={containerRef} className="workflow-preview-map-surface" />
      {baseLayerWarning ? <Text type="warning">{baseLayerWarning}</Text> : null}
      {error ? <Text type="danger">{error}</Text> : null}
    </div>
  );
}

export function WorkflowPreviewVisual({
  preview,
  datasets,
  datasetVersions,
  authToken,
  compact = false,
}: {
  preview: WorkflowNodePreviewValue;
  datasets: DatasetSummary[];
  datasetVersions: DatasetVersionSummary[];
  authToken?: string | null;
  compact?: boolean;
}) {
  const previewRecord = preview as Record<string, unknown>;
  const datasetVersionId = getStringField(previewRecord, 'datasetVersionId', 'dataset_version_id');
  const datasetVersion = datasetVersionId
    ? datasetVersions.find((item) => item.id === datasetVersionId)
    : undefined;
  const dataset = datasetVersion
    ? datasets.find((item) => item.id === datasetVersion.datasetId)
    : undefined;

  if (looksLikeTimeSeriesPreview(preview, datasetVersion)) {
    return (
      <WorkflowTimeSeriesPreview
        preview={preview}
        datasetVersionId={datasetVersionId}
        authToken={authToken}
        datasetVersion={datasetVersion}
        compact={compact}
      />
    );
  }

  const bbox =
    normalizeBBox(previewRecord.bbox) ??
    datasetVersion?.bbox ??
    normalizeBBox(getRecordField(datasetVersion?.metadata ?? {}, 'download')?.bbox);
  const thumbnailUrl = getStringField(previewRecord, 'thumbnailUrl', 'thumbnail_url');
  if (bbox && looksLikeSpatialPreview(preview, dataset, datasetVersion)) {
    return (
      <WorkflowSpatialPreviewMap
        bbox={bbox}
        thumbnailUrl={thumbnailUrl}
        datasetVersionId={datasetVersionId}
        datasetKind={dataset?.kind}
        authToken={authToken}
        compact={compact}
      />
    );
  }

  return null;
}
