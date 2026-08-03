import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Empty, Form, Input, Modal, Select, Skeleton, Table, Tag, Upload } from 'antd';
import type { OperationsDocument, OperationsDocumentCategory, OperationsDocumentStatus } from '@localbank/bank-api-client';
import { operationsApi } from '@/api/client';

const categoryLabels: Record<OperationsDocumentCategory,string>={POLICY:'制度规范',PROCEDURE:'操作手册',REPORT:'业务报告',COMPLIANCE:'合规资料',OTHER:'其他资料'};
const statusLabels: Record<OperationsDocumentStatus,string>={DRAFT:'草稿',PUBLISHED:'已发布',ARCHIVED:'已归档'};
const statusColors: Record<OperationsDocumentStatus,string>={DRAFT:'default',PUBLISHED:'success',ARCHIVED:'warning'};
const fileSize=(bytes:number)=>bytes<1024*1024?`${(bytes/1024).toFixed(1)} KB`:`${(bytes/1024/1024).toFixed(2)} MB`;

export function OpsDocuments(): JSX.Element {
  const client=useQueryClient(); const [category,setCategory]=useState<OperationsDocumentCategory>(); const [status,setStatus]=useState<OperationsDocumentStatus>(); const [keyword,setKeyword]=useState(''); const [categoryOpen,setCategoryOpen]=useState(false); const [uploadOpen,setUploadOpen]=useState(false); const [file,setFile]=useState<File>(); const [form]=Form.useForm();
  const query=useQuery({queryKey:['operations-documents',category,status,keyword],queryFn:()=>operationsApi.listDocuments({category,status,query:keyword||undefined}),retry:false});
  const upload=useMutation({mutationFn:async()=>{const values=await form.validateFields();if(!file)throw new Error('请选择文件');return operationsApi.uploadDocument({file,title:values.title,category:values.category,description:values.description});},onSuccess:()=>{setUploadOpen(false);setFile(undefined);form.resetFields();void client.invalidateQueries({queryKey:['operations-documents']});}});
  const changeStatus=useMutation({mutationFn:({id,next}:{id:string;next:OperationsDocumentStatus})=>operationsApi.updateDocumentStatus(id,next),onSuccess:()=>void client.invalidateQueries({queryKey:['operations-documents']})});
  const rows=query.data??[]; const state=categoryOpen?'CATEGORY_FILTER_OPEN':query.isLoading?'LOADING':query.isError?'ERROR':rows.length===0?'EMPTY':status??'NORMAL';
  const download=async(item:OperationsDocument)=>{const blob=await operationsApi.downloadDocument(item.documentId);const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=item.fileName;link.click();URL.revokeObjectURL(url);};
  return <section className="ops-document-page" data-page-id="operations.documents" data-view-state={state}>
    <div className="ops-page-heading"><div><p className="ops-breadcrumb">复兴银行运营控制台　/　运营治理</p><h1>文档管理</h1><span>集中管理制度规范、操作手册与业务报告，保证版本、状态和文件校验可追溯。</span></div><Button type="primary" onClick={()=>setUploadOpen(true)} data-testid="document-upload-open">⇧　上传文档</Button></div>
    <Card className="ops-document-filter"><Select allowClear placeholder="全部分类" value={category} onChange={setCategory} onOpenChange={setCategoryOpen} options={Object.entries(categoryLabels).map(([value,label])=>({value,label}))} data-testid="document-category"/><Select allowClear placeholder="全部状态" value={status} onChange={setStatus} options={Object.entries(statusLabels).map(([value,label])=>({value,label}))}/><Input.Search allowClear value={keyword} onChange={event=>setKeyword(event.target.value)} placeholder="输入标题或说明关键词"/><Button onClick={()=>void query.refetch()}>↻　刷新</Button></Card>
    {query.isError?<Alert type="error" showIcon message="文档列表加载失败" description="无法读取文档资料库，请检查服务状态后重试。" action={<Button onClick={()=>void query.refetch()}>重试</Button>}/>:<Card className="ops-risk-table" title="运营文档" extra={<span>共 {rows.length} 份</span>}>
      {query.isLoading?<Skeleton active paragraph={{rows:9}}/>:rows.length===0?<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前筛选条件下暂无文档"/>:<Table<OperationsDocument> rowKey="documentId" dataSource={rows} pagination={{pageSize:10}} scroll={{x:1150}} columns={[
        {title:'标题',dataIndex:'title',width:260,render:(value:string,item)=><Button type="link" className="ops-document-title" onClick={()=>void download(item)}>▧　{value}</Button>},
        {title:'分类',dataIndex:'category',width:120,render:(value:OperationsDocumentCategory)=>categoryLabels[value]},
        {title:'状态',dataIndex:'status',width:100,render:(value:OperationsDocumentStatus)=><Tag color={statusColors[value]}>{statusLabels[value]}</Tag>},
        {title:'版本',dataIndex:'version',width:80,render:(value:number)=>`v${value}.0.0`},{title:'上传人',dataIndex:'uploadedBy',width:130},
        {title:'上传时间',dataIndex:'uploadedAt',width:180,render:(value:string)=>new Date(value).toLocaleString('zh-CN',{hour12:false})},{title:'大小',dataIndex:'fileSize',width:100,align:'right',render:fileSize},
        {title:'校验和',dataIndex:'checksum',width:155,render:(value:string)=><code>{value.slice(0,8)}…{value.slice(-6)}</code>},
        {title:'操作',width:150,render:(_:unknown,item)=><><Button type="link" onClick={()=>void download(item)}>下载</Button>{item.status==='DRAFT'?<Button type="link" loading={changeStatus.isPending} onClick={()=>changeStatus.mutate({id:item.documentId,next:'PUBLISHED'})}>发布</Button>:item.status==='PUBLISHED'?<Button type="link" loading={changeStatus.isPending} onClick={()=>changeStatus.mutate({id:item.documentId,next:'ARCHIVED'})}>归档</Button>:null}</>},
      ]}/>}</Card>}
    <Modal open={uploadOpen} title="上传运营文档" onCancel={()=>!upload.isPending&&setUploadOpen(false)} okText="上传并保存草稿" confirmLoading={upload.isPending} onOk={()=>upload.mutate()} data-testid="document-upload-modal"><Alert type="info" showIcon message="文件将以草稿状态保存，并记录 SHA-256 校验和与上传审计事件。"/><Form form={form} layout="vertical" className="ops-document-upload"><Form.Item label="文档标题" name="title" rules={[{required:true,message:'请输入文档标题'}]}><Input maxLength={240}/></Form.Item><Form.Item label="文档分类" name="category" rules={[{required:true,message:'请选择文档分类'}]}><Select options={Object.entries(categoryLabels).map(([value,label])=>({value,label}))}/></Form.Item><Form.Item label="文档说明" name="description"><Input.TextArea rows={3} maxLength={1000}/></Form.Item><Form.Item label="文件" required><Upload beforeUpload={value=>{setFile(value);return false;}} maxCount={1}><Button>选择文件（最大 20 MiB）</Button></Upload></Form.Item>{upload.isError?<Alert type="error" message={upload.error.message}/>:null}</Form></Modal>
  </section>;
}
