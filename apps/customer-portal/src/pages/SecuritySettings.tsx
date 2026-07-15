import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Skeleton, Switch, Tag } from 'antd';
import { customerApi } from '@/api/client';
import { PageContainer } from '@/components/PageContainer';

export function SecuritySettings(): JSX.Element {
  const query = useQuery({ queryKey: ['security-settings'], queryFn: () => customerApi.getSecuritySettings() }); const data = query.data;
  return <PageContainer pageId="customer.security" state="READY"><section className="customer-page experience-page" data-view-state={query.isLoading ? 'LOADING' : query.isError ? 'ERROR' : data ? 'NORMAL' : 'EMPTY'}>
    {query.isError ? <Alert type="error" showIcon message="安全设置加载失败" /> : null}{query.isLoading ? <Skeleton active paragraph={{ rows: 15 }} /> : null}
    {!query.isLoading && !data && !query.isError ? <div className="bank-card customer-empty"><Empty description="未找到安全设置" /></div> : null}
    {data ? <div className="settings-layout"><aside className="bank-card settings-nav"><button>账户设置</button><button className="active">◇　安全设置</button><button>消息通知</button><button>支付设置</button><button>偏好设置</button><button>隐私设置</button><button>帮助与反馈</button></aside><div className="settings-main"><h1>安全设置</h1><div className="bank-card settings-card"><button><span className="settings-roundel red">▣</span><span><strong>登录密码</strong><small>用于登录复兴银行客户门户</small></span><span>修改　›</span></button><div className="settings-section"><div><span className="settings-roundel blue">◇</span><span><strong>双重验证</strong><small>登录及关键操作时需要验证，保障账户安全</small></span><Switch checked={data.mfaEnabled} disabled /></div><button>验证方式 <span>{data.mfaMethod ?? '未启用'}　›</span></button></div><div className="settings-section"><div><span className="settings-roundel green">▤</span><span><strong>当前登录会话</strong><small>{data.lastLoginAt ? new Date(data.lastLoginAt).toLocaleString('zh-CN', { hour12: false }) : '未提供会话时间'}</small></span><Tag color="green">当前会话</Tag></div></div><div className="settings-section"><div><span className="settings-roundel orange">♢</span><span><strong>安全提醒</strong><small>账户异常变动、登录等安全事件提醒</small></span><Switch checked={data.loginNotificationsEnabled} disabled /></div></div></div><Button type="primary" size="large" disabled>安全设置由身份服务统一管理</Button></div></div> : null}
  </section></PageContainer>;
}
