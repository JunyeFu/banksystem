import { useQuery } from '@tanstack/react-query';
import { Table, Tag, Empty, Skeleton } from 'antd';
import type { TableProps } from 'antd';
import { PageContainer } from '@/components/PageContainer';
import type { PageState } from '@/components/PageContainer';
import { customerApi } from '@/api/client';
import type { CustomerDocument as Document } from '@localbank/bank-api-client';

const documentColumns: TableProps<Document>['columns'] = [
  {
    title: '文档类型',
    dataIndex: 'documentType',
    key: 'documentType',
    width: 140,
    render: (value: string, record: Document) => (
      <Tag data-testid={`document-type-${record.documentId}`}>{value}</Tag>
    ),
  },
  {
    title: '描述',
    dataIndex: 'description',
    key: 'description',
  },
  {
    title: '创建时间',
    dataIndex: 'createdDate',
    key: 'createdDate',
    width: 180,
  },
  {
    title: '操作',
    key: 'action',
    width: 100,
    render: (_: unknown, record: Document) => (
      <a
        href={record.downloadUrl}
        data-testid={`document-download-${record.documentId}`}
      >
        下载
      </a>
    ),
  },
];

export function Documents(): JSX.Element {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['documents'],
    queryFn: () => customerApi.listDocuments(),
  });

  const pageState: PageState = isLoading
    ? 'LOADING'
    : isError
      ? 'ERROR'
      : 'READY';

  const documents = data?.items ?? [];

  return (
    <PageContainer
      pageId="customer.documents"
      state={pageState}
      title="文档"
    >
      <div data-testid="document-list" style={{ padding: '24px' }}>
        {isLoading && <Skeleton active />}

        {!isLoading && isError && (
          <Empty description="加载文档列表失败" data-testid="document-list-error" />
        )}

        {!isLoading && !isError && documents.length === 0 && (
          <Empty description="暂无文档" data-testid="document-list-empty" />
        )}

        {!isLoading && !isError && documents.length > 0 && (
          <Table
            columns={documentColumns}
            dataSource={documents}
            rowKey="documentId"
            pagination={{ pageSize: 10 }}
            data-testid="document-list-table"
          />
        )}
      </div>
    </PageContainer>
  );
}
