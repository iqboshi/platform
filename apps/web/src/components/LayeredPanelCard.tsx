import { DownOutlined, UpOutlined } from '@ant-design/icons';
import { Button, Card, Typography } from 'antd';
import { useState } from 'react';
import type { ReactNode } from 'react';

const { Title } = Typography;

interface LayeredPanelCardProps {
  title: string;
  kicker?: string;
  summary?: ReactNode;
  extra?: ReactNode;
  className?: string;
  defaultExpanded?: boolean;
  expandLabel: string;
  collapseLabel: string;
  children?: ReactNode;
}

export function LayeredPanelCard({
  title,
  kicker,
  summary,
  extra,
  className,
  defaultExpanded = false,
  expandLabel,
  collapseLabel,
  children,
}: LayeredPanelCardProps) {
  const hasDetails = children !== undefined && children !== null;
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <Card className={`panel-card layered-panel-card ${className ?? ''}`.trim()} variant="borderless">
      <div className="layered-panel-head">
        <div className="layered-panel-title-block">
          {kicker ? <div className="panel-kicker">{kicker}</div> : null}
          <Title level={4} className="layered-panel-title">
            {title}
          </Title>
        </div>
        <div className="layered-panel-actions">
          {extra}
          {hasDetails ? (
            <Button
              type="text"
              className="layered-panel-toggle"
              icon={expanded ? <UpOutlined /> : <DownOutlined />}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? collapseLabel : expandLabel}
            </Button>
          ) : null}
        </div>
      </div>
      {summary ? <div className="layered-panel-summary">{summary}</div> : null}
      {hasDetails && expanded ? <div className="layered-panel-detail">{children}</div> : null}
    </Card>
  );
}
