import type { DashboardAnnouncementItem } from '@platform/types';

import { Button, Card, Form, Input, Space, Switch, Tag, Typography } from 'antd';
import type { FormInstance } from 'antd';
import { useMemo, useState } from 'react';

const { Paragraph, Text, Title } = Typography;
const { TextArea } = Input;

interface WorkspaceAnnouncementSettingsCopy {
  title: string;
  copy: string;
  summaryPublished: string;
  summaryPinned: string;
  summaryLatest: string;
  summaryEmpty: string;
  add: string;
  remove: string;
  save: string;
  cardTitle: string;
  publishedAtLabel: string;
  titleZhLabel: string;
  titleEnLabel: string;
  tagZhLabel: string;
  tagEnLabel: string;
  summaryZhLabel: string;
  summaryEnLabel: string;
  contentZhLabel: string;
  contentEnLabel: string;
  publishedLabel: string;
  pinnedLabel: string;
  expandLabel?: string;
  collapseLabel?: string;
}

interface WorkspaceAnnouncementSettingsCardProps {
  form: FormInstance<{ announcements: DashboardAnnouncementItem[] }>;
  copy: WorkspaceAnnouncementSettingsCopy;
  saving: boolean;
  onSave: () => void;
}

function createAnnouncementDraft(): DashboardAnnouncementItem {
  return {
    id: `announcement-${Math.random().toString(36).slice(2, 10)}`,
    titleZh: '',
    titleEn: '',
    summaryZh: '',
    summaryEn: '',
    contentZh: '',
    contentEn: '',
    tagZh: '',
    tagEn: '',
    publishedAt: new Date().toISOString().slice(0, 10),
    pinned: false,
    published: true,
  };
}

function parseDateValue(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

export function WorkspaceAnnouncementSettingsCard({
  form,
  copy,
  saving,
  onSave,
}: WorkspaceAnnouncementSettingsCardProps) {
  const [expanded, setExpanded] = useState(false);
  const watchedAnnouncements = Form.useWatch('announcements', form);
  const announcements = useMemo(
    () => watchedAnnouncements ?? [],
    [watchedAnnouncements],
  );
  const isChineseCopy = /[\u4e00-\u9fff]/.test(copy.title);
  const expandLabel = copy.expandLabel ?? (isChineseCopy ? '展开设置' : 'Show settings');
  const collapseLabel = copy.collapseLabel ?? (isChineseCopy ? '收起设置' : 'Collapse');

  const summary = useMemo(() => {
    const published = announcements.filter((item) => item.published);
    const pinned = published.find((item) => item.pinned) ?? null;
    const latest = [...published].sort(
      (left, right) => parseDateValue(right.publishedAt) - parseDateValue(left.publishedAt),
    )[0];
    return {
      publishedCount: published.length,
      pinnedTitle: pinned?.titleZh || pinned?.titleEn || copy.summaryEmpty,
      latestPublishedAt: latest?.publishedAt ?? '-',
    };
  }, [announcements, copy.summaryEmpty]);

  return (
    <div className="workspace-settings-stack">
      <Card className="panel-card" variant="borderless">
        <div className="workspace-settings-header">
          <div className="workspace-settings-intro">
            <div className="panel-kicker">{copy.title}</div>
            <Paragraph className="section-copy">{copy.copy}</Paragraph>
          </div>
          <Space wrap className="workspace-settings-header-actions">
            <Button
              className="workspace-settings-toggle"
              onClick={() => setExpanded((current) => !current)}
              aria-expanded={expanded}
            >
              {expanded ? collapseLabel : expandLabel}
            </Button>
            {expanded ? (
              <Button type="primary" onClick={onSave} loading={saving}>
                {copy.save}
              </Button>
            ) : null}
          </Space>
        </div>

        <div className="workspace-settings-body">
          <div className="workspace-announcement-summary-grid">
            <div className="workspace-announcement-summary-item">
              <div className="panel-kicker">{copy.summaryPublished}</div>
              <Title level={4}>{summary.publishedCount}</Title>
            </div>
            <div className="workspace-announcement-summary-item">
              <div className="panel-kicker">{copy.summaryPinned}</div>
              <Text>{summary.pinnedTitle}</Text>
            </div>
            <div className="workspace-announcement-summary-item">
              <div className="panel-kicker">{copy.summaryLatest}</div>
              <Text>{summary.latestPublishedAt}</Text>
            </div>
          </div>

          {expanded ? (
            <Form form={form} layout="vertical">
              <Form.List name="announcements">
                {(fields, { add, remove }) => (
                  <div className="workspace-announcement-list">
                    {fields.length === 0 ? (
                      <div className="profile-config-tip">{copy.summaryEmpty}</div>
                    ) : null}
                    {fields.map((field, index) => (
                      <div key={field.key} className="workspace-announcement-card">
                        <Form.Item name={[field.name, 'id']} hidden>
                          <Input />
                        </Form.Item>
                        <div className="workspace-announcement-card-head">
                          <div>
                            <Title level={5}>{`${copy.cardTitle} ${index + 1}`}</Title>
                          </div>
                          <Button danger onClick={() => remove(field.name)}>
                            {copy.remove}
                          </Button>
                        </div>
                        <div className="workspace-announcement-grid">
                          <Form.Item
                            label={copy.publishedAtLabel}
                            name={[field.name, 'publishedAt']}
                            rules={[{ required: true, whitespace: true }]}
                          >
                            <Input placeholder="2026-04-12" />
                          </Form.Item>
                          <Form.Item
                            label={copy.titleZhLabel}
                            name={[field.name, 'titleZh']}
                            rules={[{ required: true, whitespace: true }]}
                          >
                            <Input />
                          </Form.Item>
                          <Form.Item
                            label={copy.titleEnLabel}
                            name={[field.name, 'titleEn']}
                            rules={[{ required: true, whitespace: true }]}
                          >
                            <Input />
                          </Form.Item>
                          <Form.Item label={copy.tagZhLabel} name={[field.name, 'tagZh']}>
                            <Input />
                          </Form.Item>
                          <Form.Item label={copy.tagEnLabel} name={[field.name, 'tagEn']}>
                            <Input />
                          </Form.Item>
                          <Form.Item
                            label={copy.publishedLabel}
                            name={[field.name, 'published']}
                            valuePropName="checked"
                          >
                            <Switch />
                          </Form.Item>
                          <Form.Item
                            label={copy.pinnedLabel}
                            name={[field.name, 'pinned']}
                            valuePropName="checked"
                          >
                            <Switch />
                          </Form.Item>
                        </div>
                        <div className="workspace-announcement-grid workspace-announcement-grid--long">
                          <Form.Item
                            label={copy.summaryZhLabel}
                            name={[field.name, 'summaryZh']}
                            rules={[{ required: true, whitespace: true }]}
                          >
                            <TextArea rows={4} />
                          </Form.Item>
                          <Form.Item
                            label={copy.summaryEnLabel}
                            name={[field.name, 'summaryEn']}
                            rules={[{ required: true, whitespace: true }]}
                          >
                            <TextArea rows={4} />
                          </Form.Item>
                          <Form.Item
                            label={copy.contentZhLabel}
                            name={[field.name, 'contentZh']}
                            rules={[{ required: true, whitespace: true }]}
                          >
                            <TextArea rows={5} />
                          </Form.Item>
                          <Form.Item
                            label={copy.contentEnLabel}
                            name={[field.name, 'contentEn']}
                            rules={[{ required: true, whitespace: true }]}
                          >
                            <TextArea rows={5} />
                          </Form.Item>
                        </div>
                        {announcements[index]?.published || announcements[index]?.pinned ? (
                          <Space wrap>
                            {announcements[index]?.published ? (
                              <Tag color="blue">{copy.publishedLabel}</Tag>
                            ) : null}
                            {announcements[index]?.pinned ? (
                              <Tag color="gold">{copy.pinnedLabel}</Tag>
                            ) : null}
                          </Space>
                        ) : null}
                      </div>
                    ))}
                    <Button onClick={() => add(createAnnouncementDraft())}>{copy.add}</Button>
                  </div>
                )}
              </Form.List>
            </Form>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
