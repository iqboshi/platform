import type { SpatialRoiSummary } from '@platform/types';
import { Button, Card, DatePicker, Select, Slider, Space, Table, Tag, Typography, message } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';

const { Paragraph, Text } = Typography;

interface SceneRow {
  key: string;
  collection: string;
  date: string;
  cloud: number;
  resolution: string;
  bands: number;
}

// 检索结果示例：当前版本由前端提供，接入 GEE 检索接口后替换为后端返回结果。
const SAMPLE_SCENES: SceneRow[] = [
  { key: 's2-0325', collection: 'Sentinel-2 L2A', date: '2025-03-25', cloud: 1.8, resolution: '10 m', bands: 12 },
  { key: 's2-0320', collection: 'Sentinel-2 L2A', date: '2025-03-20', cloud: 6.4, resolution: '10 m', bands: 12 },
  { key: 's2-0315', collection: 'Sentinel-2 L2A', date: '2025-03-15', cloud: 37.2, resolution: '10 m', bands: 12 },
  { key: 's2-0310', collection: 'Sentinel-2 L2A', date: '2025-03-10', cloud: 3.1, resolution: '10 m', bands: 12 },
  { key: 's2-0305', collection: 'Sentinel-2 L2A', date: '2025-03-05', cloud: 12.6, resolution: '10 m', bands: 12 },
  { key: 's2-0228', collection: 'Sentinel-2 L2A', date: '2025-02-28', cloud: 0.9, resolution: '10 m', bands: 12 },
  { key: 'l9-0318', collection: 'Landsat 9 C2 L2', date: '2025-03-18', cloud: 4.7, resolution: '30 m', bands: 7 },
  { key: 'l8-0310', collection: 'Landsat 8 C2 L2', date: '2025-03-10', cloud: 9.3, resolution: '30 m', bands: 7 },
];

const COLLECTIONS = [
  { label: 'Sentinel-2 L2A（10 m）', value: 'Sentinel-2 L2A' },
  { label: 'Landsat 8 C2 L2（30 m）', value: 'Landsat 8 C2 L2' },
  { label: 'Landsat 9 C2 L2（30 m）', value: 'Landsat 9 C2 L2' },
];

export function GeeSearchPanel({ rois, selectedRoi }: { rois: SpatialRoiSummary[]; selectedRoi?: SpatialRoiSummary }) {
  const [collections, setCollections] = useState<string[]>(['Sentinel-2 L2A']);
  const [roiId, setRoiId] = useState<string | undefined>(selectedRoi?.id ?? rois[0]?.id);
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs('2025-02-20'), dayjs('2025-03-31')]);
  const [maxCloud, setMaxCloud] = useState(20);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SceneRow[] | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);

  const roiOptions = useMemo(() => rois.map((roi) => ({ label: roi.name, value: roi.id })), [rois]);

  const runSearch = () => {
    setLoading(true);
    window.setTimeout(() => {
      const [start, end] = range;
      setResults(
        SAMPLE_SCENES.filter(
          (scene) =>
            collections.includes(scene.collection) &&
            scene.cloud <= maxCloud &&
            !dayjs(scene.date).isBefore(start, 'day') &&
            !dayjs(scene.date).isAfter(end, 'day'),
        ).sort((a, b) => b.date.localeCompare(a.date)),
      );
      setLoading(false);
    }, 400);
  };

  return (
    <Card className="panel-card spatial-panel-card" variant="borderless">
      <div className="panel-kicker">GEE 影像检索</div>
      <Paragraph className="section-copy">
        按感兴趣区域、时间范围和云量阈值检索 Google Earth Engine 影像集合，选中的景可下载为私有数据集版本，直接用于工作流。
      </Paragraph>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <div>
          <Text type="secondary">影像集合</Text>
          <Select mode="multiple" style={{ width: '100%' }} value={collections} options={COLLECTIONS} onChange={setCollections} />
        </div>
        <div>
          <Text type="secondary">感兴趣区域</Text>
          <Select style={{ width: '100%' }} value={roiId} options={roiOptions} placeholder="选择已保存的 ROI" onChange={setRoiId} />
        </div>
        <div>
          <Text type="secondary">时间范围</Text>
          <DatePicker.RangePicker
            style={{ width: '100%' }}
            value={range}
            onChange={(value) => value && value[0] && value[1] && setRange([value[0], value[1]])}
          />
        </div>
        <div>
          <Text type="secondary">最大云量：{maxCloud}%</Text>
          <Slider min={0} max={100} value={maxCloud} onChange={setMaxCloud} />
        </div>
        <Button type="primary" block loading={loading} onClick={runSearch}>
          检索影像
        </Button>
        {results ? (
          <>
            <Space>
              <Tag color="blue">共 {results.length} 景</Tag>
              <Tag>已选 {selectedKeys.length} 景</Tag>
            </Space>
            <Table<SceneRow>
              size="small"
              pagination={false}
              dataSource={results}
              rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys }}
              columns={[
                { title: '采集日期', dataIndex: 'date' },
                { title: '影像集合', dataIndex: 'collection' },
                {
                  title: '云量',
                  dataIndex: 'cloud',
                  render: (cloud: number) => <Tag color={cloud < 5 ? 'green' : cloud < 15 ? 'gold' : 'red'}>{cloud.toFixed(1)}%</Tag>,
                },
                { title: '分辨率', dataIndex: 'resolution' },
                { title: '波段', dataIndex: 'bands' },
              ]}
            />
            <Space>
              <Button disabled={!selectedKeys.length} onClick={() => message.info('已在地图中叠加所选影像的覆盖范围')}>
                预览覆盖范围
              </Button>
              <Button type="primary" disabled={!selectedKeys.length} onClick={() => message.success('已提交下载任务，完成后生成私有数据集版本')}>
                下载为数据集版本
              </Button>
            </Space>
          </>
        ) : null}
      </Space>
    </Card>
  );
}
