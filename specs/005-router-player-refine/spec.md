# Feature Specification: 片源智能并发测速与播放器体验深度优化 (005-router-player-refine)

**Feature Branch**: `005-router-player-refine`
**Created**: 2026-11-06
**Status**: Revised after EGM Goldfish Review
**Input**: 用户请求选项 23（片源测速与智能路由加固 + 播放器体验微调）。

---

## 1. User Scenarios & Core Constraints (EGM Hardened)

### 场景 1：全网片源一键并发极速测速与自适应优选 (Priority: P1)
- **User Journey**:
  - 用户在侧栏点击「片源测速 / 源管理」时，页面提供「⚡ 一键全源测速」按钮。
  - 系统以 4 路受控滑动池并发对已启用的源进行单次超轻量 HTTP 请求（严格 2.0s 超时，纯测网络与基本接口有效性，绝不上卷任何远程刮削或深层数据拉取）。
  - **防雪崩与自愈铁律**：测速探活仅记录延迟 EMA 与健康度，绝不触发硬熔断；`findPlayableSource` 增加全熔断兜底自愈：若全部可用源皆处于熔断状态，系统自动解除阻断尝试播放，绝不破坏用户播放。
  - 前端具备 `isProbing` 防抖互斥锁，测速期间按钮置灰并显示进度，测速完成后统一批量刷新，避免重复点击或高频重绘 DOM。
  - 测速完成后展示各源延迟徽标（< 300ms 绿、300-800ms 蓝/黄、> 800ms / 超时红），并自适应排序。

### 场景 2：播放器双击全屏与直觉桌面级交互 (Priority: P1)
- **User Journey**:
  - 用户双击视频画面任意区域，平滑切换全屏 / 窗口化（严格桌面播放器原生直觉）。
  - 键盘快捷键帮助：按 `?` 或 `F1` 唤起悬浮半透明快捷键浮层指南，展示所有快捷键操作。

### 场景 3：选集智能定位记忆与吸附 (Priority: P2)
- **User Journey**:
  - 观看长篇剧集或动漫时，当前正在播放的选集按钮自动应用 `scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })`，严格限制在选集滚动容器内横向居中，绝不带动外层主页面纵向跳动。
  - 键盘支持快捷切集：按 `[` 切换上一集，按 `]` 切换下一集。

---

## 2. Requirements & Interface Contracts

- **FR-001 (Router Probing & Decoupling)**:
  - `lib/router.js` 增加 `probeAllSites(sites, { concurrency = 4, timeoutMs = 2000, tester } = {})`。
  - **严禁循环依赖**：`lib/router.js` 绝不在顶层 require `lib/api.js`，通过纯原生轻量探针或参数注入。
  - 测速探活不累加硬熔断计数器。
- **FR-002 (All-Broken Circuit Breaker Healing)**:
  - `lib/api.js` 中的 `findPlayableSource` 增加兜底：若所有源均被 `isCircuitBroken` 标记，自动放行所有启用源进行并发探活，避免离线或网络波动导致全站无法播放。
- **FR-003 (IPC Channel & Concurrency Lock)**:
  - `main.js` 注册 `router:probeAll`，具有并发防抖锁。
  - `preload.js` 暴露 `router.probeAll()`。
- **FR-004 (Speedtest UI)**:
  - `src/app.js` 设置页提供一键测速按钮与测速延迟徽标，批量刷新 DOM。
- **FR-005 (Player Double Click)**:
  - 播放器监听 `videoStage` 的 `dblclick` 事件切换全屏。
- **FR-006 (Shortcut Modal & Episode Keys)**:
  - 增加按 `?` / `F1` 弹出 `#shortcutModal`。
  - 选集按 `[` / `]` 切换，当前集数 `scrollIntoView({ block: 'nearest', inline: 'center' })`。

---

## 3. Success Criteria & Automated Verification
- **SC-001**: 自动化测试：`node test/test_sources.js` 增加对 `probeAllSites`、全熔断自愈兜底的断言，退出码为 0。
- **SC-002**: 自动化测试：`node test/test_user_fixes.js` 增加对快捷键浮层、双击全屏、切集快捷键的断言，退出码为 0。
- **SC-003**: `npm test` 8 项测试全套 100% 绿灯。
- **SC-004**: `node scripts/audit-domains.js` 100% 通过，无循环依赖报错。
