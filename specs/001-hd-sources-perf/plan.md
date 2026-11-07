# Implementation Plan: 影悦 · 真高清免翻墙直连源扩展与低配置流畅渲染优化

**Feature Branch**: `001-hd-sources-perf`
**Feature Spec**: [spec.md](./spec.md)
**Status**: Planned

---

## 1. 架构设计与改动影响分析 (Architecture & Impact)

### 模块 A: 真高清直连片源生态升级与码率优先仲裁
- **改动文件**:
  - `data/sources.json` (内置片源库)
  - `lib/sources.js` (源管理与默认源拓扑)
  - `lib/quality.js` (真实码率测定与真伪 1080P/4K 仲裁)
- **技术要点**:
  - 接入实测响应 <400ms、且视频切片码率集中在 3000kbps ~ 7500kbps 的直连高速源（虎牙秒播、红牛蓝光、优质原画、新浪经典等）。
  - 在 `lib/quality.js` 扩展 `classifyQuality(kbps)`：精准分类 `[超清原画 4K/蓝光, 真1080P原画, 压缩标清]`，并在切源算法中赋予真高清源更高权重。

### 模块 B: 低配硬件极致流畅度优化 (W3C content-visibility & Electron 脱脂)
- **改动文件**:
  - `src/app.css` (卡片网格与海报图层渲染优化)
  - `main.js` (Chromium 硬件加速与内存脱脂参数)
- **技术要点**:
  - **CSS 虚拟视口跳跃渲染**：给 `.card` 增加 `content-visibility: auto; contain-intrinsic-size: 170px 290px;`，未进入视口的电影卡片完全不消耗 GPU 和 Layout 重排性能，无限滚动几百部电影依然丝滑 60FPS。
  - **低配 Electron 启动脱脂**：补充 `--disable-breakpad --disable-component-update --disable-domain-reliability --enable-zero-copy`，彻底杜绝后台冗余 I/O 抢占 CPU。

### 模块 C: 播放断链秒级探活自愈
- **改动文件**:
  - `src/app.js` (播放器错误监听与后台并发切源调度)
- **技术要点**:
  - 当视频触发 403/404 或解析失败时，并发调用 `shellApi.api.findPlayable`，在 500ms 内无缝换源并自动续播。

---

## 2. 潜在风险与防御方案 (Risks & Mitigations)

1. **风险**: `content-visibility: auto` 如果 `contain-intrinsic-size` 设置不准确，滚动条在高速滑动时可能抖动。
   - **防御**: 严格根据实际海报宽高比（160px:240px + 标题 42px = 282px 设定 `contain-intrinsic-size: 160px 282px`），确保离屏占位高度与真实内容 1:1 绝对吻合。
2. **风险**: 部分源声称是 1080P，实际为 400kbps 模糊压制版。
   - **防御**: 在 `lib/quality.js` 建立强制比特率基线，低于 1500kbps 的一律降级标注为「压缩画质」，不可冒充「原画蓝光」。

---

## 3. 验证计划 (Verification Plan)
- 编写测试用例验证 `content-visibility` 规则已生效、片源质量仲裁输出正确、新增真高清源可连通。
- 运行 `npm test` 保证全套自动化测试 100% 绿色通过。
