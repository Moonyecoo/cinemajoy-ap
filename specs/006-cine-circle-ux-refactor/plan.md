# Implementation Plan: Claude Dark 全栈深色设计体系重构、3D 翻书透视巨幕、影视圈 5 卡手牌折扇与播放器全屏底栏自动隐藏 (008-claude-dark-ui-refactor)

## 1. 核心问题诊断与重构目标 (Specification)
1. **全栈回归深色模式并引入 Claude Design / Apple Pro Dark 顶级设计体系**：
   - **根因诊断**：上一版将部分容器改为奶油白浅色，而底层的横幅、影视圈、选集、详情页仍为深色，导致深浅混杂、视觉割裂。
   - **重构标准**：全量统一为 **Claude Obsidian Dark（深邃暖曜石黑）** 6 层色阶规范：
     - `--bg: #0C0D11`（底层画布）
     - `--bg-elev: #12141A`（侧栏与顶栏悬浮层）
     - `--bg-card: #171921`（卡片表面，配 `1px solid rgba(255,255,255,0.07)` 极细微光描边与 `inset 0 1px 0 rgba(255,255,255,0.06)` 顶光）
     - `--bg-hover: #1E212B`（交互悬停态）
     - `--text: #F3F4F6` / `--text-dim: #9CA3AF` / `--muted: #64748B`
     - `--accent: #FF4D79` / `--gold: #F5B041`
   - **逐层 UI 审核清零冲突**：彻底移除 `src/app.css` 尾部的浅色覆盖，逐层统一：① 标题栏与左侧栏、② 顶栏搜索与身份胶囊、③ 首页翻书舞台与共赏厅、④ 影视圈广场与 5 卡扇面相册、⑤ 影视圈详情页与光影时刻、⑥ 新片专栏文章与阅读器、⑦ 影视详情与选集、⑧ 个人中心与模态框。
2. **首页 5 卡「翻书式 (Book-Page Trapezoidal CoverFlow)」3D 透视巨幕重构（对齐 `media_1794027763418_42fd966c.jpg`）**：
   - **根因诊断**：
     1. 旧版 `.hero` 残留了黑色外框 (`height: 440px; background: #090a0d; border: 1px solid ...`)；
     2. 侧翼卡加了刺眼的白边 (`border: 2px solid #fff`) 且透视弱，像平铺贴纸而非翻书；
     3. `src/app.js` 中 `.hero-center-overlay` 的子类名 (`.hero-center-left/mid/right`) 与 CSS 不匹配，导致片名红标飘到左上角、简介铺满整张图。
   - **重构标准**：
     - 剥离 `.hero` 外框背景与边框，使 5 张卡片直接悬浮于深色画布之上；
     - **真实翻书梯形透视 (`hero-wing-card`)**：彻底去除白边，左侧两页以右边缘为书脊铰链 (`transform-origin: right center`) 施加独立强透视 `transform: perspective(380px) rotateY(28deg)` 与书缝内阴影 (`linear-gradient(90deg, transparent 50%, rgba(0,0,0,0.78) 100%)`)；右侧两页以左边缘为书脊铰链 (`transform-origin: left center`) 施加 `transform: perspective(380px) rotateY(-28deg)`，呈现外侧高、内侧矮且紧密咬合于中央主卡背后的真实「翻书」立体折页感；
     - **中央主卡 (`hero-center-card`) 底部信息栏精准对齐**：右上角保留毛玻璃红心胶囊；底部 36% 区域采用左中右水平对齐（左侧微倾片名红标徽章 + 中部类型标签、五星金标评分、2 行简介与珊瑚红圆点进度条 + 右侧圆形播放键与白底时长胶囊）。
3. **影视圈扇形相册卡 (`circleCardHTML` & `circleFanHTML`) 顶级设计师级重构**：
   - 升级影视圈卡片为 **5 张海报黄金弧度手牌折扇 (`album-fan-5`) + 物理相册层叠底座**：提取圈内前 5 部电影真实海报，按 `-18deg, -9deg, 0deg, +9deg, +18deg` 与弧形 Y 轴位移扇形展开，中心主卡突出放大，底层配三层暗金相册页边厚度与环境背光，悬停时如同精致黑胶/蓝光典藏册优雅舒展。
4. **播放器全屏及播放时底部控制坞与鼠标指针自动隐藏修复**：
   - **根因诊断**：`src/app.css` 第 1836 行存在 `.stage:hover .controls { opacity: 1; }`！在全屏模式或鼠标停留在画面内时，`:hover` 永远为真，导致 `stage.classList.remove('show-controls')` 完全失效，底部播放菜单永远无法隐藏！
   - **重构标准**：
     - 从 `.controls` 与 `.player-topbar` 规则中彻底移除 `.stage:hover`，仅保留 `.stage.show-controls .controls, .stage.is-paused .controls, .controls:hover`；
     - 当 `.stage:not(.show-controls)` 时，`.controls` 设置 `opacity: 0; pointer-events: none; transform: translateY(12px);`，同时 `.stage:not(.show-controls)` 设置 `cursor: none;` 自动隐藏鼠标指针；
     - 在 `src/app.js` 的 `renderPlay` 中绑定 `mousemove`、`mousedown`、`keydown`、`fullscreenchange` 以及 `video` 的 `play`/`pause` 事件：播放状态下鼠标静止 2.5 秒（且未悬停在 `.controls` 上）即自动隐藏底部控制栏、顶部播放标题栏与鼠标光标；一旦移动鼠标立即丝滑唤醒。

## 2. 既有测试与架构兼容约束
- 保持 `test/test_user_fixes.js` 全部 20 项断言与 `test/perf_budget.js` 100% 兼容。
- 严格遵守 `data/domain-whitelist.json` 域名白名单，仅使用 `doubanio.com` 等合规图床。
