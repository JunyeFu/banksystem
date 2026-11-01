import ReactDOM from 'react-dom/client';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { BrowserRouter } from 'react-router-dom';
import { AgentApp } from './AgentApp';
import './styles.css';

// The local service advertises its origin; land that entry on the declared Agent base.
if (window.location.pathname === '/') window.history.replaceState(window.history.state, '', import.meta.env.BASE_URL);

ReactDOM.createRoot(document.getElementById('agent-root')!).render(
  <ConfigProvider locale={zhCN} theme={{ algorithm: theme.darkAlgorithm, token: {
    colorPrimary: '#a6192e', colorBgContainer: '#20262f', colorBgElevated: '#20262f',
    colorText: '#eff1f5', colorTextSecondary: '#b7beca', colorBorder: '#343d49',
    fontFamily: 'Noto Sans SC, sans-serif', fontSize: 14, fontWeightStrong: 400, lineHeight: 22 / 14, borderRadius: 12,
  } }}>
    <BrowserRouter basename="/agent"><AgentApp /></BrowserRouter>
  </ConfigProvider>,
);
