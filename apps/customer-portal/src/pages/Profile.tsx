import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Skeleton, Tag } from 'antd';
import { customerApi } from '@/api/client';
import { PageContainer } from '@/components/PageContainer';
import { useNavigate } from 'react-router-dom';

export function Profile(): JSX.Element {
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ['profile'], queryFn: () => customerApi.getProfile() }); const data = query.data;
  const avatar = data ? (Array.from(data.displayName.trim().replace(/\s+/g, ''))[0] ?? '客') : '客';
  return <PageContainer pageId="customer.profile" state="READY"><section className="customer-page experience-page" data-view-state={query.isLoading ? 'LOADING' : query.isError ? 'ERROR' : data ? 'NORMAL' : 'EMPTY'}>
    <div className="customer-page-head"><div><h1>个人资料</h1><p>管理您的个人信息、联系方式和账户偏好。</p></div><Button onClick={() => query.refetch()}>↻　刷新</Button></div>
    {query.isError ? <Alert type="error" showIcon message="个人资料加载失败" description="暂时无法读取身份资料，请确认登录状态和服务连接后重试。" action={<Button onClick={() => void query.refetch()} disabled={query.isFetching}>重新加载</Button>} data-testid="profile-error" /> : null}{query.isLoading ? <Skeleton active paragraph={{ rows: 14 }} /> : null}
    {!query.isLoading && !data && !query.isError ? <div className="bank-card customer-empty"><Empty description="未找到个人资料" /></div> : null}
    {data ? <div className="profile-grid"><div className="bank-card profile-card"><div className="profile-card-head"><h2>个人信息</h2><Button disabled title="身份资料由柜面或客服渠道维护">由客服维护</Button></div><div className="profile-identity"><span className="profile-portrait" data-testid="profile-avatar" aria-label="当前客户头像">{avatar}</span><dl><div><dt>客户编号</dt><dd data-testid="profile-customer-id">{data.customerId}</dd></div><div><dt>客户姓名</dt><dd data-testid="profile-display-name">{data.displayName}</dd></div><div><dt>身份状态</dt><dd><Tag color="green">复兴银行已核验</Tag></dd></div></dl></div></div><div className="bank-card profile-card"><div className="profile-card-head"><h2>联系方式</h2><Button disabled title="联系方式由柜面或客服渠道维护">由客服维护</Button></div><dl className="profile-contact"><div><dt>电子邮箱</dt><dd data-testid="profile-email">{data.email ?? '-'}　<Tag color="green">已验证</Tag></dd></div><div><dt>手机号码</dt><dd data-testid="profile-phone">{data.phone ?? '-'}　<Tag color="green">已验证</Tag></dd></div><div><dt>通讯地址</dt><dd>请在复兴银行柜面或客服渠道维护</dd></div></dl></div><div className="bank-card profile-card"><h2>账户安全</h2><div className="profile-links"><button onClick={() => navigate('/security')} data-testid="profile-security-password">登录密码 <span>查看　›</span></button><button onClick={() => navigate('/security')} data-testid="profile-security-mfa">双重验证 <span>查看　›</span></button><button onClick={() => navigate('/security')} data-testid="profile-security-sessions">最近登录 <span>查看　›</span></button></div></div><div className="bank-card profile-card"><h2>账户偏好</h2><div className="profile-links"><button onClick={() => navigate('/security')} data-testid="profile-security-language">语言 <span>由身份服务管理　›</span></button><button onClick={() => navigate('/security')} data-testid="profile-security-timezone">时区 <span>由身份服务管理　›</span></button><button onClick={() => navigate('/messages')} data-testid="profile-notification-preferences">通知偏好 <span>查看站内消息　›</span></button></div></div></div> : null}
  </section></PageContainer>;
}
