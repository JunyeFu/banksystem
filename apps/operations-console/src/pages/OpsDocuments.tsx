import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PageContainer } from '@/components/PageContainer';
import { apiClient, ApiError } from '@/api/client';
import type {
  DocumentCategory,
  DocumentStatus,
  OpsDocument,
} from '@/types/models';

const { Search } = Input;
const { Text } = Typography;

const categoryColorMap: Record<DocumentCategory, string> = {
  POLICY: 'blue',
  PROCEDURE: 'cyan',
  REPORT: 'green',
  COMPLIANCE: 'orange',
  OTHER: 'default',
};

const docStatusColorMap: Record<DocumentStatus, string> = {
  DRAFT: 'default',
  PUBLISHED: 'success',
  ARCHIVED: 'warning',
};

const categoryLabelMap: Record<DocumentCategory, string> = {
  POLICY: '政策',
  PROCEDURE: '流程',
  REPORT: '报告',
  COMPLIANCE: '合规',
  OTHER: '其他',
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function useDocuments(search: string | undefined) {
  return useQuery<OpsDocument[], ApiError>({
    queryKey: ['documents', search],
    queryFn: () => {
      const params = search ? `?category=${search}` : '';
      return apiClient.get<OpsDocument[]>(`/documents${params}`);
    },
  });
}

const columns: ColumnsType<OpsDocument> = [
  {
    title: '文档ID',
    dataIndex: 'documentId',
    key: 'documentId',
    width: 200,
    render: (value: string) => (
      <Text code copyable data-testid="doc-row-id">
        {value}
      </Text>
    ),
  },
  {
    title: '标题',
    dataIndex: 'title',
    key: 'title',
    width: 240,
    render: (value: string) => (
      <span data-testid="doc-row-title">{value}</span>
    ),
  },
  {
    title: '分类',
    dataIndex: 'category',
    key: 'category',
    width: 120,
    render: (value: DocumentCategory) => (
      <Tag color={categoryColorMap[value]} data-testid="doc-row-category">
        {categoryLabelMap[value]}
      </Tag>
    ),
  },
  {
    title: '状态',
    dataIndex: 'status',
    key: 'status',
    width: 120,
    render: (value: DocumentStatus) => (
      <Tag color={docStatusColorMap[value]} data-testid="doc-row-status">
        {value}
      </Tag>
    ),
  },
  {
    title: '版本',
    dataIndex: 'version',
    key: 'version',
    width: 80,
    align: 'right',
  },
  {
    title: '上传人',
    dataIndex: 'uploadedBy',
    key: 'uploadedBy',
    width: 140,
    render: (value: string) => (
      <span data-testid="doc-row-uploaded-by">{value}</span>
    ),
  },
  {
    title: '上传时间',
    dataIndex: 'uploadedAt',
    key: 'uploadedAt',
    width: 200,
  },
  {
    title: '文件大小',
    dataIndex: 'fileSize',
    key: 'fileSize',
    width: 120,
    align: 'right',
    render: (value: number) => (
      <span data-testid="doc-row-file-size">{formatFileSize(value)}</span>
    ),
  },
  {
    title: '校验和',
    dataIndex: 'checksum',
    key: 'checksum',
    width: 160,
    render: (value: string) => (
      <Text code data-testid="doc-row-checksum">
        {value.length > 16 ? `${value.slice(0, 16)}…` : value}
      </Text>
    ),
  },
  {
    title: '描述',
    dataIndex: 'description',
    key: 'description',
    width: 280,
    render: (value: string | null) =>
      value ? (
        <span data-testid="doc-row-description">{value}</span>
      ) : (
        <Text type="secondary">-</Text>
      ),
  },
];

export function OpsDocuments(): JSX.Element {
  const [searchValue, setSearchValue] = useState<string>('');

  const { data, isLoading, isError } = useDocuments(searchValue || undefined);

  const pageState = isLoading ? 'LOADING' : isError ? 'ERROR' : 'READY';

  return (
    <PageContainer pageId="ops.documents" state={pageState} title="文档管理">
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Search
          placeholder="按分类筛选（如 POLICY, PROCEDURE, REPORT, COMPLIANCE）"
          allowClear
          enterButton
          style={{ width: 500 }}
          onSearch={(value: string) => setSearchValue(value)}
          data-testid="doc-search"
          aria-label="按分类筛选文档"
        />
      </Space>

      <Table<OpsDocument>
        columns={columns}
        dataSource={data ?? []}
        rowKey="documentId"
        loading={isLoading}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        data-testid="ops-documents"
        scroll={{ x: 1500 }}
      />
    </PageContainer>
  );
}
