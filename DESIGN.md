# Tank Game UI Design System

> 本文档定义了 Tank Game（坦克大战）前端界面的设计系统。所有后续 UI 开发必须严格遵循本规范。

---

## 1. 设计哲学

- **中性为主，强调为辅**：界面以白色、灰色为主，克莱因蓝（Klein Blue）仅用于强调（主按钮、选中态、交互反馈）。
- **克制与清晰**：避免过度装饰，每个元素必须有明确的功能目的。
- **一致的层级**：通过背景色、阴影、圆角建立清晰的信息层级。

---

## 2. 色彩系统

### 2.1 CSS 变量（定义于 `src/styles.css`）

```css
:root {
  --kb-blue: #002fa7;          /* 克莱因蓝 —— 主强调色 */
  --kb-blue-dark: #001f6e;     /* 悬停/按下态 */
  --kb-blue-light: #e6ebf7;    /* 浅蓝背景（如准备态、房间号） */
  --bg: #f5f5f5;               /* 页面全局背景 */
  --card-bg: #ffffff;          /* 卡片/面板背景 */
  --text-primary: #171717;     /* 主标题、重要文字 */
  --text-secondary: #525252;   /* 标签、次要文字 */
  --text-tertiary: #a3a3a3;    /* 占位符、禁用态 */
  --border: #e5e5e5;           /* 默认边框 */
  --border-emphasized: #d4d4d4;/* 强调边框（hover 态） */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-md: 0 4px 24px rgba(0, 0, 0, 0.06);
  --radius-sm: 8px;
  --radius-md: 10px;
  --radius-lg: 16px;
}
```

### 2.2 使用规则

| 场景 | 颜色 |
|------|------|
| 页面背景 | `--bg` (#f5f5f5) |
| 卡片/面板 | `--card-bg` (#ffffff) |
| 主按钮背景 | `--kb-blue` |
| 主按钮悬停 | `--kb-blue-dark` |
| 次按钮（白底） | `--card-bg` + `--border` 边框 |
| 幽灵按钮 | transparent + `--text-secondary` 文字 |
| 输入框背景 | #fafafa |
| 输入框聚焦边框 | `--kb-blue` + 外发光 `0 0 0 3px rgba(0, 47, 167, 0.08)` |
| 错误/警告 | `#dc2626`（不使用克莱因蓝） |

---

## 3. 布局原则

### 3.1 顶级容器（绝对禁止圆角和阴影）

`.app-container`、`.menu-container`、`.lobby-container` 是顶级布局容器：
- **不允许** `border-radius`
- **不允许** `box-shadow`
- **不允许** 背景色装饰

它们的唯一职责是：全屏居中、定义最大宽度、控制内边距。

```css
.menu-container,
.lobby-container {
  width: 100%;
  max-width: 440px;
  flex: 0 0 100%;         /* 关键：防止内容少时收缩 */
  display: flex;
  flex-direction: column;
  align-items: stretch;   /* 子元素拉伸至容器宽度 */
  gap: 20px;
}
```

### 3.2 内部卡片（允许圆角和阴影）

`.card` 是内容承载容器：
- `border-radius: var(--radius-lg)` (16px)
- `box-shadow: var(--shadow-md)`
- `background: var(--card-bg)`
- `padding: 32px`
- 宽度必须始终为 `100%`（由父容器 stretch 保证）

### 3.3 响应式

- 最大内容宽度：`440px`
- 移动端：水平内边距保持 `24px`
- 所有组件宽度使用百分比或 `flex: 1`，**禁止**硬编码像素宽度

---

## 4. 组件规范

### 4.1 按钮 `.btn`

```css
.btn {
  width: 100%;
  padding: 12px 20px;
  font-size: 0.9375rem;
  font-weight: 600;
  border-radius: var(--radius-md);
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
}
```

| 变体 | 类名 | 背景 | 文字 | 边框 |
|------|------|------|------|------|
| 主按钮 | `.btn-primary` | `--kb-blue` | 白色 | 无 |
| 次按钮 | `.btn-secondary` | `--card-bg` | `--text-primary` | `1px solid --border` |
| 幽灵按钮 | `.btn-ghost` | transparent | `--text-secondary` | 无 |

**规则：**
- 幽灵按钮必须 `align-self: center`，防止被 stretch 拉宽
- 图标 + 文字按钮使用 `gap: 0.5rem`，图标大小 `18px`（操作按钮）或 `16px`（行内）
- 禁用态：`opacity: 0.45`，`cursor: not-allowed`

### 4.2 输入框（Ark UI Field）

- 标签：`font-size: 0.8125rem`，`font-weight: 600`，`text-transform: uppercase`，`letter-spacing: 0.03em`
- 输入框：`padding: 10px 14px`，`border-radius: var(--radius-sm)`，背景 `#fafafa`
- 占位符颜色：`--text-tertiary`
- 聚焦：边框变 `--kb-blue`，加蓝色外发光

### 4.3 分段控制器 SegmentGroup

- 根容器：`width: 100%`，`background: --bg`，`border-radius: var(--radius-md)`，`padding: 4px`
- 选项：`flex: 1`，`height: 2.5rem`，`font-weight: 600`
- **必须** `white-space: nowrap` 防止英文换行
- 指示器：白色背景 + `shadow-sm`，圆角 `8px`，带滑动动画 `transition: all 0.2s ease-out`

### 4.4 开关 Switch

- 控制条：`width: 44px`，`height: 24px`，`border-radius: 9999px`
- 未选中：`background: #d4d4d4`
- 选中：`background: --kb-blue`
- 滑块：`20px × 20px`，白色，位移 `translateX(20px)`
- 标签在右侧，与控件保持 `12px` 间距

### 4.5 对话框 Dialog

- 遮罩：`rgba(0, 0, 0, 0.35)`，带 `fade-in/fade-out` 动画
- 内容卡片：`max-width: 360px`，`border-radius: var(--radius-lg)`，`box-shadow: --shadow-md`
- 标题：`font-weight: 700`，错误标题使用红色 `#dc2626`
- 动画：`scale-fade-in`（0.96 → 1）和 `scale-fade-out`

### 4.6 分隔线 `.divider`

- 格式：文字（如"或" / "OR"）居中，两侧等长横线
- 颜色：`--text-tertiary`
- 横线：`1px solid --border`

---

## 5. Ark UI 使用规范

本项目使用 `@ark-ui/solid` 作为组件库。**所有 Ark UI 组件必须通过全局 CSS 的 `data-scope` + `data-part` 属性进行样式覆盖**，而不是内联 style 或 class 模块。

### 5.1 禁止的做法

```tsx
<!-- 不要这样写 -->
<SegmentGroup.Root class="my-custom-class">
```

### 5.2 正确的做法

```css
[data-scope='segment-group'][data-part='root'] {
  /* 样式写在这里 */
}
```

### 5.3 例外

当需要为 Ark UI 组件内部的某个具体元素添加**布局样式**（如 flex 排列、间距）时，可以使用内联 `style` 属性。但**颜色、边框、阴影、圆角**必须通过 CSS 变量全局控制。

---

## 6. 图标使用

- 图标库：`lucide-solid`
- 图标大小：
  - 按钮内：`18px`
  - 行内文本旁：`16px`
  - 对话框标题：`20px`
- 图标颜色：默认继承文字颜色，或显式传递 `color` prop（如 `#a3a3a3` 表示次要）
- 图标必须配合文字使用（除语言切换按钮外，不单独使用图标按钮）

---

## 7. i18n 规范

- 所有 UI 文本必须通过 `t()` 函数翻译
- 新增翻译键时，同时更新 `src/i18n/zh.ts` 和 `src/i18n/en.ts`
- 翻译键命名：`{模块}.{描述}`，如 `menu.singlePlayer`、`lobby.createRoom`
- 中文翻译保留项目的惯例

---

## 8. 动画与过渡

- 按钮、输入框：`transition: all 0.15s ease`
- 分段指示器：`transition: all 0.2s ease-out`
- 对话框：`0.15s ease-out` 进入，`0.1s ease-in` 退出
- **不使用**过于复杂的动画，保持界面响应迅速

---

## 9. 文件结构约定

```
src/
  styles.css          # 全局设计系统样式（唯一样式源）
  Menu.tsx            # 菜单（SegmentGroup + Field + 按钮）
  Lobby.tsx           # 大厅（Field + Switch + Dialog + 列表）
  App.tsx             # 应用壳（不添加任何样式）
  i18n/
    index.ts          # i18n 入口
    zh.ts             # 中文翻译
    en.ts             # 英文翻译
```

- **不创建**组件级 CSS 模块文件（`.module.css`）
- 所有样式集中在 `styles.css`
- 组件内部不使用 `<style>` 标签或 CSS-in-JS

---

## 10. 常见错误清单

| 错误 | 正确 |
|------|------|
| 顶级容器加圆角/阴影 | 只有 `.card` 允许 |
| 按钮宽度写死像素 | 使用 `width: 100%` |
| SegmentGroup 不换行 | 必须加 `white-space: nowrap` |
| 容器用 `align-items: center` | 菜单/大厅用 `align-items: stretch` |
| 幽灵按钮被拉宽 | 加 `align-self: center` |
| 输入框白色背景 | 使用 `#fafafa` |
| 错误提示用红色 div | 使用 Ark UI Dialog |

---

*最后更新：2026-05-03*
