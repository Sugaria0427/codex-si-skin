# 祀 · Codex Skin

<img src="assets/si-skin.svg" alt="祀 · Codex Skin" width="96" height="96">

让 Windows 版 Codex 使用自己的配色、背景和玻璃界面，并把全部参数保存为可切换的主题。默认主题为 **祀-一池春水**。

这是基于 [Codex Dream Skin](https://github.com/Fei-Away/Codex-Dream-Skin) 思路开发的社区工具。当前发行目标为 **Windows x64、Microsoft Store 官方 Codex、Node.js 22 及以上**；代码遵循 MIT 许可证。安装、启动和使用方式见下文，贡献规则及第三方许可证见文末。

[下载最新版本](https://github.com/Sugaria0427/codex-si-skin/releases/latest) · [报告问题](https://github.com/Sugaria0427/codex-si-skin/issues) · [自动测试](https://github.com/Sugaria0427/codex-si-skin/actions)

## 能做什么

- 在 Codex 原生“设置 → 外观”页中使用“外观增强”，分为主题、背景、界面三个区域。
- 调节全局或各组件的颜色、不透明度与高斯模糊。右侧对话面板与中间设置卡片分别设置，保存后按主题恢复。
- 替换 JPG、PNG、WebP 背景，调节背景不透明度、模糊、缩放、裁切位置；滑条和颜色修改实时预览。
- 保存、另存、切换、导入与导出主题；图片共享存储，调整参数时只保存小型 JSON。也支持受限自定义 CSS、字体、边框、圆角和阴影。
- 点击开始菜单“Codex（祀）”启动；复用已经通过同一入口打开的窗口。后台仅在对应 Codex 会话存在期间运行。

“祀-一池春水”内置当前绿色配色及分组件参数。**公共包暂不附背景图**：原图仍在确认作者及分发许可。安装后可在背景区域选择自己有权使用的图片，完整的主题功能照常可用。配色与模糊效果不依赖某张指定图片。

## 安装和使用

1. 安装 Microsoft Store 中的官方 Codex，以及 [Node.js LTS](https://nodejs.org/)（22 或更新版本）。
2. 从 [Releases](https://github.com/Sugaria0427/codex-si-skin/releases/latest) 下载名称以 `windows-x64.zip` 结尾的安装包，解压后双击 `Install.cmd`。安装器校验程序文件、初始化默认主题，并创建开始菜单“Codex（祀）”。安装过程结束后由你自行启动 Codex。
3. 点击“Codex（祀）”，进入“设置 → 外观 → 外观增强”调整。保存表示将当前参数存为命名主题；退出设置后继续使用当前预览参数。

**首次使用会创建独立的窗口资料目录，可能需要重新登录 Codex。** 安装器不复制已有的登录信息、浏览器资料或聊天数据。如果 Codex 正通过普通入口运行，启动器会提示你先自行退出。请在方便结束当前窗口时操作。

如果 Node.js 未加入系统路径，可以在 PowerShell 中指定：

```powershell
.\install.ps1 -NodePath 'D:\Tools\node\node.exe'
```

默认数据位置为 `%USERPROFILE%\.codex\codex-si-skin`，遵循已有 `CODEX_HOME`；可通过 `CODEX_SKIN_HOME` 或安装参数 `-DataRoot` 改为其他目录。快捷方式使用安装目录中的运行环境，与源码解压位置无关。

需要恢复原生外观时，在增强设置底部选择“恢复原生外观”。主题数据仍保存在本机，可随时重新启用。

## 启动原理与版本兼容

启动器查找当前用户安装的官方 Store 包，使用独立窗口资料目录和仅监听 `127.0.0.1` 的 CDP 调试端口启动 Codex。Node 后台验证浏览器身份后，把样式运行时及设置组件注入主界面页面，读取本地主题数据并持续连接新窗口。注入与界面确认自动重试；后台报告就绪后，启动器完成启动。启动器从不关闭、重启或刷新正在使用的 Codex。

本工具保存在 Codex 安装目录之外。Codex 更新后，启动器会重新发现官方包路径；界面样式依赖 Codex 内部 DOM，**界面结构变化时可能需要更新选择器**。目前沿用的人工验证基线是 Windows 官方 Codex `26.928.2636.0`。自动测试使用隔离浏览器和模拟 CDP，不替代后续版本的实机验证。

CDP 调试连接具有读取和控制该 Codex 界面的能力。端口只对本机开放；请保持本机账户及软件来源可信。工具没有遥测、远程服务或 API 密钥要求；后台正常换肤不访问外网。浏览器资料及日志也仅存于本机。

## 更新、保留资料与排错

更新前由你自行退出对应 Codex，等待换肤后台随之退出，再运行新版安装器并选择相同数据目录。安装器检测到后台运行时会停止安装并保留窗口；更新程序文件前备份旧 `v2`、`engine`、`bundled-themes`，保留已有主题、背景、当前草稿及窗口资料。

| 目录或文件 | 用途 |
| --- | --- |
| `v2/`、`engine/`、`bundled-themes/` | 程序、两个上游校验模块、内置主题 |
| `settings-v2.json`、`themes-v2/`、`images-v2/` | 当前草稿、命名主题、共享背景 |
| `cdp-profile/` | 该工具启动的 Codex 窗口资料，包括登录状态 |
| `service-v2.json`、`launcher-result.json`、`launcher-history.log` | 后台连接状态、启动结果与耗时记录 |
| `service-v2.log`、`service-v2-error.log`、`backups/` | 本地诊断及更新备份 |

若新版工具需要回退：先自行退出对应 Codex，再将最近安装备份中的三个程序目录复制回数据目录。恢复程序文件即可继续使用现有主题。停止使用本工具时可改用官方入口，并删除本工具创建的快捷方式；保留数据目录方便恢复。分享日志前请移除账户路径、窗口标识等本机信息。

已有早期本地版本的用户，可在完成资料备份后，以 `-DataRoot` 指定原来的换肤数据目录。已有 `settings-v2.json` 会优先读取；旧版 `active-theme` 格式也保留迁移入口。安装器绝不自动更换当前正在运行的实例。

## 从源码构建

此仓库没有第三方 npm 运行依赖。Windows 自带的 .NET Framework C# 编译器用于构建隐藏控制台的启动器。

```powershell
npm ci
npm test
npm run test:ui
npm run build
npm run audit:release
```

`test:ui` 自动发现 Edge / Chrome，也可用 `SKIN_TEST_BROWSER` 指定浏览器。它使用单独的临时资料目录；测试结束只关闭测试浏览器。安装测试为：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests\test-install.ps1
```

`dist/` 输出 Windows 安装包、完整源码 ZIP、可导入的主题 ZIP 和 `SHA256SUMS.txt`。发行文件采用明确的文件清单生成，`tmp/`、个人配置和浏览器资料不会进入包。CI 使用相同测试与构建命令；推送 tag 不自动发布 Release。

## 许可证与参与

代码与主题参数：MIT。上游署名、版本、所用文件与图片范围见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。提交修改前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，安全问题处理见 [SECURITY.md](SECURITY.md)。
