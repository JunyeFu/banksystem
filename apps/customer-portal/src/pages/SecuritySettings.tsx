import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Empty, Skeleton, Switch, Tag } from 'antd';
import { customerApi } from '@/api/client';
import { PageContainer } from '@/components/PageContainer';

export function SecuritySettings(): JSX.Element {
  const navigate = useNavigate();
  const [notice, setNotice] = useState<string>();
  const explainManagedSetting = (name: string): void => setNotice(`${name}由统一身份服务管理，请通过已获授权的身份服务渠道维护。`);
  const query = useQuery({ queryKey: ['security-settings'], queryFn: () => customerApi.getSecuritySettings() }); const data = query.data;
  return <PageContainer pageId="customer.security" state="READY"><section className="customer-page experience-page" data-view-state={query.isLoading ? 'LOADING' : query.isError ? 'ERROR' : data ? 'NORMAL' : 'EMPTY'}>
    {query.isError ? <Alert type="error" showIcon message="安全设置加载失败" description="暂时无法读取安全偏好，请确认登录状态和服务连接后重试。" action={<Button onClick={() => void query.refetch()} disabled={query.isFetching}>重新加载</Button>} data-testid="security-settings-error" /> : null}{query.isLoading ? <Skeleton active paragraph={{ rows: 15 }} /> : null}
    {!query.isLoading && !data && !query.isError ? <div className="bank-card customer-empty"><Empty description="未找到安全设置" /></div> : null}
    {data ? <div className="settings-layout"><aside className="bank-card settings-nav"><button onClick={() => navigate('/profile')}>账户设置</button><button className="active" onClick={() => setNotice(undefined)}>◇　安全设置</button><button onClick={() => navigate('/messages')}>消息通知</button><button onClick={() => navigate('/transfers')}>支付设置</button><button onClick={() => navigate('/profile')}>偏好设置</button><button onClick={() => explainManagedSetting('隐私设置')}>隐私设置</button><button onClick={() => explainManagedSetting('帮助与反馈')}>帮助与反馈</button></aside><div className="settings-main"><h1>安全设置</h1>{notice ? <Alert type="info" showIcon message="设置入口说明" description={notice} closable onClose={() => setNotice(undefined)} data-testid="security-settings-notice" style={{ marginBottom: 16 }} /> : null}<div className="bank-card settings-card"><button onClick={() => explainManagedSetting('登录密码')}><span className="settings-roundel red">▣</span><span><strong>登录密码</strong><small>用于登录复兴银行门户</small></span><span>查看　›</span></button><div className="settings-section"><div><span className="settings-roundel blue">◇</span><span><strong>双重验证</strong><small>登录及关键操作时需要验证，保障账户安全</small></span><Switch checked={data.mfaEnabled} disabled /></div><button onClick={() => explainManagedSetting('验证方式')}>验证方式 <span>{data.mfaMethod ?? '未启用'}　›</span></button></div><div className="settings-section"><div><span className="settings-roundel green">▤</span><span><strong>当前登录会话</strong><small>{data.lastLoginAt ? new Date(data.lastLoginAt).toLocaleString('zh-CN', { hour12: false }) : '未提供会话时间'}</small></span><Tag color="green">当前会话</Tag></div></div><div className="settings-section"><div><span className="settings-roundel orange">♢</span><span><strong>安全提醒</strong><small>账户异常变动、登录等安全事件提醒</small></span><Switch checked={data.loginNotificationsEnabled} disabled /></div></div></div><Button type="primary" size="large" onClick={() => explainManagedSetting('安全设置')} data-testid="security-managed-settings">查看管理说明</Button></div></div> : null}
  </section></PageContainer>;
}
