import type { SpatialRoiSummary } from '@platform/types';

import { Button, Modal, Segmented, Space, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';

import {
  SpatialMapCanvas,
  type SpatialMapFocusRequest,
  type SpatialMapSelectedPoint,
} from '@/components/SpatialMapCanvas';
import {
  listMapBaseLayerOptions,
  persistMapBaseLayer,
  readStoredMapBaseLayer,
  type MapBaseLayerKey,
} from '@/components/map-base-layers';

const { Paragraph, Text } = Typography;

export interface WorkflowPointPickerModalProps {
  open: boolean;
  token?: string | null;
  locale?: string;
  spatialRois: SpatialRoiSummary[];
  initialPoint?: SpatialMapSelectedPoint | null;
  onCancel: () => void;
  onConfirm: (point: SpatialMapSelectedPoint) => void;
}

export function WorkflowPointPickerModal({
  open,
  token,
  locale = 'zh-CN',
  spatialRois,
  initialPoint,
  onCancel,
  onConfirm,
}: WorkflowPointPickerModalProps) {
  const [baseLayerKey, setBaseLayerKey] = useState<MapBaseLayerKey>(() => readStoredMapBaseLayer());
  const [selectedPoint, setSelectedPoint] = useState<SpatialMapSelectedPoint | null>(
    initialPoint ?? null,
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    setSelectedPoint(initialPoint ?? null);
  }, [initialPoint, open]);

  const copy = useMemo(
    () =>
      locale === 'zh-CN'
        ? {
            title: '地图选点',
            subtitle: '点击地图即可写入经纬度。保存后将自动回填到当前 GEE 点位时间序列节点。',
            hint: '可参考已保存 ROI 的位置，单击地图选择目标点位。',
            current: '当前坐标',
            empty: '尚未选择点位',
            confirm: '写入节点',
          }
        : {
            title: 'Pick Point On Map',
            subtitle:
              'Click the map to capture longitude and latitude, then write them back to the current GEE time-series node.',
            hint: 'Use saved ROIs as spatial reference and click the map to choose the target point.',
            current: 'Current coordinate',
            empty: 'No point selected yet',
            confirm: 'Apply To Node',
          },
    [locale],
  );

  const baseLayerOptions = useMemo(() => listMapBaseLayerOptions(locale), [locale]);
  const focusRequest = useMemo<SpatialMapFocusRequest | undefined>(() => {
    if (!selectedPoint) {
      return undefined;
    }
    return {
      requestId: Math.round(
        selectedPoint.longitude * 1_000_000 + selectedPoint.latitude * 1_000_000,
      ),
      longitude: selectedPoint.longitude,
      latitude: selectedPoint.latitude,
      zoom: 12,
    };
  }, [selectedPoint]);

  return (
    <Modal
      title={copy.title}
      open={open}
      width={980}
      onCancel={onCancel}
      footer={null}
      destroyOnClose
    >
      <div className="workflow-point-picker-modal">
        <Paragraph className="workflow-point-picker-copy">{copy.subtitle}</Paragraph>
        <div className="workflow-point-picker-toolbar">
          <Space wrap size={[12, 12]}>
            <Text type="secondary">{copy.hint}</Text>
            {selectedPoint ? (
              <Tag color="processing">
                {copy.current}: {selectedPoint.longitude.toFixed(6)}, {selectedPoint.latitude.toFixed(6)}
              </Tag>
            ) : (
              <Tag>{copy.empty}</Tag>
            )}
          </Space>
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
        <div className="workflow-point-picker-map">
          <SpatialMapCanvas
            token={token}
            locale={locale}
            rois={spatialRois}
            overlays={[]}
            baseLayerKey={baseLayerKey}
            selectedOverlayIds={[]}
            overlayOpacities={{}}
            focusRequest={focusRequest}
            selectedPoint={selectedPoint}
            pointSelectionEnabled
            geometryEditEnabled={false}
            onDrawComplete={() => undefined}
            onSelectRoi={() => undefined}
            onSelectPoint={setSelectedPoint}
            onSelectedRoiGeometryChange={() => undefined}
          />
        </div>
        <div className="workflow-point-picker-actions">
          <Button onClick={onCancel}>{locale === 'zh-CN' ? '取消' : 'Cancel'}</Button>
          <Button
            type="primary"
            disabled={!selectedPoint}
            onClick={() => {
              if (selectedPoint) {
                onConfirm(selectedPoint);
              }
            }}
          >
            {copy.confirm}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
