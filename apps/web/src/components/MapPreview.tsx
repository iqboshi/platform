import type { Extent } from 'ol/extent';

import { Card, Segmented, Typography } from 'antd';
import Feature from 'ol/Feature';
import Map from 'ol/Map';
import { unByKey } from 'ol/Observable';
import View from 'ol/View';
import type { EventsKey } from 'ol/events';
import VectorLayer from 'ol/layer/Vector';
import { fromLonLat, transformExtent } from 'ol/proj';
import VectorSource from 'ol/source/Vector';
import { Fill, Stroke, Style } from 'ol/style';
import { fromExtent } from 'ol/geom/Polygon';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useI18n } from '@/i18n/useI18n';
import {
  createBaseTileLayer,
  getMapBaseLayerLabel,
  getMapBaseLayerSourceHint,
  getNextMapBaseLayerKey,
  listMapBaseLayerOptions,
  persistMapBaseLayer,
  readStoredMapBaseLayer,
  type MapBaseLayerKey,
} from './map-base-layers';

const { Paragraph, Text } = Typography;

export function MapPreview({
  title,
  subtitle,
  extent,
  previewUrl,
}: {
  title: string;
  subtitle: string;
  extent?: [number, number, number, number];
  previewUrl?: string;
}) {
  const { locale, t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fallbackTriedKeysRef = useRef<MapBaseLayerKey[]>([]);
  const [baseLayerKey, setBaseLayerKey] = useState<MapBaseLayerKey>(() => readStoredMapBaseLayer());
  const [baseLayerWarning, setBaseLayerWarning] = useState<string>();
  const baseLayerOptions = useMemo(() => listMapBaseLayerOptions(locale), [locale]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    let disposed = false;
    const baseLayer = createBaseTileLayer(baseLayerKey);
    const baseSource = baseLayer.getSource();
    let firstTileLoaded = false;
    let tileErrorCount = 0;
    let switchedByFallback = false;
    const listeners: EventsKey[] = [];
    if (!fallbackTriedKeysRef.current.includes(baseLayerKey)) {
      fallbackTriedKeysRef.current = [...fallbackTriedKeysRef.current, baseLayerKey];
    }

    setBaseLayerWarning(undefined);
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
            const sourceHint = getMapBaseLayerSourceHint(baseLayerKey);
            setBaseLayerWarning(
              locale === 'zh-CN'
                ? `底图请求失败：${sourceHint}`
                : `Basemap request failed: ${sourceHint}`,
            );
          }
          if (firstTileLoaded || switchedByFallback || tileErrorCount < 8) {
            return;
          }
          const fallbackLayerKey = getNextMapBaseLayerKey(
            baseLayerKey,
            fallbackTriedKeysRef.current,
          );
          if (!fallbackLayerKey || disposed) {
            return;
          }
          switchedByFallback = true;
          fallbackTriedKeysRef.current = [...fallbackTriedKeysRef.current, fallbackLayerKey];
          const fallbackLabel = getMapBaseLayerLabel(fallbackLayerKey, locale);
          setBaseLayerWarning(
            locale === 'zh-CN'
              ? `检测到当前底图不可用，已切换到 ${fallbackLabel}。`
              : `Current basemap is unavailable, switched to ${fallbackLabel}.`,
          );
          setBaseLayerKey(fallbackLayerKey);
          persistMapBaseLayer(fallbackLayerKey);
        }),
      );
    }

    const layers = [baseLayer];
    const map = new Map({
      target: containerRef.current,
      layers,
      view: new View({
        center: fromLonLat([116.5, 39.95]),
        zoom: 9,
      }),
    });

    if (extent) {
      const projectedExtent = transformExtent(extent as Extent, 'EPSG:4326', 'EPSG:3857');
      const feature = new Feature({
        geometry: fromExtent(projectedExtent),
      });
      const overlay = new VectorLayer({
        source: new VectorSource({ features: [feature] }),
        style: new Style({
          stroke: new Stroke({ color: '#f59e0b', width: 2 }),
          fill: new Fill({ color: 'rgba(245, 158, 11, 0.12)' }),
        }),
      });
      map.addLayer(overlay);
      map.getView().fit(projectedExtent, {
        padding: [36, 36, 36, 36],
      });
    }

    return () => {
      disposed = true;
      unByKey(listeners);
      map.setTarget(undefined);
    };
  }, [baseLayerKey, extent, locale]);

  return (
    <Card className="map-card" variant="borderless">
      <div className="map-card-header">
        <div>
          <Text className="panel-kicker">{t('map.preview')}</Text>
          <Paragraph className="map-card-title">{title}</Paragraph>
        </div>
        <div className="map-card-controls">
          <Segmented
            size="small"
            value={baseLayerKey}
            options={baseLayerOptions}
            onChange={(value) => {
              const nextValue = value as MapBaseLayerKey;
              fallbackTriedKeysRef.current = [nextValue];
              setBaseLayerKey(nextValue);
              persistMapBaseLayer(nextValue);
            }}
          />
          {previewUrl ? (
            <Text className="map-card-badge">
              {t('map.tilejson')}: {previewUrl}
            </Text>
          ) : null}
        </div>
      </div>
      <Paragraph className="map-card-subtitle">{subtitle}</Paragraph>
      {baseLayerWarning ? <Text type="warning">{baseLayerWarning}</Text> : null}
      <div ref={containerRef} className="map-surface" />
    </Card>
  );
}
