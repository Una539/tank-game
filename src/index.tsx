/**
 * @module index
 * @description 前端应用入口文件。
 * 负责初始化 SolidJS 应用、挂载到 DOM、引入全局样式。
 * 这是 Vite + SolidJS 项目的标准入口结构。
 */

/* @refresh reload */
// 上面的注释是 Vite 的 Hot Module Replacement（HMR）指令，
// 告诉 Vite 在开发模式下如果此文件变化，应完全重新加载页面而非尝试热更新。
// SolidJS 的细粒度响应式系统与标准 React HMR 不兼容，所以使用 reload 模式。

import { render } from 'solid-js/web';
import 'solid-devtools';
// solid-devtools 是 SolidJS 的浏览器开发者工具扩展，仅在开发模式下生效。
// 它允许在浏览器 DevTools 中查看 Signal、Memo 等响应式原语的状态。

import './styles.css';
// 全局 CSS 样式。包含菜单、大厅、游戏容器的样式定义。

import App from './App';

/**
 * 获取根 DOM 节点。
 * 在 index.html 中应有 `<div id="root"></div>`。
 */
const root = document.getElementById('root');

/**
 * 开发模式下的安全检查。
 * 如果根节点不存在或不是 HTMLElement，抛出明确错误。
 * 这是 Vite 模板的默认代码，帮助开发者快速发现 index.html 配置错误。
 */
if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    'Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?',
  );
}

/**
 * 渲染 SolidJS 应用。
 * render 函数接收一个返回 JSX 的函数（而非 JSX 本身），这是 SolidJS 与 React 的区别之一：
 * SolidJS 使用函数形式确保组件在响应式系统中被正确追踪。
 * `root!` 是非空断言（TypeScript 语法），表示我们已确认 root 不为 null。
 */
render(() => <App />, root!);
