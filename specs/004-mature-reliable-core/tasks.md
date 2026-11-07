# Implementation Tasks: 影悦工业级可靠稳定与极致体验重构 (004-mature-reliable-core)

## Phase 1: 境内域名白名单审计与境外依赖切除 (Tasks 1-2)
- [x] **Task 1**: 彻底删除境外模型与 AI 冗余文件：
  - 删除 `lib/ai.js`、`test/test_ai.js`、`data/models/` 目录以及 `data/vector_cache.json`。
  - 清理 `main.js` 与 `preload.js` 中的 `ai:*` IPC 注册。
  - 调整 `package.json` 中的 `scripts.test`，剔除 `node test/test_ai.js`。
  - 调整 `test/test_user_fixes.js`，将原针对 `ai.js` 的测试断言迁移或安全移除。
- [x] **Task 2**: 运行并验证域名合规审计：
  - 运行 `node scripts/audit-domains.js`，断言退出码为 0，且无任何违规境外未回退域名。

## Phase 2: 投屏入口收敛与按需加载 (Task 3)
- [x] **Task 3**: 投屏服务默认关闭并转入实验性设置：
  - `main.js` 移除启动即无条件 `cast.startWebCastServer()`，改为按需开启。
  - `src/app.js` 设置项中增加「实验性功能 - 局域网投屏」开关（默认关闭）。
  - 播放器底栏 `#btnCast` 根据 `enableCast` 开关状态动态渲染/显示。

## Phase 3: 低配渲染与视口 DOM 控制 (Task 4)
- [x] **Task 4**: 首页网格虚拟渲染与播放器低配锁定：
  - `src/app.js` 影视列表加载控制活跃 DOM 节点 ≤ 60，避免低配设备内存暴增。
  - 确保 `hls.js` 缓冲区参数严格锁定（`maxBufferLength: 30`, `maxMaxBufferLength: 60`, `backBufferLength: 10`, `lowLatencyMode: false`）。

## Phase 4: 全套回归测试与交付门禁 (Task 5)
- [x] **Task 5**: 执行全部自动化测试套件：
  - 执行 `npm test`，确保审计、DNS、画质仲裁、元数据、多源熔断、性能预算及深度验证全部通过。
