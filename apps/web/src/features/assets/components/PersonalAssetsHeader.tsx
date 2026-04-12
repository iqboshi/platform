import { Button, Space, Typography } from 'antd';
import type { RefObject } from 'react';

const { Paragraph } = Typography;

interface PersonalAssetsHeaderProps {
  kicker: string;
  title: string;
  copy: string;
  isAssetsView: boolean;
  isAccountView: boolean;
  uploadDatasetLabel: string;
  uploadProductLabel: string;
  addCredentialLabel: string;
  importWorkflowLabel: string;
  refreshLabel: string;
  importInputRef: RefObject<HTMLInputElement | null>;
  onUploadDataset: () => void;
  onUploadProduct: () => void;
  onAddCredential: () => void;
  onImportWorkflow: (file: File) => void;
  onRefresh: () => void;
}

export function PersonalAssetsHeader({
  kicker,
  title,
  copy,
  isAssetsView,
  isAccountView,
  uploadDatasetLabel,
  uploadProductLabel,
  addCredentialLabel,
  importWorkflowLabel,
  refreshLabel,
  importInputRef,
  onUploadDataset,
  onUploadProduct,
  onAddCredential,
  onImportWorkflow,
  onRefresh,
}: PersonalAssetsHeaderProps) {
  return (
    <>
      <div className="section-header">
        <div className="section-header-actions">
          <div>
            <div className="panel-kicker">{kicker}</div>
            <h2 className="section-title">{title}</h2>
            <Paragraph className="section-copy">{copy}</Paragraph>
          </div>
          <Space wrap className="section-actions">
            {isAssetsView ? <Button onClick={onUploadDataset}>{uploadDatasetLabel}</Button> : null}
            {isAssetsView ? <Button onClick={onUploadProduct}>{uploadProductLabel}</Button> : null}
            {isAccountView ? <Button onClick={onAddCredential}>{addCredentialLabel}</Button> : null}
            {isAssetsView ? (
              <Button onClick={() => importInputRef.current?.click()}>{importWorkflowLabel}</Button>
            ) : null}
            <Button onClick={onRefresh}>{refreshLabel}</Button>
          </Space>
        </div>
      </div>

      {isAssetsView ? (
        <input
          ref={importInputRef}
          hidden
          type="file"
          accept=".json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              onImportWorkflow(file);
            }
            event.currentTarget.value = '';
          }}
        />
      ) : null}
    </>
  );
}
