# Implementation Plan: 端侧 GPU CAS 画质重塑引擎、真实流规格监控看板与 WebDAV 存储扩展 (008-gpu-clarity-engine)

**Branch**: `008-gpu-clarity-engine` | **Date**: 2026-11-08 | **Spec**: [spec.md](./spec.md)

---

## 1. 架构目标与设计原则 (Architecture Principles)
- **端侧硬件算力破局 (Hardware-Accelerated Clarity)**：突破公共采集站不可逆码率压缩的局限，利用本地 GPU 卷积着色器在渲染流水线中重构高频细节。出于低配硬件保护，**默认关闭**，按需开启。
- **100% 诚实无虚夸 (Honest Telemetry)**：通过 Stats for Nerds 真实看板，将真实分辨率、码率、编解码器与丢帧数据裸露，采样限制 1000ms 节流，面板关闭强制销毁定时器。
- **物理码率排序与私有协议扩展 (Bitrate Sorting & WebDAV Expansion)**：真实高码率线路置顶，开放标准 WebDAV 连接与 3000ms 超时连通性校验。

---

## 2. 模块改造与涉及文件 (Module Impact Analysis)

### 模块 A: 端侧 GPU CAS 着色器与滤镜管道 (`src/app.css` & `src/app.js`)
- 在播放器 `<div class="stage">` 挂载 SVG 卷积滤镜定义 `#cinemajoy-cas-sharpen`：
  - 核心卷积矩阵：`[0, -0.45, 0; -0.45, 2.80, -0.45; 0, -0.45, 0]`；
  - 像素格式锁定 `color-interpolation-filters="sRGB"`。
- 在 `src/app.css` 定义 `.cinema-clarity-enhanced` 样式：
  - `filter: url(#cinemajoy-cas-sharpen) contrast(1.08) brightness(1.02) saturate(1.05);`
  - `image-rendering: -webkit-optimize-contrast;`
- 在 `src/app.js` 播放器控制行增加 `btnCas` 胶囊按钮（出厂默认关闭，快捷键 `C` 随时开关）：
  - 切换时显示极速 Toast 提示与当前锐化档位。

### 模块 B: Stats for Nerds 真实流规格监控看板 (`src/app.js` & `src/app.css`)
- 在 `src/app.js` 实现 `toggleStatsForNerds(show)`：
  - 容器采用 `.stats-for-nerds-panel`（高反差单色等宽字体 ui-monospace）；
  - 采集 6 大真实指标（1000ms 节流刷新）：
    1. 分辨率：`${video.videoWidth} × ${video.videoHeight}`
    2. 真实码率：`${probe.kbps || 0} kbps (${probe.label || '测量中'})`
    3. 编解码器：`${probe.codec || 'H.264 / AVC'}`
    4. 音频声道：`${probe.channels || 2}ch / ${probe.audioCodec || 'AAC'}`
    5. 缓冲健康度：`${(bufferEnd - curTime).toFixed(1)} 秒`
    6. 丢帧数：`${videoQuality.droppedVideoFrames || 0} 帧`
  - 绑定键盘快捷键 `I`；关闭看板或销毁播放器时执行 `clearInterval`。

### 模块 C: 真实有效码率物理降序调度 (`lib/quality.js` & `src/app.js`)
- 实现纯函数 `sortLinesByRealBitrate(lines)`：
  - 提取各线路绑定的真实探针码率 `kbps`，执行严格降序排序 `b.kbps - a.kbps`；
  - 确保高码率原画线路始终置顶排在第一位。
- 清理 `data/sources.json` 中各源的 note，移除所有虚夸宣传词，改为标准客观的技术描述（如“综合影视库 · 直连免VPN”）。

### 模块 D: 私有影库 WebDAV 挂载配置与连通性校验 (`src/app.js`)
- 在 `renderSettings` 增加「私有影库挂载 (WebDAV)」面板：
  - 支持配置 WebDAV URL、端口、账号、密码及主目录；
  - 连接测试带有 3000ms 超时熔断保护，通过后持久化至本地 store。

---

## 3. 测试断言契约与验证定义 (Test Assertions Specification)

在 `test/test_user_fixes.js` 扩展 5 组确定性断言（验证 28 ~ 验证 32）：
1. **验证 28: CAS 硬件自适应锐化卷积矩阵与滤镜默认关闭门禁**：
   - 断言 `src/app.js` 包含 `cinemajoy-cas-sharpen` 与 `feConvolveMatrix` 定义；
   - 断言 `src/app.css` 包含 `.cinema-clarity-enhanced` 滤镜通道与 `-webkit-optimize-contrast`；
   - 断言 CAS 超清滤镜默认状态为 `false`（默认关闭）。
2. **验证 29: Stats for Nerds 真实流监控看板、1000ms 节流与定时器销毁**：
   - 断言 `src/app.js` 包含 `stats-for-nerds-panel`、分辨率、码率、丢帧率与缓冲区深度数据绑定；
   - 断言包含 1000ms 刷新节流与 `clearInterval` 定时器安全销毁逻辑；
   - 断言快捷键映射表完整支持 `I` 键唤起监控看板与 `C` 键切换超清重塑。
3. **验证 30: sortLinesByRealBitrate 真实有效码率物理降序调度**：
   - 输入线路数组：`[{name: '低码源', kbps: 600}, {name: '原画源', kbps: 3800}, {name: '普通源', kbps: 1500}]`；
   - 执行 `qualityMod.sortLinesByRealBitrate(lines)`，断言返回数组首项为 `原画源 (3800kbps)`，末项为 `低码源 (600kbps)`。
4. **验证 31: 出厂源配置描述纯净化与零虚假宣传**：
   - 读取 `data/sources.json`，断言没有任何条目包含“2100kbps+”等虚夸宣传词汇。
5. **验证 32: 私有影库 WebDAV 挂载配置模型与 3000ms 超时熔断**：
   - 验证 WebDAV 配置模型合法性校验与 3000ms 超时保护参数存在。
