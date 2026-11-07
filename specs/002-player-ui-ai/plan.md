# Implementation Plan: 影悦 · 视觉纯净极简重塑、海报高清极速化、播放器交互升级与 AI 观影伴侣

**Feature Branch**: `002-player-ui-ai`
**Feature Spec**: [spec.md](./spec.md)
**Status**: Planned

---

## 1. 架构方案与模块职责 (Architecture)

### 模块 1: UI 纯净化与播放器视觉交互升级
- **改动文件**: `src/index.html`, `src/app.css`, `src/app.js`
- **实现细节**:
  - `src/index.html`: 移除 `.brand-sub`「独立版」节点，统一为经典纯净「影悦」Logo。
  - `src/app.css` & `src/app.js`: 重构播放页选集 `<button class="play-ep-btn ...">` 样式，设计现代暗黑半透明玻璃背景（`rgba(255, 255, 255, 0.08)`），字体设为 `#e6edf3`，当前播放项使用品牌强调色 `#1677ff` 搭配柔和辉光阴影，彻底根除白底反光无法阅读缺陷。
  - `#btnPlay`: 升级为主控圆形实体按钮（40px 径向高反差设计），播放与暂停图标微调至黄金视觉中心。

### 模块 2: 海报高并发通道与高清自愈极速化
- **改动文件**: `lib/imgproxy.js`, `lib/metadata.js`
- **实现细节**:
  - `lib/imgproxy.js`: 并发调度限制扩容至 24 路并发，上游超时截断压低至 2.5s（连接 1.5s），遇到故障源 0.2s 内转入国内官方超清自愈接口。
  - `lib/metadata.js`: 补充豆瓣超清海报原画解析与百度百科大图直连，提升大图渲染清晰度。

### 模块 3: 端侧 AI 智能观影伴侣交互系统
- **改动文件**: `src/app.js`, `src/app.css`, `lib/ai.js`
- **实现细节**:
  - 播放器底栏增加「✨ AI 智能伴侣」按键与快捷键 `A` 绑定。
  - 点击滑出右侧质感半透明磨砂抽屉面板（`ai-companion-drawer`）：
    - 剧情速览与情绪基调提炼
    - 人物看点与关系摘要
    - 4 项快捷交互问答（高能时刻、结局探讨、适合群体、深度细节）
    - 相似佳作无缝推荐

---

## 2. 自动化验证 (Verification)
- 单元测试与端到端测试用例：验证品牌纯净、播放器选集类名、海报高并发参数、AI 伴侣组件存在性。
- `npm test` 全量全绿。
