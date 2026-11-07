# Tasks: 影悦 · 视觉纯净极简重塑、海报高清极速化、播放器交互升级与 AI 观影伴侣

**Feature Branch**: `002-player-ui-ai`
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)
**Status**: Implemented & Verified

---

## 任务清单 (Actionable Task List)

- [x] **Task 1: 移除侧栏「独立版」冗余标识，纯净品牌设计** (`src/index.html`)
  - 删除 `<span class="brand-sub">独立版</span>`，保持「影悦」单一名号的极简高质感。

- [x] **Task 2: 播放器选集按钮重构为暗黑质感玻璃胶囊** (`src/app.js`, `src/app.css`)
  - 将播放页集数按钮重构为 `.play-ep-btn`。
  - 注入半透明暗色背景、清晰浅灰文字（`#e6edf3`）与蓝光高亮当前集，彻底消除全白方块与不可见文字问题。

- [x] **Task 3: 播放/暂停按钮升级为高对比圆形主控键** (`src/app.js`, `src/app.css`)
  - 增强 `#btnPlay` 为 38px/40px 高对比圆形按钮，居中对齐 24x24 Material/Feather SVG 图标并增添悬停光晕。

- [x] **Task 4: 海报管道 24 路并发扩容与超清自愈加速** (`lib/imgproxy.js`, `lib/metadata.js`)
  - 将 `upstreamQueue` 限制从 8 提升至 24。
  - 降低 curl 挂起超时为 2.5s，超清海报并行回退机制。

- [x] **Task 5: 构建端侧 AI 智能观影伴侣与交互抽屉** (`src/app.js`, `src/app.css`, `lib/ai.js`, `main.js`, `preload.js`)
  - 播放器底栏增加「✨ AI伴侣」入口，绑定快捷键 `A`。
  - 实现侧滑抽屉、智能看点抽取、4 个互动问题与即时解答逻辑。

- [x] **Task 6: 编写回归自动化测试并执行验收全绿** (`test/test_user_fixes.js`, `npm test`)
  - 补充第 13 项测试并运行 `npm test`，全套测试 100% 通过。
