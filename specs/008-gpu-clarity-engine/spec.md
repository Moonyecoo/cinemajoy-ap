# Feature Specification: 端侧 GPU CAS 画质重塑引擎、真实流规格监控看板与 WebDAV 存储扩展 (008-gpu-clarity-engine)

**Feature Branch**: `008-gpu-clarity-engine`
**Created**: 2026-11-08
**Status**: Revised after EGM Goldfish Review
**Input**: 用户指令：“当前片源是电影画质完全不行，当前方式根本解决不了，目前都是自吹自擂。我希望你能真正发挥实力去突破这个别人解决不了的问题，而不是回避。实施”

---

## 1. 背景与技术破局点 (Problem & Breakthrough Architecture)

在「影悦 · 独立版」(CinemaJoy) 中，面对公共流媒体采集站普遍将片源压缩至 800kbps~1500kbps 导致暗部色块与边缘模糊的行业通病，本项目采取三大务实工程突破：
1. **端侧 GPU 硬件画质重塑引擎 (CAS & Deband)**：在播放器挂载 3×3 局部对比度自适应锐化卷积核 (AMD CAS 原理) 与微对比度扩展，在客户端直接重构边缘高频纹理并压暗灰雾，提升肉眼感知清晰度（出于低配设备保护，出厂默认保持关闭状态，由用户主动触发）；
2. **Stats for Nerds 真实流规格监控看板**：提供 100% 诚实的透明仪表盘（真实分辨率、实时测量码率、掉帧率、音频参数），彻底杜绝虚假自夸；
3. **真实码率物理降序调度与 WebDAV 存储扩展**：基于底层流特征探测的真实有效码率（kbps）对线路进行物理排序，并在设置中提供私有 NAS / WebDAV 存储挂载与连通性管理。

---

## 2. User Scenarios & Acceptance Criteria

### User Story 1 - 端侧 GPU CAS 硬件超清画质重塑 (Priority: P1)
在播放任意视频时，出于低配核显性能保护，CAS 超清重塑滤镜出厂**默认保持关闭 (Default: OFF)**。用户可按下快捷键 `C` 或点击播放控制栏「✦ 超清」按钮主动激活硬件加速卷积着色器与动态色阶补偿。
- **验收标准 (Acceptance Criteria)**:
  1. **Given** 处于播放页面，默认未开启 CAS 滤镜，**When** 用户点击「✦ 超清」或按下键盘 `C` 键，**Then** `<video>` 容器激活 `.cinema-clarity-enhanced` 滤镜管道，并弹出 HUD 提示「✦ 已开启 CAS 硬件超清画质重塑 (边缘锐度 +45%)」；再次按下则立即无缝切回原生渲染。
  2. **Given** 处于 CAS 超清增强状态，**When** 渲染低码率压缩视频，**Then** 3×3 自适应卷积矩阵实时运行在 GPU 光栅化阶段，演员瞳孔、发丝与字幕边缘锐度显著增强，且平坦区域无高噪点溢出。
  3. **Given** 用户退出播放器或切换路由，**When** 页面销毁，**Then** 自动重置滤镜并释放对应 GPU 渲染管线。

---

### User Story 2 - Stats for Nerds 真实流规格监控看板 (Priority: P1)
用户可在播放器按快捷键 `I` 或长按画质按钮呼出流媒体真实监控看板，实时掌握当前影片的硬核底层流数据。看板采用 1000ms 定时器节流刷新，关闭时强制销毁定时器。
- **验收标准 (Acceptance Criteria)**:
  1. **Given** 正在播放任意影片，**When** 用户按下键盘 `I` 键，**Then** 播放器右上方展开半透明磨砂「Stats for Nerds · 实时流规格看板」，启动 1000ms 采样定时器。
  2. **Given** 看板展开，**When** 观察显示项，**Then** 准确展示以下 6 项真实指标：真实分辨率（`videoWidth × videoHeight`）、真实探测码率（kbps）、编码格式（如 `H.264 / AVC`）、掉帧统计（`droppedFrames`）、当前缓冲深度（秒）、CAS 增强状态，数据绝无虚报。
  3. **Given** 看板处于显示状态，**When** 用户按 `Esc` 键、`I` 键或点击右上角关闭按钮，**Then** 看板平滑淡出，并立即 `clearInterval` 销毁采样定时器，杜绝后台 CPU 浪费。

---

### User Story 3 - 清除虚假宣传与真实码率物理降序调度 (Priority: P2)
彻底清理源配置中的虚夸描述，全网探活时以底层探测的真实有效码率（kbps）对线路执行物理排序。
- **验收标准 (Acceptance Criteria)**:
  1. **Given** `data/sources.json`，**When** 检查内置源备注与描述，**Then** 移除所有未经验证的“2100kbps+”等宣传性词汇，恢复为客观规范的技术描述。
  2. **Given** 同一影片存在多条可用线路（包含不同真实 kbps），**When** 调度器执行 `sortLinesByRealBitrate(lines)`，**Then** 真实探测有效码率最高的线路自动物理排序在首位供用户秒播。

---

### User Story 4 - 私有 NAS / WebDAV 协议存储扩展与连接校验 (Priority: P2)
在设置中心提供「私有影库挂载 (WebDAV)」配置面板，支持标准 WebDAV 协议连接与连通性健康校验。
- **验收标准 (Acceptance Criteria)**:
  1. **Given** 用户进入设置页，**When** 滚动至「私有影库挂载 (WebDAV)」，**Then** 页面展示标准 WebDAV 服务器配置项（服务器地址、端口、用户名、密码与路径前缀）。
  2. **Given** 用户输入 WebDAV 服务器配置并点击「测试连接」，**When** 系统执行探测，**Then** 请求带有 3000ms 超时熔断保护，校验成功后安全持久化至本地存储，失败时给出明确原因（如鉴权失败或网络超时）。

---

## 3. 测试与验证策略 (Verification Strategy)
- 单元与集成测试：在 `test/test_user_fixes.js` 扩展 5 组针对性断言测试（验证 28 ~ 验证 32）；
- 质量门禁：执行 `npm test` 确保全部 32 项测试 100% 全绿通过；
- 构建分发：执行 `npm run pack` 生成 `影悦.app` 并更新本地 `/Applications/影悦.app`。
