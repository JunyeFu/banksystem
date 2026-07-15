import type { ReactNode } from 'react';
import { BankPageState, BankStatusTag } from '@localbank/bank-ui-kit';

export function StatusTag({value}:{value:string}){return <BankStatusTag value={value}/>}
export function Page({id,title,subtitle,action,children}:{id:string;title:string;subtitle:string;action?:ReactNode;children:ReactNode}){return <main className="hz-page" data-page-id={id}><header className="hz-page-heading"><div><h1>{title}</h1><p>{subtitle}</p></div>{action}</header>{children}</main>}
export function QueryState({loading,error,empty,retry,children}:{loading:boolean;error:Error|null;empty?:boolean;retry:()=>void;children:ReactNode}){return <BankPageState state={loading?'loading':error?'error':empty?'empty':'ready'} errorTitle="无法加载平台数据" errorMessage={error?.message} retry={retry}>{children}</BankPageState>}
export const mono=(value:string)=> <span className="hz-mono" title={value}>{value.length>18?`${value.slice(0,10)}…${value.slice(-6)}`:value}</span>;
