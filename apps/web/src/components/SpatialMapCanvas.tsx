import type { SpatialOverlaySummary, SpatialRoiSummary } from '@platform/types';

import Feature from 'ol/Feature';
import GeoJSON from 'ol/format/GeoJSON';
import type Geometry from 'ol/geom/Geometry';
import Point from 'ol/geom/Point';
import Draw, { createBox } from 'ol/interaction/Draw';
import Modify from 'ol/interaction/Modify';
import Select from 'ol/interaction/Select';
import OlMap from 'ol/Map';
import { unByKey } from 'ol/Observable';
import { pointerMove as pointerMoveCondition } from 'ol/events/condition';
import type { EventsKey } from 'ol/events';
import type BaseLayer from 'ol/layer/Base';
import VectorLayer from 'ol/layer/Vector';
import WebGLTileLayer from 'ol/layer/WebGLTile';
import View from 'ol/View';
import { fromLonLat, transformExtent } from 'ol/proj';
import GeoTIFFSource from 'ol/source/GeoTIFF';
import VectorSource from 'ol/source/Vector';
import { Circle as CircleStyle, Fill, Stroke, Style, Text as TextStyle } from 'ol/style';
import { useEffect, useRef, useState } from 'react';

import { fetchDatasetVersionBlob, fetchDatasetVersionText } from '@/lib/api';
import {
  createBaseTileLayer,
  getMapBaseLayerSourceHint,
  getNextMapBaseLayerKey,
  type MapBaseLayerKey,
} from './map-base-layers';

export interface SpatialDraftGeometry {
  geometryType: 'rectangle' | 'polygon';
  geometry: Record<string, unknown>;
  bbox: [number, number, number, number];
}

export interface SpatialMapFocusRequest {
  requestId: number;
  longitude?: number;
  latitude?: number;
  zoom?: number;
  bbox?: [number, number, number, number];
}

export interface SpatialCoordinateLabelPoint {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
}

interface SpatialMapCanvasProps {
  token?: string | null;
  rois: SpatialRoiSummary[];
  overlays: SpatialOverlaySummary[];
  savedCoordinatePoints?: SpatialCoordinateLabelPoint[];
  showSavedCoordinateLabels?: boolean;
  baseLayerKey: MapBaseLayerKey;
  selectedRoiId?: string;
  selectedOverlayIds: string[];
  overlayOpacities: Record<string, number>;
  drawMode?: 'rectangle' | 'polygon' | null;
  draftGeometry?: SpatialDraftGeometry;
  focusRequest?: SpatialMapFocusRequest;
  geometryEditEnabled: boolean;
  onDrawComplete: (draft: SpatialDraftGeometry) => void;
  onSelectRoi: (roiId?: string) => void;
  onSelectedRoiGeometryChange: (draft: SpatialDraftGeometry) => void;
  onOverlayError?: (message: string) => void;
  onBaseLayerFallback?: (nextBaseLayer: MapBaseLayerKey, reason: string) => void;
}

interface OverlayLayerEntry {
  id: string;
  layer: BaseLayer;
  objectUrl?: string;
}

const geoJsonFormat = new GeoJSON();

function createRoiStyle(color: string, fillColor: string): Style {
  return new Style({
    stroke: new Stroke({
      color,
      width: 2,
    }),
    fill: new Fill({
      color: fillColor,
    }),
    image: new CircleStyle({
      radius: 4,
      fill: new Fill({ color }),
      stroke: new Stroke({ color: 'rgba(255,255,255,0.95)', width: 1.5 }),
    }),
  });
}

const savedRoiStyle = createRoiStyle('rgba(10, 132, 255, 0.92)', 'rgba(10, 132, 255, 0.16)');
const draftRoiStyle = createRoiStyle('rgba(255, 159, 10, 0.95)', 'rgba(255, 159, 10, 0.18)');
const selectedRoiStyle = createRoiStyle('rgba(255, 69, 58, 0.96)', 'rgba(255, 69, 58, 0.2)');
const vectorOverlayStyle = createRoiStyle('rgba(48, 209, 88, 0.86)', 'rgba(48, 209, 88, 0.1)');
const hoveredRoiCoreStyle = createRoiStyle('rgba(74, 163, 255, 0.98)', 'rgba(74, 163, 255, 0.24)');
const hoveredRoiGlowStyle = new Style({
  stroke: new Stroke({
    color: 'rgba(74, 163, 255, 0.42)',
    width: 8,
  }),
  fill: new Fill({
    color: 'rgba(74, 163, 255, 0.16)',
  }),
});

function createSavedCoordinateLabelStyle(label: string): Style {
  return new Style({
    image: new CircleStyle({
      radius: 5,
      fill: new Fill({ color: 'rgba(255, 59, 48, 0.92)' }),
      stroke: new Stroke({ color: 'rgba(255,255,255,0.96)', width: 2 }),
    }),
    text: new TextStyle({
      text: label,
      font: '600 12px "SF Pro Text", "Segoe UI", sans-serif',
      offsetY: -16,
      fill: new Fill({ color: 'rgba(30,30,30,0.95)' }),
      backgroundFill: new Fill({ color: 'rgba(255,255,255,0.88)' }),
      backgroundStroke: new Stroke({ color: 'rgba(255,255,255,0.95)', width: 1 }),
      padding: [3, 7, 3, 7],
    }),
  });
}

function toDraftGeometry(
  feature: Feature<Geometry>,
  geometryType: 'rectangle' | 'polygon',
): SpatialDraftGeometry {
  const geometry = geoJsonFormat.writeGeometryObject(feature.getGeometry() as Geometry, {
    featureProjection: 'EPSG:3857',
    dataProjection: 'EPSG:4326',
  }) as Record<string, unknown>;
  const extent = transformExtent(
    (feature.getGeometry() as Geometry).getExtent(),
    'EPSG:3857',
    'EPSG:4326',
  );

  return {
    geometryType,
    geometry,
    bbox: extent as [number, number, number, number],
  };
}

export function SpatialMapCanvas({
  token,
  rois,
  overlays,
  savedCoordinatePoints = [],
  showSavedCoordinateLabels = false,
  baseLayerKey,
  selectedRoiId,
  selectedOverlayIds,
  overlayOpacities,
  drawMode,
  draftGeometry,
  focusRequest,
  geometryEditEnabled,
  onDrawComplete,
  onSelectRoi,
  onSelectedRoiGeometryChange,
  onOverlayError,
  onBaseLayerFallback,
}: SpatialMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<OlMap | null>(null);
  const roiSourceRef = useRef<VectorSource<Feature<Geometry>> | null>(null);
  const draftSourceRef = useRef<VectorSource<Feature<Geometry>> | null>(null);
  const savedCoordinateSourceRef = useRef<VectorSource<Feature<Geometry>> | null>(null);
  const savedCoordinateLayerRef = useRef<VectorLayer<VectorSource<Feature<Geometry>>> | null>(null);
  const roiLayerRef = useRef<VectorLayer<VectorSource<Feature<Geometry>>> | null>(null);
  const selectInteractionRef = useRef<Select | null>(null);
  const hoverInteractionRef = useRef<Select | null>(null);
  const modifyInteractionRef = useRef<Modify | null>(null);
  const drawInteractionRef = useRef<Draw | null>(null);
  const overlayLayersRef = useRef<Map<string, OverlayLayerEntry>>(new Map());
  const overlayLoadingRef = useRef<Set<string>>(new Set());
  const selectedRoiIdRef = useRef<string | undefined>(selectedRoiId);
  const onSelectRoiRef = useRef(onSelectRoi);
  const onDrawCompleteRef = useRef(onDrawComplete);
  const onSelectedRoiGeometryChangeRef = useRef(onSelectedRoiGeometryChange);
  const onOverlayErrorRef = useRef(onOverlayError);
  const onBaseLayerFallbackRef = useRef(onBaseLayerFallback);
  const fallbackTriedKeysRef = useRef<MapBaseLayerKey[]>([]);
  const selectedOverlayIdsRef = useRef<string[]>(selectedOverlayIds);
  const [baseLayerWarning, setBaseLayerWarning] = useState<string>();

  useEffect(() => {
    onSelectRoiRef.current = onSelectRoi;
  }, [onSelectRoi]);

  useEffect(() => {
    onDrawCompleteRef.current = onDrawComplete;
  }, [onDrawComplete]);

  useEffect(() => {
    onSelectedRoiGeometryChangeRef.current = onSelectedRoiGeometryChange;
  }, [onSelectedRoiGeometryChange]);

  useEffect(() => {
    onOverlayErrorRef.current = onOverlayError;
  }, [onOverlayError]);

  useEffect(() => {
    onBaseLayerFallbackRef.current = onBaseLayerFallback;
  }, [onBaseLayerFallback]);

  useEffect(() => {
    selectedOverlayIdsRef.current = selectedOverlayIds;
  }, [selectedOverlayIds]);

  useEffect(() => {
    selectedRoiIdRef.current = selectedRoiId;
    roiSourceRef.current?.changed();
  }, [selectedRoiId]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    let disposed = false;
    const eventKeys: EventsKey[] = [];
    const overlayLayers = overlayLayersRef.current;
    const overlayLoading = overlayLoadingRef.current;
    const roiSource = new VectorSource<Feature<Geometry>>();
    const draftSource = new VectorSource<Feature<Geometry>>();
    const savedCoordinateSource = new VectorSource<Feature<Geometry>>();
    const baseLayer = createBaseTileLayer(baseLayerKey);
    const baseSource = baseLayer.getSource();
    let firstTileLoaded = false;
    let tileErrorCount = 0;
    let switchedByFallback = false;
    if (!fallbackTriedKeysRef.current.includes(baseLayerKey)) {
      fallbackTriedKeysRef.current = [...fallbackTriedKeysRef.current, baseLayerKey];
    }
    setBaseLayerWarning(undefined);

    if (baseSource && 'on' in baseSource) {
      eventKeys.push(
        baseSource.on('tileloadend', () => {
          firstTileLoaded = true;
          if (!disposed) {
            setBaseLayerWarning(undefined);
          }
        }),
      );
      eventKeys.push(
        baseSource.on('tileloaderror', () => {
          tileErrorCount += 1;
          if (!disposed && tileErrorCount === 1) {
            setBaseLayerWarning(
              `Basemap request failed: ${getMapBaseLayerSourceHint(baseLayerKey)}`,
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
          const reason =
            baseLayerKey === 'china'
              ? '高德底图不可用，自动切换到 GeoQ。'
              : baseLayerKey === 'china_alt'
                ? 'GeoQ 底图不可用，自动切换到 OSM。'
                : '当前底图不可用。';
          setBaseLayerWarning(reason);
          onBaseLayerFallbackRef.current?.(nextBaseLayer, reason);
        }),
      );
    }

    const roiLayer = new VectorLayer({
      source: roiSource,
      style: (feature) => {
        const roiId = feature.get('roiId');
        if (typeof roiId !== 'string') {
          return savedRoiStyle;
        }
        if (roiId === selectedRoiIdRef.current) {
          return selectedRoiStyle;
        }
        return savedRoiStyle;
      },
      zIndex: 30,
    });
    const draftLayer = new VectorLayer({
      source: draftSource,
      style: draftRoiStyle,
      zIndex: 40,
    });
    const savedCoordinateLayer = new VectorLayer({
      source: savedCoordinateSource,
      visible: false,
      style: (feature) => {
        const label = String(feature.get('label') ?? '').trim();
        return createSavedCoordinateLabelStyle(label);
      },
      zIndex: 60,
    });
    const map = new OlMap({
      target: containerRef.current,
      layers: [baseLayer, roiLayer, draftLayer, savedCoordinateLayer],
      view: new View({
        center: [12958000, 4859500],
        zoom: 5,
      }),
    });
    const selectInteraction = new Select({
      layers: [roiLayer],
      style: selectedRoiStyle,
      hitTolerance: 8,
    });
    const hoverInteraction = new Select({
      condition: pointerMoveCondition,
      layers: [roiLayer],
      hitTolerance: 10,
      style: (feature) => {
        const roiId = feature.get('roiId');
        if (typeof roiId === 'string' && roiId === selectedRoiIdRef.current) {
          return [hoveredRoiGlowStyle, selectedRoiStyle];
        }
        return [hoveredRoiGlowStyle, hoveredRoiCoreStyle];
      },
    });

    selectInteraction.on('select', (event) => {
      const selectedFeature = event.selected[0];
      const roiId = selectedFeature?.get('roiId');
      onSelectRoiRef.current(typeof roiId === 'string' ? roiId : undefined);
    });
    hoverInteraction.on('select', (event) => {
      map.getTargetElement().style.cursor = event.selected.length ? 'pointer' : '';
    });

    map.addInteraction(selectInteraction);
    map.addInteraction(hoverInteraction);
    mapRef.current = map;
    roiSourceRef.current = roiSource;
    draftSourceRef.current = draftSource;
    savedCoordinateSourceRef.current = savedCoordinateSource;
    savedCoordinateLayerRef.current = savedCoordinateLayer;
    roiLayerRef.current = roiLayer;
    selectInteractionRef.current = selectInteraction;
    hoverInteractionRef.current = hoverInteraction;

    return () => {
      disposed = true;
      unByKey(eventKeys);
      overlayLayers.forEach((entry) => {
        map.removeLayer(entry.layer);
        if (entry.objectUrl) {
          URL.revokeObjectURL(entry.objectUrl);
        }
      });
      overlayLayers.clear();
      overlayLoading.clear();
      if (modifyInteractionRef.current) {
        map.removeInteraction(modifyInteractionRef.current);
        modifyInteractionRef.current = null;
      }
      if (hoverInteractionRef.current) {
        map.removeInteraction(hoverInteractionRef.current);
        hoverInteractionRef.current = null;
      }
      if (drawInteractionRef.current) {
        map.removeInteraction(drawInteractionRef.current);
        drawInteractionRef.current = null;
      }
      map.setTarget(undefined);
      mapRef.current = null;
    };
  }, [baseLayerKey]);

  useEffect(() => {
    const roiSource = roiSourceRef.current;
    if (!roiSource) {
      return;
    }

    roiSource.clear();
    const features = rois.map((roi) => {
      const feature = geoJsonFormat.readFeature(roi.geometry, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857',
      }) as Feature<Geometry>;
      feature.setId(roi.id);
      feature.set('roiId', roi.id);
      feature.set('geometryType', roi.geometryType);
      feature.set('name', roi.name);
      return feature;
    });
    roiSource.addFeatures(features);
  }, [rois]);

  useEffect(() => {
    const draftSource = draftSourceRef.current;
    if (!draftSource) {
      return;
    }

    draftSource.clear();
    if (!draftGeometry) {
      return;
    }

    const feature = geoJsonFormat.readFeature(draftGeometry.geometry, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857',
    }) as Feature<Geometry>;
    draftSource.addFeature(feature);
  }, [draftGeometry]);

  useEffect(() => {
    const savedCoordinateSource = savedCoordinateSourceRef.current;
    if (!savedCoordinateSource) {
      return;
    }

    savedCoordinateSource.clear();
    const features = savedCoordinatePoints
      .filter(
        (point) =>
          Number.isFinite(point.longitude) &&
          Number.isFinite(point.latitude) &&
          Math.abs(point.longitude) <= 180 &&
          Math.abs(point.latitude) <= 90,
      )
      .map((point) => {
        const feature = new Feature({
          geometry: new Point(fromLonLat([point.longitude, point.latitude])),
        });
        feature.setId(point.id);
        feature.set('label', point.name);
        return feature as Feature<Geometry>;
      });
    savedCoordinateSource.addFeatures(features);
  }, [savedCoordinatePoints]);

  useEffect(() => {
    const layer = savedCoordinateLayerRef.current;
    if (!layer) {
      return;
    }
    layer.setVisible(showSavedCoordinateLabels);
  }, [showSavedCoordinateLabels]);

  useEffect(() => {
    const map = mapRef.current;
    const roiSource = roiSourceRef.current;
    const selectInteraction = selectInteractionRef.current;
    if (!map || !roiSource || !selectInteraction) {
      return;
    }

    const selectedCollection = selectInteraction.getFeatures();
    selectedCollection.clear();
    if (!selectedRoiId) {
      return;
    }

    const targetFeature = roiSource
      .getFeatures()
      .find((feature) => feature.get('roiId') === selectedRoiId);
    if (!targetFeature) {
      return;
    }

    selectedCollection.push(targetFeature);
    const geometry = targetFeature.getGeometry();
    if (geometry) {
      map.getView().fit(geometry.getExtent(), {
        padding: [40, 40, 40, 40],
        maxZoom: 13,
        duration: 240,
      });
    }
  }, [selectedRoiId]);

  useEffect(() => {
    const map = mapRef.current;
    const selectInteraction = selectInteractionRef.current;
    const selectedRoi = rois.find((item) => item.id === selectedRoiId);
    if (!map || !selectInteraction || !selectedRoi) {
      return;
    }

    if (!geometryEditEnabled) {
      if (modifyInteractionRef.current) {
        map.removeInteraction(modifyInteractionRef.current);
        modifyInteractionRef.current = null;
      }
      return;
    }

    if (modifyInteractionRef.current) {
      map.removeInteraction(modifyInteractionRef.current);
      modifyInteractionRef.current = null;
    }

    const modifyInteraction = new Modify({
      features: selectInteraction.getFeatures(),
    });
    modifyInteraction.on('modifyend', (event) => {
      const feature = event.features.item(0) as Feature<Geometry> | undefined;
      if (!feature) {
        return;
      }
      onSelectedRoiGeometryChangeRef.current(
        toDraftGeometry(feature, selectedRoi.geometryType),
      );
    });

    map.addInteraction(modifyInteraction);
    modifyInteractionRef.current = modifyInteraction;

    return () => {
      if (modifyInteractionRef.current === modifyInteraction) {
        map.removeInteraction(modifyInteraction);
        modifyInteractionRef.current = null;
      }
    };
  }, [geometryEditEnabled, rois, selectedRoiId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusRequest) {
      return;
    }

    const view = map.getView();
    const { longitude, latitude, zoom, bbox } = focusRequest;
    if (
      Array.isArray(bbox) &&
      bbox.length === 4 &&
      bbox.every((value) => Number.isFinite(value)) &&
      bbox[0] < bbox[2] &&
      bbox[1] < bbox[3]
    ) {
      const projectedExtent = transformExtent(bbox, 'EPSG:4326', 'EPSG:3857');
      view.fit(projectedExtent, {
        padding: [40, 40, 40, 40],
        maxZoom: zoom ?? 14,
        duration: 320,
      });
      return;
    }

    if (
      typeof longitude === 'number' &&
      typeof latitude === 'number' &&
      Number.isFinite(longitude) &&
      Number.isFinite(latitude) &&
      Math.abs(longitude) <= 180 &&
      Math.abs(latitude) <= 90
    ) {
      const fallbackZoom = Math.max(view.getZoom() ?? 5, 12);
      view.animate({
        center: fromLonLat([longitude, latitude]),
        zoom: zoom ?? fallbackZoom,
        duration: 320,
      });
    }
  }, [focusRequest]);

  useEffect(() => {
    const map = mapRef.current;
    const draftSource = draftSourceRef.current;
    if (!map || !draftSource) {
      return;
    }

    draftSource.clear();
    if (drawInteractionRef.current) {
      map.removeInteraction(drawInteractionRef.current);
      drawInteractionRef.current = null;
    }

    if (!drawMode) {
      return;
    }

    const drawInteraction = new Draw({
      source: draftSource,
      type: drawMode === 'rectangle' ? 'Circle' : 'Polygon',
      geometryFunction: drawMode === 'rectangle' ? createBox() : undefined,
    });

    drawInteraction.on('drawstart', () => {
      draftSource.clear();
    });
    drawInteraction.on('drawend', (event) => {
      draftSource.clear();
      draftSource.addFeature(event.feature as Feature<Geometry>);
      onDrawCompleteRef.current(toDraftGeometry(event.feature as Feature<Geometry>, drawMode));
    });

    map.addInteraction(drawInteraction);
    drawInteractionRef.current = drawInteraction;

    return () => {
      if (drawInteractionRef.current === drawInteraction) {
        map.removeInteraction(drawInteraction);
        drawInteractionRef.current = null;
      }
    };
  }, [drawMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const selectedSet = new Set(selectedOverlayIds);
    const overlaysById = new Map(overlays.map((overlay) => [overlay.id, overlay]));

    overlayLayersRef.current.forEach((entry, id) => {
      if (!selectedSet.has(id) || !overlaysById.has(id) || !token) {
        map.removeLayer(entry.layer);
        if (entry.objectUrl) {
          URL.revokeObjectURL(entry.objectUrl);
        }
        overlayLayersRef.current.delete(id);
        overlayLoadingRef.current.delete(id);
      }
    });

    if (!token) {
      return;
    }

    const loadOverlay = async (overlay: SpatialOverlaySummary): Promise<void> => {
      if (overlayLoadingRef.current.has(overlay.id) || overlayLayersRef.current.has(overlay.id)) {
        return;
      }
      overlayLoadingRef.current.add(overlay.id);

      try {
        const opacity = overlayOpacities[overlay.id] ?? overlay.opacity;
        if (overlay.overlayType === 'vector') {
          const text = await fetchDatasetVersionText(token, overlay.datasetVersionId);
          if (
            mapRef.current !== map ||
            !selectedOverlayIdsRef.current.includes(overlay.id) ||
            overlayLayersRef.current.has(overlay.id)
          ) {
            return;
          }

          const source = new VectorSource({
            features: geoJsonFormat.readFeatures(text, {
              dataProjection: 'EPSG:4326',
              featureProjection: 'EPSG:3857',
            }) as Feature<Geometry>[],
          });
          const layer = new VectorLayer({
            source,
            style: vectorOverlayStyle,
            opacity,
            zIndex: 12,
          });
          map.addLayer(layer);
          overlayLayersRef.current.set(overlay.id, { id: overlay.id, layer });
          return;
        }

        const blob = await fetchDatasetVersionBlob(token, overlay.datasetVersionId);
        if (
          mapRef.current !== map ||
          !selectedOverlayIdsRef.current.includes(overlay.id) ||
          overlayLayersRef.current.has(overlay.id)
        ) {
          return;
        }

        const objectUrl = URL.createObjectURL(blob);
        const layer = new WebGLTileLayer({
          source: new GeoTIFFSource({
            sources: [{ url: objectUrl }],
          }),
          opacity,
          zIndex: 10,
        });
        map.addLayer(layer);
        overlayLayersRef.current.set(overlay.id, { id: overlay.id, layer, objectUrl });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown overlay error.';
        onOverlayErrorRef.current?.(`${overlay.name}: ${message}`);
      } finally {
        overlayLoadingRef.current.delete(overlay.id);
      }
    };

    selectedOverlayIds.forEach((overlayId) => {
      const overlay = overlaysById.get(overlayId);
      if (!overlay) {
        return;
      }
      const loaded = overlayLayersRef.current.get(overlay.id);
      if (loaded) {
        loaded.layer.setOpacity(overlayOpacities[overlay.id] ?? overlay.opacity);
        return;
      }
      void loadOverlay(overlay);
    });
  }, [overlayOpacities, overlays, selectedOverlayIds, token]);

  return (
    <div className="spatial-map-canvas-shell">
      <div ref={containerRef} className="spatial-map-canvas" />
      {baseLayerWarning ? (
        <div className="spatial-map-warning-banner">{baseLayerWarning}</div>
      ) : null}
    </div>
  );
}
