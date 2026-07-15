import type { Preview } from '@storybook/react-vite';
import { ConfigProvider } from 'antd';
import { bankTheme } from '../src';
import '../src/theme.css';
const preview: Preview = { decorators: [(Story) => <ConfigProvider theme={bankTheme}><div style={{maxWidth:960,margin:'24px auto'}}><Story/></div></ConfigProvider>], parameters: { backgrounds: { default: 'canvas', values: [{name:'canvas',value:'#f7f7f5'}] } } };
export default preview;
