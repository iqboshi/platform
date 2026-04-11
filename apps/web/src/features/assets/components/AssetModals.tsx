import { Button, Form, Input, Modal, Select, Typography } from 'antd';
import type { FormInstance } from 'antd';
import type { RefObject } from 'react';

const { Paragraph, Text } = Typography;

interface DatasetUploadModalProps {
  open: boolean;
  submitting: boolean;
  form: FormInstance;
  selectedUploadKind: string;
  datasetNameLabel: string;
  descriptionLabel: string;
  kindLabel: string;
  fileLabel: string;
  title: string;
  downloadTemplateLabel: string;
  kindOptions: Array<{ value: string; label: string }>;
  onCancel: () => void;
  onSubmit: () => void;
  onDownloadTemplate: () => void;
  onFileChange: (file: File | null) => void;
}

export function DatasetUploadModal({
  open,
  submitting,
  form,
  selectedUploadKind,
  datasetNameLabel,
  descriptionLabel,
  kindLabel,
  fileLabel,
  title,
  downloadTemplateLabel,
  kindOptions,
  onCancel,
  onSubmit,
  onDownloadTemplate,
  onFileChange,
}: DatasetUploadModalProps) {
  return (
    <Modal title={title} open={open} onCancel={onCancel} onOk={onSubmit} confirmLoading={submitting}>
      <Form
        form={form}
        layout="vertical"
        initialValues={{ datasetName: '', description: '', kind: selectedUploadKind }}
      >
        <div className="section-actions">
          <Button onClick={onDownloadTemplate}>{downloadTemplateLabel}</Button>
        </div>
        <Form.Item name="datasetName" label={datasetNameLabel} rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="description" label={descriptionLabel}>
          <Input.TextArea rows={4} />
        </Form.Item>
        <Form.Item name="kind" label={kindLabel} rules={[{ required: true }]}>
          <Select options={kindOptions} />
        </Form.Item>
        <Form.Item label={fileLabel} required>
          <input
            className="file-picker"
            type="file"
            onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

interface ProductModalCopy {
  createTitle: string;
  editTitle: string;
  name: string;
  description: string;
  category: string;
  tags: string;
  tagsHint: string;
  file: string;
  fileHint: string;
  replaceFile: string;
  highlights: string;
  highlightsHint: string;
  specifications: string;
  specificationsHint: string;
  visibility: string;
  visibilityPrivate: string;
  visibilityPublic: string;
}

interface ProductEditorModalProps {
  open: boolean;
  submitting: boolean;
  editingProductId: string | null;
  form: FormInstance;
  copy: ProductModalCopy;
  isAdmin: boolean;
  selectedProductFile: File | null;
  productFileInputRef: RefObject<HTMLInputElement | null>;
  onCancel: () => void;
  onSubmit: () => void;
  onFileChange: (file: File | null) => void;
}

export function ProductEditorModal({
  open,
  submitting,
  editingProductId,
  form,
  copy,
  isAdmin,
  selectedProductFile,
  productFileInputRef,
  onCancel,
  onSubmit,
  onFileChange,
}: ProductEditorModalProps) {
  return (
    <Modal
      title={editingProductId ? copy.editTitle : copy.createTitle}
      className="asset-editor-modal"
      width={920}
      open={open}
      onCancel={onCancel}
      onOk={onSubmit}
      confirmLoading={submitting}
    >
      <Form form={form} layout="vertical" initialValues={{ visibility: 'private' }}>
        <div className="asset-editor-layout">
          <section className="asset-editor-section">
            <div className="asset-editor-section-title">{copy.name}</div>
            <Paragraph className="asset-editor-section-copy">{copy.description}</Paragraph>
            <Form.Item name="name" label={copy.name} rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="description" label={copy.description}>
              <Input.TextArea rows={5} />
            </Form.Item>
            <Form.Item name="category" label={copy.category}>
              <Input />
            </Form.Item>
            <Form.Item name="tagsText" label={copy.tags} extra={copy.tagsHint}>
              <Input.TextArea rows={4} />
            </Form.Item>
          </section>

          <section className="asset-editor-section">
            <div className="asset-editor-section-title">{copy.file}</div>
            <Paragraph className="asset-editor-section-copy">{copy.fileHint}</Paragraph>
            <Form.Item label={editingProductId ? copy.replaceFile : copy.file} required={!editingProductId}>
              <input
                ref={productFileInputRef}
                className="file-picker"
                type="file"
                accept=".stp,.step,.igs,.iges"
                onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
              />
              {selectedProductFile ? <Text type="secondary">{selectedProductFile.name}</Text> : null}
            </Form.Item>
            <Form.Item name="highlightsText" label={copy.highlights} extra={copy.highlightsHint}>
              <Input.TextArea rows={4} />
            </Form.Item>
            <Form.Item name="specificationsText" label={copy.specifications} extra={copy.specificationsHint}>
              <Input.TextArea rows={6} />
            </Form.Item>
            {isAdmin ? (
              <Form.Item name="visibility" label={copy.visibility}>
                <Select
                  options={[
                    { value: 'private', label: copy.visibilityPrivate },
                    { value: 'public', label: copy.visibilityPublic },
                  ]}
                />
              </Form.Item>
            ) : null}
          </section>
        </div>
      </Form>
    </Modal>
  );
}

interface GeeCredentialCopy {
  createTitle: string;
  name: string;
  description: string;
  project: string;
  serviceAccountJson: string;
}

interface GeeCredentialModalProps {
  open: boolean;
  submitting: boolean;
  form: FormInstance;
  copy: GeeCredentialCopy;
  onCancel: () => void;
  onSubmit: () => void;
}

export function GeeCredentialModal({
  open,
  submitting,
  form,
  copy,
  onCancel,
  onSubmit,
}: GeeCredentialModalProps) {
  return (
    <Modal
      title={copy.createTitle}
      open={open}
      onCancel={onCancel}
      onOk={onSubmit}
      confirmLoading={submitting}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ name: '', description: '', projectId: '', serviceAccountJson: '' }}
      >
        <Form.Item name="name" label={copy.name} rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="description" label={copy.description}>
          <Input.TextArea rows={3} />
        </Form.Item>
        <Form.Item name="projectId" label={copy.project}>
          <Input />
        </Form.Item>
        <Form.Item name="serviceAccountJson" label={copy.serviceAccountJson} rules={[{ required: true }]}>
          <Input.TextArea rows={12} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

interface DatasetEditorModalProps {
  open: boolean;
  submitting: boolean;
  form: FormInstance;
  title: string;
  basicInfoTitle: string;
  basicInfoCopy: string;
  profileInfoTitle: string;
  profileInfoCopy: string;
  datasetNameLabel: string;
  descriptionLabel: string;
  originalFileNameLabel: string;
  contentTypeLabel: string;
  rowCountLabel: string;
  rowCountHint: string;
  fieldsLabel: string;
  fieldsHint: string;
  sampleRecordLabel: string;
  sampleRecordHint: string;
  onCancel: () => void;
  onSubmit: () => void;
}

export function DatasetEditorModal({
  open,
  submitting,
  form,
  title,
  basicInfoTitle,
  basicInfoCopy,
  profileInfoTitle,
  profileInfoCopy,
  datasetNameLabel,
  descriptionLabel,
  originalFileNameLabel,
  contentTypeLabel,
  rowCountLabel,
  rowCountHint,
  fieldsLabel,
  fieldsHint,
  sampleRecordLabel,
  sampleRecordHint,
  onCancel,
  onSubmit,
}: DatasetEditorModalProps) {
  return (
    <Modal
      title={title}
      className="asset-editor-modal"
      width={920}
      open={open}
      onCancel={onCancel}
      onOk={onSubmit}
      confirmLoading={submitting}
    >
      <Form form={form} layout="vertical">
        <div className="asset-editor-layout">
          <section className="asset-editor-section">
            <div className="asset-editor-section-title">{basicInfoTitle}</div>
            <Paragraph className="asset-editor-section-copy">{basicInfoCopy}</Paragraph>
            <Form.Item name="datasetName" label={datasetNameLabel} rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="description" label={descriptionLabel}>
              <Input.TextArea rows={5} />
            </Form.Item>
            <Form.Item name="originalFileName" label={originalFileNameLabel}>
              <Input />
            </Form.Item>
            <Form.Item name="contentType" label={contentTypeLabel}>
              <Input />
            </Form.Item>
          </section>

          <section className="asset-editor-section">
            <div className="asset-editor-section-title">{profileInfoTitle}</div>
            <Paragraph className="asset-editor-section-copy">{profileInfoCopy}</Paragraph>
            <Form.Item name="rowCount" label={rowCountLabel} extra={rowCountHint}>
              <Input />
            </Form.Item>
            <Form.Item name="columnsText" label={fieldsLabel} extra={fieldsHint}>
              <Input.TextArea rows={5} />
            </Form.Item>
            <Form.Item name="sampleRecordJson" label={sampleRecordLabel} extra={sampleRecordHint}>
              <Input.TextArea rows={8} />
            </Form.Item>
          </section>
        </div>
      </Form>
    </Modal>
  );
}
