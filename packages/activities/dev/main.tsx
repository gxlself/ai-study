import { createRoot } from 'react-dom/client';
import '../../plugin-sdk/src/tokens.css';
import '../src/styles.css';
import './styles.css';
import { Playground } from './Playground';

const element = document.getElementById('root');
if (!element) throw new Error('缺少 playground 根节点');

// 插件有独立的异步 root 生命周期，此处不启用 StrictMode 双挂载。
createRoot(element).render(<Playground />);
