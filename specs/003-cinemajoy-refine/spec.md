# Feature Specification: 影悦纯净体验与高光短视频分享 (003-cinemajoy-refine)

**Feature Branch**: `003-cinemajoy-refine`
**Created**: 2026-11-05
**Status**: Ready for Implementation
**Input**: 用户针对应用图标更新、彻底剔除鸡肋 AI 伴影侧栏、清除所有技术黑话展示、增加带品牌 Logo 与评论的短视频高光截取与社交分享、增加 Web Audio 影院级音效与对白增强、强化播放器安全防护的综合诉求。

---

## 1. User Scenarios & Testing

### User Story 1 - 桌面与系统图标完全换新「影悦」品牌 (Priority: P1)
- **User Journey**: 用户在 macOS Dock 栏、应用程序目录或启动台查看应用图标时，不再出现任何旧版「看看鸭」字符与配色，看到的是质感深邃、现代发光徽标的「影悦 · CinemaJoy」高清视效图标。
- **Why this priority**: 核心视觉识别第一印象，直接解决用户截图 1 中红框圈出的未替换遗留问题。
- **Independent Test**: 运行 `./scripts/make-icon.sh`，验证生成了新的 `assets/icon-1024.png` 与 `assets/AppIcon.icns`，图标中仅含「影悦」品牌标识。

### User Story 2 - 彻底清除 AI 伴影抽屉与所有技术黑话 (Priority: P1)
- **User Journey**: 用户观影时不被无价值的 AI 伴影抽屉遮挡视线，在选集区与顶栏不会再看到 `ffm3u8`、`feifan (需解析)`、`AVFoundation 硬件加速` 等令非技术人员困惑的代码名词；后台自动静默过滤无效网页解析源，并将可用线路规整显示为用户友好的「默认专线」、「备用专线 1」。
- **Why this priority**: 消除用户截图 2、3、4、5 中反馈的核心困扰，还用户沉浸纯净的观影空间。
- **Acceptance Scenarios**:
  - 播放器底栏无 `btnAiCompanion` 按钮，按 `A` 键不会弹出不可关闭的抽屉。
  - 侧栏底部移除 `● AVFoundation 硬件加速` 标签。
  - 选集标签栏与顶栏副标题彻底告别 `ffm3u8`，以清晰的影片类型/年份与「默认专线」友好呈现。

### User Story 3 - 高光短视频截取、评论与带 Logo 社交媒体分享 (Priority: P2)
- **User Journey**: 用户在观影遇到精彩名场面时，点击播放器底栏「✂️ 高光分享」按钮，应用自动捕获一段 5-15 秒精彩视频片段或高分辨率名场面画卷，用户可快速输入或选择打卡评语，一键合成带有「影悦 · CinemaJoy」官方品牌水印的短视频/动图/图片，保存至本地或直接复制至剪贴板一键发微博、小红书、朋友圈。
- **Why this priority**: 极大增强用户互动参与感与产品社交裂变能力，实现高价值低门槛的操作闭环。
- **Independent Test**: 点击「✂️ 截取分享」，预览弹窗可播放带水印高光片段并输入评论，保存短视频或一键复制分享文案/图片到剪贴板。

### User Story 4 - Web Audio 影院级人声对白增强与夜间降噪 (Priority: P2)
- **User Journey**: 用户在观看低音轰头、人声含混的动作大片或深夜看剧时，一键开启「清晰对白」或「影院环绕」音效，无需外置专业播放器即可获得清晰的人声表现与身临其境的听觉享受。
- **Independent Test**: 切换音效模式为「人声增强」或「影院重低音」，Web Audio 滤波器即时生效，音量峰值平衡稳定。

### User Story 5 - 播放器 IPC 通信安全防护加固 (Priority: P3)
- **User Journey**: 系统在后台严格校验所有本地 IPC 参数与路径，拦截目录穿越，限制外部 URL 打开，增强 CSP 防护，保障播放与文件操作安全。

---

## 2. Requirements

- **FR-001**: 重新设计 `assets/icon.html`，以「影悦」品牌视觉取代「看看鸭」，并重新生成 `icon-1024.png` 和 `AppIcon.icns`。
- **FR-002**: 彻底移除 `src/app.js` 中的 `openAiCompanionPanel`、`#aiCompanionDrawer`、`#btnAiCompanion` 及对应 CSS。
- **FR-003**: 建立统一的线路名称友好过滤器 `formatLineName(raw, index)`，将 `ffm3u8/lzm3u8/1080zyk` 等映射为「极速专线」「备用专线 N」，并自动过滤不可直接播放的 `需解析` 线路。
- **FR-004**: 移除顶栏与侧栏技术性标签 `AVFoundation 硬件加速` 及播放器副标题中的 `ffm3u8 · 秒开缓冲` 等技术黑话。
- **FR-005**: 新增 `Highlight Clipper` 模块，支持高光片段录制、品牌水印、评论合成、短视频保存与剪贴板分享。
- **FR-006**: 新增 Web Audio `AudioEnhancer` 引擎，提供「原音」「清晰人声」「影院重低音」「纯净夜间」4 档模式。
- **FR-007**: 加固 `main.js` IPC 接口安全校验（URL 白名单、路径规范化、防止路径遍历）。

---

## 3. Success Criteria
- **SC-001**: `npm test` 全部自动化测试（包含新增测试用例）100% 绿色通过。
- **SC-002**: 图标文件中无任何「看看鸭」字符，生成合法 1024x1024 PNG 与 ICNS。
- **SC-003**: 界面中零不可直解 technical jargon 干扰，操作路径小于 2 步。
