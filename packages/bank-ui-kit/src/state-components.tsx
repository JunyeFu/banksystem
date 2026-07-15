import type { ReactNode } from 'react';
import { Alert, Button, Empty, Skeleton, Spin, Tag } from 'antd';

const statusMap: Record<string, { text: string; color: string }> = {
  HEALTHY:{text:'健康',color:'success'}, DEGRADED:{text:'降级',color:'warning'}, UNAVAILABLE:{text:'不可用',color:'error'},
  CREATED:{text:'已创建',color:'processing'}, VALIDATING:{text:'校验中',color:'processing'}, RISK_REVIEW:{text:'风险复核',color:'warning'}, PENDING_APPROVAL:{text:'待审批',color:'warning'}, PENDING_CORE_POSTING:{text:'核心入账中',color:'processing'}, PENDING_CLEARING:{text:'清算中',color:'processing'}, SETTLED:{text:'已结算',color:'success'},
  DRAFT:{text:'草稿',color:'default'}, IN_REVIEW:{text:'待审核',color:'warning'}, APPROVED:{text:'已批准',color:'success'}, CONFLICT:{text:'冲突',color:'error'}, ARCHIVED:{text:'已归档',color:'default'}, REJECTED:{text:'已驳回',color:'error'},
  QUEUED:{text:'排队中',color:'default'}, RUNNING:{text:'运行中',color:'processing'}, PAUSED:{text:'已暂停',color:'warning'}, COMPLETED:{text:'已完成',color:'success'}, FAILED:{text:'失败',color:'error'},
  OPEN:{text:'待处理',color:'error'}, INVESTIGATING:{text:'调查中',color:'processing'}, RECOVERING:{text:'恢复中',color:'warning'}, RESOLVED:{text:'已解决',color:'success'}, READY:{text:'就绪',color:'success'}, RELEASED:{text:'已发布',color:'success'}, BLOCKED:{text:'阻断',color:'error'}, PASS:{text:'通过',color:'success'}, PENDING:{text:'待定',color:'warning'}, NONE:{text:'无',color:'default'},
  P0:{text:'P0',color:'error'}, P1:{text:'P1',color:'error'}, P2:{text:'P2',color:'warning'}, P3:{text:'P3',color:'default'},
};

export function BankStatusTag({ value }: { value: string }): JSX.Element {
  const item = statusMap[value] ?? { text: value, color: 'default' };
  return <Tag className="bank-status" color={item.color} data-testid={`status-${value.toLowerCase()}`}>{item.text}</Tag>;
}

export type BankPageStateKind = 'ready' | 'loading' | 'empty' | 'error' | 'forbidden' | 'submitting' | 'disabled';
export function BankPageState({ state, errorTitle = '无法加载页面数据', errorMessage = '服务暂不可用，请稍后重试。', emptyDescription = '暂无符合条件的数据', retry, children }: { state: BankPageStateKind; errorTitle?: string; errorMessage?: string; emptyDescription?: string; retry?: () => void; children?: ReactNode }): JSX.Element {
  if (state === 'loading') return <div className="bank-state-panel" data-page-state="loading"><Skeleton active paragraph={{ rows: 5 }}/></div>;
  if (state === 'empty') return <div className="bank-state-panel" data-page-state="empty"><Empty description={emptyDescription}/></div>;
  if (state === 'error') return <Alert data-page-state="error" type="error" showIcon message={errorTitle} description={errorMessage} action={retry?<Button data-testid="query-retry" aria-label="重试加载" onClick={retry}>重试</Button>:undefined}/>;
  if (state === 'forbidden') return <Alert data-page-state="forbidden" type="warning" showIcon message="无权访问" description="当前角色没有查看或操作此资源的权限。"/>;
  if (state === 'submitting') return <div className="bank-state-panel bank-state-panel--center" data-page-state="submitting"><Spin/><strong>正在提交，请勿重复操作</strong></div>;
  if (state === 'disabled') return <div className="bank-state-panel bank-state-panel--center" data-page-state="disabled"><Button disabled>当前不可操作</Button><span>前置条件尚未满足</span></div>;
  return <div data-page-state="ready">{children}</div>;
}
