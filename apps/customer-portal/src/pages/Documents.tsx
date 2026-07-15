import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Skeleton, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { CustomerDocument } from '@localbank/bank-api-client';
import { customerApi } from '@/api/client';
import { PageContainer } from '@/components/PageContainer';

export function Documents(): JSX.Element {
  const query = useQuery({ queryKey: ['documents'], queryFn: () => customerApi.listDocuments() });
  const items = query.data?.items ?? [];
  const columns: ColumnsType<CustomerDocument> = [
    { title: '文件类型', dataIndex: 'documentType', key: 'type', render: (value: string) => <span className="document-type"><b>▤</b>{value}</span> },
    { title: '描述', dataIndex: 'description', key: 'description' },
    { title: '创建日期', dataIndex: 'createdDate', key: 'date' },
    { title: '操作', key: 'action', render: (_, item) => <Button href={item.downloadUrl} download type="link">↓　下载</Button> },
  ];
  return <PageContainer pageId="customer.documents" state="READY"><section className="customer-page experience-page" data-view-state={query.isLoading ? 'LOADING' : query.isError ? 'ERROR' : items.length ? 'NORMAL' : 'EMPTY'}>
    <div className="customer-page-head"><div><h1>文档</h1><p>查看并下载您在复兴银行的账户文件和业务记录。</p></div><Button size="large" onClick={() => query.refetch()} disabled={query.isLoading}>↻　刷新</Button></div>
    {query.isError ? <Alert type="error" showIcon message="文档加载失败" action={<Button onClick={() => query.refetch()}>重新加载</Button>} /> : null}
    <div className="bank-card customer-table-card">{query.isLoading ? <Skeleton active paragraph={{ rows: 8 }} /> : items.length ? <Table columns={columns} dataSource={items} rowKey="documentId" pagination={false} /> : !query.isError ? <div className="customer-empty"><Empty description="暂无文档" /></div> : null}</div>
  </section></PageContainer>;
}
