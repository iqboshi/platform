import { useState } from 'react';
import { Button, Select, Space, Table, Tag, Typography } from 'antd';

const { Text, Paragraph } = Typography;
interface StageRow {
  date: string; mean: number; ndvi: number; ndre: number; vegetationCoverage: number;
  low: number; medium: number; high: number; spectrum: number[];
}
interface Frame {
  date: string; rgb: string; feature: string; featureLabel: string; result: string;
  sampleGrid: (number | null)[][];
}
interface Report {
  researchDemo: boolean; title: string; unit: string; execution: string; description: string;
  rows: StageRow[]; images: Frame[]; steps: string[]; legend: string[]; bbox: number[];
}

function Curve({ series, labels, caption }: {
  series: { name: string; values: (number | null)[]; color: string }[];
  labels: string[]; caption: string;
}) {
  const numbers = series.flatMap(s => s.values.filter((v): v is number => v !== null));
  const maximum = Math.max(0.01, ...numbers) * 1.15;
  const px = (i: number) => 50 + i * 540 / Math.max(1, labels.length-1);
  const py = (v: number) => 160 - v / maximum * 125;
  return <div className="research-curve"><Text strong>{caption}</Text>
    <svg viewBox="0 0 640 215" role="img" aria-label={caption}>
      {[0, 0.5, 1].map(t => <g key={t}><line x1="50" x2="590" y1={160-t*125} y2={160-t*125} stroke="#dbe4e8" />
        <text x="4" y={165-t*125} fontSize="11" fill="#64748b">{(maximum*t).toFixed(2)}</text></g>)}
      {labels.map((label,i) => <text key={label} x={px(i)} y="185" textAnchor="middle" fontSize="11" fill="#475569">{label}</text>)}
      {series.map(s => <g key={s.name}>
        {s.values.map((v,i) => v !== null && <g key={i}>
          {i > 0 && s.values[i-1] !== null && <line x1={px(i-1)} y1={py(s.values[i-1]!)} x2={px(i)} y2={py(v)} stroke={s.color} strokeWidth="2.5" />}
          <circle cx={px(i)} cy={py(v)} r="4" fill={s.color}><title>{s.name} · {labels[i]}：{v.toFixed(4)}</title></circle>
        </g>)}
      </g>)}
    </svg>
    <Space wrap>{series.map(s => <Tag key={s.name} color={s.color}>{s.name}</Tag>)}</Space>
  </div>;
}

export function ResearchDemoPreview({ value }: { value: unknown }) {
  const report = value as Report;
  const [index, setIndex] = useState(0);
  const [point, setPoint] = useState<[number, number] | null>(null);
  if (!report?.researchDemo || !report.images?.length) return null;
  const frame = report.images[Math.min(index, report.images.length-1)];
  const row = report.rows[Math.min(index, report.rows.length-1)];
  const percent = (v: number) => `${(v*100).toFixed(1)}%`;
  return <div className="research-demo-preview">
    <div className="research-demo-header"><div><Text strong>{report.title}</Text><Paragraph type="secondary">{report.execution}</Paragraph></div>
      <Select aria-label="采集日期" value={frame.date} options={report.images.map(f => ({label:f.date,value:f.date}))}
        onChange={date => setIndex(report.images.findIndex(f => f.date === date))} />
    </div>
    <Space wrap>{report.steps.map((step,i) => <Tag key={step} color="cyan">{i+1} · {step}</Tag>)}</Space>
    <div className="research-image-grid">
      {[{label:'真实无人机影像',src:frame.rgb},{label:frame.featureLabel,src:frame.feature},{label:report.unit,src:frame.result}].map((item,i) =>
        <div className="research-image-panel" key={item.label}><Text strong>{item.label}</Text>
          <div className="research-image-surface"><img src={item.src} alt={`${frame.date} ${item.label}`}
            style={{cursor:i===2?'crosshair':'default'}} onClick={i===2? event => {
              const rect=event.currentTarget.getBoundingClientRect();
              setPoint([Math.min(31,Math.max(0,Math.round((event.clientX-rect.left)/rect.width*31))),
                        Math.min(31,Math.max(0,Math.round((event.clientY-rect.top)/rect.height*31)))]);
            }:undefined} /></div>
        </div>)}
    </div>
    <div className="research-stat-strip">
      <div><Text type="secondary">区域平均指数</Text><strong>{row.mean.toFixed(3)}</strong></div>
      <div><Text type="secondary">植被覆盖</Text><strong>{percent(row.vegetationCoverage)}</strong></div>
      <div><Text type="secondary">NDVI</Text><strong>{row.ndvi.toFixed(3)}</strong></div>
      <div><Text type="secondary">NDRE</Text><strong>{row.ndre.toFixed(3)}</strong></div>
    </div>
    <Space wrap>{report.legend.map((label,i) => <Tag color={['#a64331','#f1c35d','#196953'][i]} key={label}>{label}</Tag>)}</Space>
    {report.rows.length > 1 ? <>
      <Paragraph type="secondary">点击结果图查询相同位置的阶段变化。所有阶段使用共同有效区域和一致的色标。</Paragraph>
      {point && <Space><Text>查询位置：{(report.bbox[0]+point[0]/31*(report.bbox[2]-report.bbox[0])).toFixed(6)}，
        {(report.bbox[3]-point[1]/31*(report.bbox[3]-report.bbox[1])).toFixed(6)}</Text><Button size="small" onClick={()=>setPoint(null)}>清除点位</Button></Space>}
      <Curve caption="四阶段潜势变化" labels={report.rows.map(r=>r.date)} series={[
        {name:'区域平均',values:report.rows.map(r=>r.mean),color:'#167d8d'},
        ...(point?[{name:'查询点位',values:report.images.map(f=>f.sampleGrid[point[1]][point[0]]),color:'#cb7840'}]:[])]} />
    </> : <Curve caption="真实输入的平均光谱" labels={['蓝光','绿光','红光','红边','近红外']}
      series={[{name:'输入波段均值',values:row.spectrum,color:'#167d8d'}]} />}
    <Table size="small" pagination={false} rowKey="date" dataSource={report.rows} columns={[
      {title:'采集日期',dataIndex:'date'}, {title:'平均指数',dataIndex:'mean'},
      {title:'低值占比',dataIndex:'low',render:percent},{title:'中值占比',dataIndex:'medium',render:percent},
      {title:'高值占比',dataIndex:'high',render:percent}]} />
    <Text type="secondary">{report.description}</Text>
  </div>;
}
