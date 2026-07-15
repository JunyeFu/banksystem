import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card, Space } from 'antd';
import { BankPageState, BankStatusTag } from './state-components';

const meta = { title: '金融基础组件/页面状态', component: BankPageState, tags: ['autodocs'], args: { state: 'ready' } } satisfies Meta<typeof BankPageState>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = { render: () => <BankPageState state="ready"><Card title="已加载业务数据"><Space wrap>{['SETTLED','RUNNING','PENDING_APPROVAL','FAILED','APPROVED'].map(value=><BankStatusTag key={value} value={value}/>)}</Space></Card></BankPageState> };
export const Loading: Story = { args: { state: 'loading' } };
export const Empty: Story = { args: { state: 'empty' } };
export const Error: Story = { args: { state: 'error', errorMessage: '银行渠道服务未返回有效响应。', retry: () => undefined } };
export const Forbidden: Story = { args: { state: 'forbidden' } };
export const Submitting: Story = { args: { state: 'submitting' } };
export const Disabled: Story = { args: { state: 'disabled' } };
