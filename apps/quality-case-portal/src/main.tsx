import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { bankTheme } from '@localbank/bank-ui-kit';
import '@localbank/bank-ui-kit/theme.css';
import { App } from './App';
import './styles.css';

const queryClient=new QueryClient({defaultOptions:{queries:{retry:1,refetchOnWindowFocus:false,staleTime:15_000}}});
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={queryClient}><ConfigProvider theme={bankTheme} locale={zhCN}><BrowserRouter basename="/quality"><App/></BrowserRouter></ConfigProvider></QueryClientProvider></React.StrictMode>);
