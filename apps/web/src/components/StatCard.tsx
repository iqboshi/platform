import { Card, Typography } from 'antd';

const { Text, Title } = Typography;

export function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="stat-card" bordered={false}>
      <Text className="stat-label">{label}</Text>
      <Title level={2} className="stat-value">
        {value}
      </Title>
      <Text className="stat-detail">{detail}</Text>
    </Card>
  );
}
