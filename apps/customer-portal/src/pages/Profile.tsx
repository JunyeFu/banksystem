import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Skeleton, Tag } from 'antd';
import { customerApi } from '@/api/client';
import { PageContainer } from '@/components/PageContainer';

export function Profile(): JSX.Element {
  const query = useQuery({ queryKey: ['profile'], queryFn: () => customerApi.getProfile() }); const data = query.data;
  return <PageContainer pageId="customer.profile" state="READY"><section className="customer-page experience-page" data-view-state={query.isLoading ? 'LOADING' : query.isError ? 'ERROR' : data ? 'NORMAL' : 'EMPTY'}>
    <div className="customer-page-head"><div><h1>个人资料</h1><p>管理您的个人信息、联系方式和账户偏好。</p></div><Button onClick={() => query.refetch()}>↻　刷新</Button></div>
    {query.isError ? <Alert type="error" showIcon message="个人资料加载失败" /> : null}{query.isLoading ? <Skeleton active paragraph={{ rows: 14 }} /> : null}
    {!query.isLoading && !data && !query.isError ? <div className="bank-card customer-empty"><Empty description="未找到个人资料" /></div> : null}
    {data ? <div className="profile-grid"><div className="bank-card profile-card"><div className="profile-card-head"><h2>个人信息</h2><Button>✎　更新信息</Button></div><div className="profile-identity"><span className="profile-portrait">人</span><dl><div><dt>客户编号</dt><dd>{data.customerId}</dd></div><div><dt>客户姓名</dt><dd>{data.displayName}</dd></div><div><dt>身份状态</dt><dd><Tag color="green">复兴银行已核验</Tag></dd></div></dl></div></div><div className="bank-card profile-card"><div className="profile-card-head"><h2>联系方式</h2><Button>✎　更新信息</Button></div><dl className="profile-contact"><div><dt>电子邮箱</dt><dd>{data.email ?? '-'}　<Tag color="green">已验证</Tag></dd></div><div><dt>手机号码</dt><dd>{data.phone ?? '-'}　<Tag color="green">已验证</Tag></dd></div><div><dt>通讯地址</dt><dd>请在复兴银行柜面或客服渠道维护</dd></div></dl></div><div className="bank-card profile-card"><h2>账户安全</h2><div className="profile-links"><button>登录密码 <span>修改　›</span></button><button>双重验证 <span>查看　›</span></button><button>最近登录 <span>查看　›</span></button></div></div><div className="bank-card profile-card"><h2>账户偏好</h2><div className="profile-links"><button>语言 <span>简体中文　›</span></button><button>时区 <span>北京时间　›</span></button><button>通知偏好 <span>站内信、邮件　›</span></button></div></div></div> : null}
  </section></PageContainer>;
}
