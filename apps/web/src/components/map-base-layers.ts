import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import XYZ from 'ol/source/XYZ';

export type MapBaseLayerKey = 'china' | 'china_alt' | 'osm';

export const MAP_BASE_LAYER_STORAGE_KEY = 'platform.map.baseLayer.v2';

interface MapBaseLayerDefinition {
  key: MapBaseLayerKey;
  labelZh: string;
  labelEn: string;
  sourceHostHint: string;
}

const MAP_BASE_LAYER_ORDER: MapBaseLayerKey[] = ['china', 'china_alt', 'osm'];

const MAP_BASE_LAYER_DEFINITIONS: Record<MapBaseLayerKey, MapBaseLayerDefinition> = {
  china: {
    key: 'china',
    labelZh: '高德卫星',
    labelEn: 'AMap Sat',
    sourceHostHint: 'webst0*.is.autonavi.com',
  },
  china_alt: {
    key: 'china_alt',
    labelZh: 'GeoQ',
    labelEn: 'GeoQ',
    sourceHostHint: 'map.geoq.cn',
  },
  osm: {
    key: 'osm',
    labelZh: 'OSM',
    labelEn: 'OSM',
    sourceHostHint: 'tile.openstreetmap.org',
  },
};

export function readStoredMapBaseLayer(): MapBaseLayerKey {
  if (typeof window === 'undefined') {
    return 'china';
  }

  const storedValue = window.localStorage.getItem(MAP_BASE_LAYER_STORAGE_KEY);
  if (storedValue === 'china' || storedValue === 'china_alt' || storedValue === 'osm') {
    return storedValue;
  }
  return 'china';
}

export function persistMapBaseLayer(nextValue: MapBaseLayerKey): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(MAP_BASE_LAYER_STORAGE_KEY, nextValue);
}

export function listMapBaseLayerOptions(
  locale: string,
): Array<{ label: string; value: MapBaseLayerKey }> {
  const isChinese = locale === 'zh-CN';
  return MAP_BASE_LAYER_ORDER.map((key) => ({
    value: key,
    label: isChinese
      ? MAP_BASE_LAYER_DEFINITIONS[key].labelZh
      : MAP_BASE_LAYER_DEFINITIONS[key].labelEn,
  }));
}

export function getMapBaseLayerLabel(baseLayerKey: MapBaseLayerKey, locale: string): string {
  const definition = MAP_BASE_LAYER_DEFINITIONS[baseLayerKey];
  return locale === 'zh-CN' ? definition.labelZh : definition.labelEn;
}

export function getMapBaseLayerSourceHint(baseLayerKey: MapBaseLayerKey): string {
  return MAP_BASE_LAYER_DEFINITIONS[baseLayerKey].sourceHostHint;
}

export function getNextMapBaseLayerKey(
  baseLayerKey: MapBaseLayerKey,
  triedKeys: MapBaseLayerKey[] = [],
): MapBaseLayerKey | null {
  const currentIndex = MAP_BASE_LAYER_ORDER.indexOf(baseLayerKey);
  if (currentIndex < 0) {
    return null;
  }

  for (let offset = 1; offset <= MAP_BASE_LAYER_ORDER.length; offset += 1) {
    const nextIndex = (currentIndex + offset) % MAP_BASE_LAYER_ORDER.length;
    const candidate = MAP_BASE_LAYER_ORDER[nextIndex];
    if (!triedKeys.includes(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function createBaseTileLayer(baseLayerKey: MapBaseLayerKey): TileLayer {
  if (baseLayerKey === 'osm') {
    return new TileLayer({
      source: new OSM({
        crossOrigin: 'anonymous',
      }),
      zIndex: 0,
    });
  }

  if (baseLayerKey === 'china') {
    return new TileLayer({
      source: new XYZ({
        crossOrigin: 'anonymous',
        maxZoom: 18,
        urls: [
          'https://webst01.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
          'https://webst02.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
          'https://webst03.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
          'https://webst04.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
        ],
        attributions: 'AMap',
      }),
      zIndex: 0,
    });
  }

  return new TileLayer({
    source: new XYZ({
      crossOrigin: 'anonymous',
      maxZoom: 18,
      url:
        'https://map.geoq.cn/ArcGIS/rest/services/ChinaOnlineStreetColor/' +
        'MapServer/tile/{z}/{y}/{x}',
      attributions: 'GeoQ',
    }),
    zIndex: 0,
  });
}
