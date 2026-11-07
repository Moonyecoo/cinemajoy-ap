# Architecture & Implementation Plan: 影悦纯净体验与高光短视频分享 (003-cinemajoy-refine)

## 1. 架构设计与技术选型

### 1.1 品牌视觉图标体系 (App Icon)
- **输入**: `assets/icon.html`
- **设计规范**:
  - macOS 现代 Squircle 形状 (232px border-radius @ 1024x1024)。
  - 渐变背景：深邃曜石黑到深蓝微光 (`#0f172a` -> `#020617`)。
  - 核心图形：流光蓝紫渐变播放符 (`#38bdf8` -> `#6366f1` -> `#a855f7`)，内嵌纯白通透播放三角，附带精细柔和阴影。
  - 品牌字标：「影悦」高端现代字型，无「看看鸭」痕迹。
- **输出**: `assets/icon-1024.png` 和 `assets/AppIcon.icns`（通过 `./scripts/make-icon.sh`）。

### 1.2 界面去噪与零黑话架构 (De-Jargon Architecture)
- 线路别名重整：在 `src/app.js` 新增 `friendlyLineName(name, index)` 函数：
  - 匹配 `(需解析)|(解析)` 或 episodes 全为 page 的线路在 `detail.lines` 层面直接被静默过滤，不进入渲染队列。
  - 线路 0 自动命名为「极速专线」或保留有意义的「4K/国语」提示；后续线路命名为「备用专线 1」、「备用专线 2」。
- 移除顶栏与侧栏技术性标签：彻底清理 `src/index.html` 中的 `AVFoundation 硬件加速`，顶栏副标题仅保留自然影视属性（如 `国产剧 · 2026`）。
- 彻底剔除 `aiCompanionDrawer` 鸡肋侧栏及其打开按键与样式。

### 1.3 高光短视频截取与社交分享 (Highlight Clipper & Share)
- 基于 W3C 标准 `Canvas` + `MediaRecorder` / 帧缓冲抓取：
  - 在播放器控制栏新增 `#btnClipShare`（剪刀高光图标）。
  - 用户触发后暂停，弹出极简高光截取弹窗。
  - 画布尺寸自适应渲染，并在右上角绘制「影悦 · CinemaJoy」高清品牌标识，底端绘制高质感半透明台词/评论卡片。
  - 用户可自选预设高光标签（`🔥 名场面打卡`、`😭 泪目瞬间`、`✨ 演技封神`、`🎬 绝美镜头`）或自定义评论。
  - 提供 3 种分享方式：
    1. **保存短视频 (WebM/MP4)**：自动存入用户系统下载目录并调用系统通知。
    2. **复制海报截图**：直接通过剪贴板 API 写入系统剪贴板，即贴即发。
    3. **一键复制分享文案**：生成带剧名、台词、评语与影悦品牌的优雅社交口令。

### 1.4 Web Audio 增强器 (AudioEnhancer)
- 架构：`AudioContext` -> `MediaElementAudioSourceNode` -> `BiquadFilterNode` (Peaking / Shelf) -> `DynamicsCompressorNode` -> `audioCtx.destination`。
- 4 档预设：
  1. `off`：直通原音。
  2. `vocal`：清晰人声（1.8kHz-3.2kHz 增益 +5dB，低切 120Hz 以下轰鸣）。
  3. `bass`：影院重低音（70Hz 低架增益 +6dB，10kHz 高架增益 +3dB）。
  4. `night`：纯净夜间（强动态压缩，削峰填谷，抑制突发爆音）。
- 交互：播放器底栏增加音效快捷切换按键 `#btnAudioFx`，切换时弹出半透明 HUD 提示。

### 1.5 安全防护加固 (Security Hardening)
- `main.js` 中所有 IPC 接口做严格白名单与类型校验：
  - `media:open`：仅允许 `http:`, `https:` 协议，过滤 `file:`, `javascript:`。
  - `media:download` / `media:reveal`：路径必须位于用户数据或下载目录，过滤 `../` 等目录穿越攻击。
  - 强制 CSP 限制不可执行任意动态代码。

---

## 2. 变更文件清单
1. `assets/icon.html`: 重新绘制「影悦」品牌图标
2. `scripts/make-icon.sh`: 执行生成新图标
3. `src/index.html`: 移除 `AVFoundation 硬件加速`
4. `src/app.js`: 移除 AI 伴影抽屉，实现线路友好命名、高光剪辑分享模块、Web Audio 音效模块
5. `src/app.css`: 移除 AI 抽屉样式，加入高光分享与音效 HUD 现代微光质感样式
6. `main.js` & `preload.js`: 增加安全校验与剪辑保存导出通道
7. `test/test_user_fixes.js`: 更新验证 13 并增加验证 14 自动化测试

