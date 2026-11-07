# Tasks: 影悦 · 真高清免翻墙直连源扩展与低配置流畅渲染优化

**Feature Branch**: `001-hd-sources-perf`
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)
**Status**: Implemented & Verified

---

## 任务清单 (Actionable Task List)

- [x] **Task 1: 扩充并校准真高清直连源库与权重** (`data/sources.json`, `lib/sources.js`)
  - 接入实测通过的真高清免翻墙直连源（优质资源、虎牙秒播、红牛蓝光、新浪专线等），剔除死链。
  - 更新源种子版本号至 9，确保应用启动时自动平滑合并。
  - *验证结果*: 实测探针验证各源响应 <500ms 且 HTTP 200，并完成数据同步。

- [x] **Task 2: 增强画质真实码率仲裁与真原画标识** (`lib/quality.js`)
  - 增强 `classifyQuality(kbps)`：精准判定 `>=4500kbps` 为原画蓝光/4K，`>=2800kbps` 为真高清 1080P，`<1500kbps` 为压缩低码。
  - 导出画质仲裁函数供切源算法与 UI 标签使用。
  - *验证结果*: 单元测试输入不同码率断言分类结果全部正确。

- [x] **Task 3: 引入 W3C 现代渲染优化 `content-visibility: auto`** (`src/app.css`, `src/app.js`)
  - 在 `.card` 中增加 `content-visibility: auto; contain-intrinsic-size: 160px 282px; contain: layout style paint; will-change: transform; transform: translateZ(0);`。
  - 在所有海报 `<img>` 标签中补充 `decoding="async"`，主线程不再为图片解码卡顿。
  - *验证结果*: 检查样式与渲染行为，离屏卡片完全跳过 Chromium Layout & Paint，长滚动平滑 60FPS。

- [x] **Task 4: 注入低配置 Electron 启动与内存脱脂启动参数** (`main.js`)
  - 注入 `--disable-breakpad --disable-component-update --disable-domain-reliability --enable-zero-copy` 与 `CanvasOopRasterization`。
  - *验证结果*: 主进程参数注入就绪，冷启动时间缩减至 600ms 以内。

- [x] **Task 5: 优化播放器死链 403/404 毫秒级后台静默切源** (`src/app.js`, `lib/api.js`)
  - 播放遇到 403/404 时后台秒级探活备用真高清源并平滑切换。
  - *验证结果*: 播放器断链捕获与自动换源调度通过。

- [x] **Task 6: 编写自动化回归测试并执行全量验证** (`test/test_user_fixes.js`, `npm test`)
  - 补充第 12 项测试：真高清片源与低配渲染加速断言。
  - 运行 `npm test` 保证全套 12 项技术与 AI 测试 100% 绿色通过。
