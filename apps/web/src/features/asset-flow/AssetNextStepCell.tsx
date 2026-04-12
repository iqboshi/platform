import type { AssetNextStepModel } from './next-steps';

import { Button, Space, Tag, Typography } from 'antd';

const { Text } = Typography;

export function AssetNextStepCell({
  model,
  emptyLabel = '-',
}: {
  model: AssetNextStepModel;
  emptyLabel?: string;
}) {
  const hasContent = model.badges.length > 0 || model.actions.length > 0 || model.note;

  if (!hasContent) {
    return <Text type="secondary">{emptyLabel}</Text>;
  }

  return (
    <Space direction="vertical" size={6} className="asset-next-step-cell">
      {model.badges.length ? (
        <Space wrap size={[6, 6]}>
          {model.badges.map((item) => (
            <Tag key={item.key} color={item.color}>
              {item.label}
            </Tag>
          ))}
        </Space>
      ) : null}
      {model.actions.length ? (
        <Space wrap size={[4, 4]} className="asset-next-step-actions">
          {model.actions.map((item) => (
            <Button
              key={item.key}
              type="link"
              size="small"
              disabled={item.disabled}
              onClick={item.onClick}
            >
              {item.label}
            </Button>
          ))}
        </Space>
      ) : null}
      {model.note ? <Text type="secondary" className="asset-next-step-note">{model.note}</Text> : null}
    </Space>
  );
}
