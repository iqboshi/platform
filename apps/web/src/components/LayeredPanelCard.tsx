import { DownOutlined, UpOutlined } from '@ant-design/icons';
import { Button, Card, Typography } from 'antd';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CSSProperties, ReactNode } from 'react';

const { Title } = Typography;

type LayeredPanelCardGroupContextValue = {
  collapsedHeight: number | null;
  registerCard: (id: string, height: number) => void;
  unregisterCard: (id: string) => void;
};

const LayeredPanelCardGroupContext = createContext<LayeredPanelCardGroupContextValue | null>(null);

function resolveCollapsedHeight(heights: Record<string, number>): number | null {
  const values = Object.values(heights).filter((value) => value > 0);
  return values.length > 0 ? Math.min(...values) : null;
}

export function LayeredPanelCardGroup({ children }: { children: ReactNode }) {
  const heightsRef = useRef<Record<string, number>>({});
  const [collapsedHeight, setCollapsedHeight] = useState<number | null>(null);

  const registerCard = useCallback((id: string, height: number) => {
    const normalizedHeight = Math.ceil(height);
    if (normalizedHeight <= 0 || heightsRef.current[id] === normalizedHeight) {
      return;
    }

    heightsRef.current = {
      ...heightsRef.current,
      [id]: normalizedHeight,
    };
    setCollapsedHeight(resolveCollapsedHeight(heightsRef.current));
  }, []);

  const unregisterCard = useCallback((id: string) => {
    if (!(id in heightsRef.current)) {
      return;
    }

    const nextHeights = { ...heightsRef.current };
    delete nextHeights[id];
    heightsRef.current = nextHeights;
    setCollapsedHeight(resolveCollapsedHeight(nextHeights));
  }, []);

  const value = useMemo(
    () => ({
      collapsedHeight,
      registerCard,
      unregisterCard,
    }),
    [collapsedHeight, registerCard, unregisterCard],
  );

  return (
    <LayeredPanelCardGroupContext.Provider value={value}>
      {children}
    </LayeredPanelCardGroupContext.Provider>
  );
}

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
  const group = useContext(LayeredPanelCardGroupContext);
  const contentId = useId();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [collapsedContentHeight, setCollapsedContentHeight] = useState(0);

  useEffect(() => {
    if (!group) {
      return;
    }

    const node = contentRef.current;
    if (!node) {
      return;
    }

    const syncHeight = () => {
      const nextHeight = Math.ceil(node.getBoundingClientRect().height);
      setCollapsedContentHeight((current) => (current === nextHeight ? current : nextHeight));
      group.registerCard(contentId, nextHeight);
    };

    syncHeight();

    if (typeof ResizeObserver === 'undefined') {
      return () => group.unregisterCard(contentId);
    }

    const observer = new ResizeObserver(() => syncHeight());
    observer.observe(node);

    return () => {
      observer.disconnect();
      group.unregisterCard(contentId);
    };
  }, [contentId, group]);

  const shouldClampCollapsedHeight =
    Boolean(group?.collapsedHeight) &&
    !expanded &&
    hasDetails &&
    collapsedContentHeight > Number(group?.collapsedHeight) + 1;

  const collapsedStyle: CSSProperties | undefined = shouldClampCollapsedHeight
    ? { height: group?.collapsedHeight ?? undefined }
    : undefined;

  return (
    <Card
      className={`panel-card layered-panel-card ${expanded ? 'layered-panel-card--expanded' : ''} ${className ?? ''}`.trim()}
      variant="borderless"
    >
      <div
        className={`layered-panel-collapsible${shouldClampCollapsedHeight ? ' layered-panel-collapsible--collapsed' : ''}`}
        style={collapsedStyle}
      >
        <div ref={contentRef}>
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
        </div>
        {shouldClampCollapsedHeight ? <div className="layered-panel-collapsible-fade" /> : null}
      </div>
      {hasDetails && expanded ? <div className="layered-panel-detail">{children}</div> : null}
    </Card>
  );
}
