# Implementation Tasks: 端侧 GPU CAS 画质重塑引擎、真实流规格监控看板与 WebDAV 存储扩展 (008-gpu-clarity-engine)

## Phase 1: 端侧 GPU CAS 硬件超清画质重塑滤镜 (Tasks 1-2)
- [x] **Task 1: 在 `src/app.css` 定义 CAS 硬件增强着色器滤镜与高反差样式**
  - 定义 `.cinema-clarity-enhanced`：应用 `filter: url(#cinemajoy-cas-sharpen) contrast(1.08) brightness(1.02) saturate(1.05)` 与 `-webkit-optimize-contrast`；
  - 增加 `.btn-cas` 播放器控制胶囊与激活态金色高亮效果；
  - 增加 `.stats-for-nerds-panel` 半透明磨砂看板样式（单色等宽字体、数据矩阵）。
- [x] **Task 2: 在 `src/app.js` 播放器挂载 SVG 卷积矩阵并实现 C 键切换**
  - 在播放器 `<div class="stage">` 注入 `<svg id="clarityFilterSvg">` 包含 3×3 卷积矩阵；
  - 实现 `toggleCasClarity(force)`：默认关闭，点击或按下 `C` 键切换，弹出轻量 HUD 提示；
  - 页面卸载时安全重置滤镜状态。

## Phase 2: Stats for Nerds 真实流监控看板与 1000ms 节流 (Tasks 3-4)
- [x] **Task 3: 在 `src/app.js` 实现真实流规格看板组件与 1000ms 刷新节流**
  - 采集并展示：分辨率、真实码率、编解码器、音频轨道、当前缓冲池深度与掉帧数；
  - 设置 1000ms 节流更新定时器；
  - 按下 `I` 键或点击右上角关闭按钮，平滑隐藏并 `clearInterval` 销毁定时器。
- [x] **Task 4: 在 `destroyPlayer()` 补齐看板定时器与滤镜管道销毁**
  - 退出播放器时，强制清理 `statsTimer` 与 CAS 滤镜状态，确保 0 内存泄漏。

## Phase 3: 码率物理排序、源配置纯净化与 WebDAV 存储扩展 (Tasks 5-6)
- [x] **Task 5: 在 `lib/quality.js` 实现 `sortLinesByRealBitrate(lines)` 与源宣传词清洗**
  - 实现根据真实探测有效码率（kbps）进行物理降序排序的纯函数；
  - 清理 `data/sources.json` 中夸张虚假备注，恢复客观技术描述。
- [x] **Task 6: 在 `src/app.js` 实现设置中心私有 NAS / WebDAV 存储配置面板**
  - 增加 WebDAV 服务器、端口、账号、密码及主目录配置表单；
  - 增加 3000ms 超时连接测试与本地安全持久化。

## Phase 4: 质量门禁与 5 大断言测试 (Task 7)
- [x] **Task 7: 在 `test/test_user_fixes.js` 扩充验证 28 ~ 验证 32 并通过 `npm test`**
  - 验证 28: CAS 卷积矩阵与默认关闭门禁；
  - 验证 29: Stats for Nerds 真实流监控看板与 1000ms 节流；
  - 验证 30: sortLinesByRealBitrate 真实有效码率物理降序调度；
  - 验证 31: 出厂源配置描述纯净化与零虚假宣传；
  - 验证 32: 私有影库 WebDAV 挂载配置模型与 3000ms 超时熔断；
  - 执行 `npm test` 确保 32 项自动化测试全部通过。

## Phase 5: 本地打包交付与 Git 提交 (Task 8)
- [x] **Task 8: 构建并更新本地应用与 Git 提交**
  - 运行 `npm run pack` 编译最新应用，同步至 `/Applications/影悦.app`；
  - 提交 Git 变更并记录。
