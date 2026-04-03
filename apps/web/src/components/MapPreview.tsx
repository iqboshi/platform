import type { Extent } from 'ol/extent';

import { Card, Typography } from 'antd';
import Feature from 'ol/Feature';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import { fromLonLat, transformExtent } from 'ol/proj';
import OSM from 'ol/source/OSM';
import VectorSource from 'ol/source/Vector';
import { Fill, Stroke, Style } from 'ol/style';
import { useEffect, useRef } from 'react';
import { fromExtent } from 'ol/geom/Polygon';

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
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const baseLayer = new TileLayer({
      source: new OSM(),
    });

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
      map.setTarget(undefined);
    };
  }, [extent]);

  return (
    <Card className="map-card" bordered={false}>
      <div className="map-card-header">
        <div>
          <Text className="panel-kicker">Map Preview</Text>
          <Paragraph className="map-card-title">{title}</Paragraph>
        </div>
        {previewUrl ? <Text className="map-card-badge">TileJSON: {previewUrl}</Text> : null}
      </div>
      <Paragraph className="map-card-subtitle">{subtitle}</Paragraph>
      <div ref={containerRef} className="map-surface" />
    </Card>
  );
}
