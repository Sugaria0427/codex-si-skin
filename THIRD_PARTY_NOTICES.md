# Third-party notices

本项目基于 [Codex Dream Skin](https://github.com/Fei-Away/Codex-Dream-Skin) 的换肤思路和主题格式开发，向原作者及贡献者致谢。

上游版本：v1.5.21；基线提交：`6fc42df48a6a5365011f55cc349e20c038e56d1d`。

本项目内直接再分发的上游代码只有：

| 文件 | 用途 |
| --- | --- |
| `vendor/codex-dream-skin/assets/safe-css-validator.mjs` | 校验受限自定义 CSS |
| `vendor/codex-dream-skin/scripts/image-metadata.mjs` | 读取并校验图片尺寸 |

这两个文件按上游 MIT 许可证使用，完整版权及许可证见 [vendor/codex-dream-skin/LICENSE](vendor/codex-dream-skin/LICENSE)。精确内容散列见同目录 `provenance.json`。原仓库预设主题、插画、安装器和完整注入器均未收录。

`src/` 是在本地适配过程中形成的 Node 后台、CDP 启动器、样式运行时和设置界面。相对于上游，本项目增加了原生设置页集成、即时预览、各组件独立调节、主题快照与图片复用，以及不重启当前窗口的启动策略。

Codex、OpenAI 及其标志属于相应权利人。本项目是社区工具。发布包使用项目自己的图标；安装时可从用户本机安装的 Codex 提取图标用于本机快捷方式。Codex 程序、官方图标、Node.js 和用户的账户资料均不随本项目发布。

“祀-一池春水”的配色、透明度及模糊参数按本项目 MIT 许可证提供。随主题提供的 `background.jpg` 为《一池春水绿于苔》背景图，版权归原作者所有，作者和公开分发许可尚未核实；图片不适用 MIT 许可证。**如有侵权，请通过 [GitHub Issues](https://github.com/Sugaria0427/codex-si-skin/issues) 联系删除。** 完整声明随图片附在 [themes/si-yichi-chunshui/ASSETS.md](themes/si-yichi-chunshui/ASSETS.md) 中。
