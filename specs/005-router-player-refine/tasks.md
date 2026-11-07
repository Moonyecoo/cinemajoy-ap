# Implementation Tasks: 片源智能并发测速与播放器体验深度优化 (005-router-player-refine)

## Phase 1: 测速探针与防熔断自愈加固 (Tasks 1-2)
- [x] **Task 1**: 在 `lib/router.js` 中实现无循环依赖的超轻量并发测速探针 `probeAllSites`：
  - 单源纯 HTTP HEAD/GET 探活，超时 2000ms；
  - 4 路受控滑动池并发，更新 `latencyEma` 与 `lastTested`，不累加破坏性硬熔断；
  - 在 `main.js`（增加防抖互斥锁）与 `preload.js` 暴露 `router:probeAll`。
- [x] **Task 2**: 加固 `lib/api.js` 中 `findPlayableSource` 的全熔断自愈机制：
  - 当过滤熔断源后候选列表为空时，自动放行所有启用源，杜绝播放器全站瘫痪。

## Phase 2: 设置页一键全源测速界面升级 (Task 3)
- [x] **Task 3**: 前端 `renderSettings` 增加「⚡ 一键全源并发测速」：
  - 增加防抖互斥与进度状态；
  - 测速完成后显示毫秒延迟徽标（绿/蓝/红）并自适应排位；
  - 在 `src/app.css` 补充样式。

## Phase 3: 播放器双击全屏、快捷切集与快捷键浮层 (Tasks 4-5)
- [x] **Task 4**: 播放器视口交互与快捷键扩展：
  - 视频区域双击 `ondblclick` 平滑切换全屏；
  - 监听 `[` 切换上一集，`]` 切换下一集；
  - 选集当前项执行 `scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })`。
- [x] **Task 5**: 快捷键浮层指南弹窗：
  - 按 `?` / `F1` 唤起悬浮半透明快捷键帮助浮层 `#shortcutModal`，按 `Esc` 或点关闭按钮退出。

## Phase 4: 自动化测试断言与回归验证 (Task 6)
- [x] **Task 6**: 补充自动化测试并在交付前验证：
  - 更新 `test/test_sources.js` 增加对 `probeAllSites`、并发限制与全熔断自愈的断言；
  - 更新 `test/test_user_fixes.js` 增加对双击全屏、切集键、快捷键弹窗的断言；
  - 运行 `npm test` 确保 100% 测试全绿。
