# 影悦 (CinemaJoy) 安全策略与网络自治规范

## 1. 支持版本 (Supported Versions)

| 版本 (Version) | 支持状态 (Supported) |
| :--- | :--- |
| 2.4.x | :white_check_mark: 当前主线推荐版本 |
| < 2.4.0 | :x: 历史预览版，不提供安全补丁 |

## 2. 网络合规与安全防污染机制 (Network Autonomy & Security)

本项目严格贯彻安全防污染与纯净网络自治规范：
- **无依赖安全 DNS 调度**：内置国内权威 DoH (RFC 8484) / HTTP-DNS 探针与 Clean IP 校验，隔离运营商拦截与恶意 DNS 劫持。
- **域名白名单自动化门禁**：通过 `scripts/audit-domains.js` 在构建与测试时对全工程进行静态与动态域名审计，杜绝任何未经报备的境外非合规网络请求。
- **严禁数据窃取与遥测**：本项目代码无任何隐藏数据回传、用户隐私收集或商业埋点代码，遵循透明纯净开源原则。

## 3. 报告安全漏洞 (Reporting a Vulnerability)

如果您发现可能影响用户设备安全或网络自治规范的漏洞，请勿公开提交 Issue。请通过安全邮箱与团队联系：
- 安全对接邮箱：`security@cinemajoy.app` (或在 GitHub 仓库通过私密安全建议 Private Vulnerability Reporting 提交)
- 我们将在 48 小时内确认漏洞，并在核准后于 5 个工作日内发布修复补丁。

