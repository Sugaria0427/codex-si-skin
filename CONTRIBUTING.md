# 参与开发

项目使用 Node.js ES modules、浏览器原生 JavaScript、Windows PowerShell 5.1 和 .NET Framework C#，没有 npm 运行依赖。`README.md` 提供完整的测试和构建命令；自动化流程定义在 `.github/workflows/ci.yml`。

## 代码边界

| 位置 | 职责 |
| --- | --- |
| `src/launcher-core.mjs`、`launch-skin.mjs` | 启动决策、进程身份、后台就绪握手 |
| `src/launcher-windows.ps1`、`codex-skin-launcher.cs` | Windows 包发现、进程命令行、GUI 入口 |
| `src/skin-service.mjs`、`cdp-client.mjs` | 验证连接、绑定请求、注入与重连 |
| `src/settings-model.mjs`、`settings-store.mjs`、`theme-zip.mjs` | 参数校验、本地草稿与主题、受限主题归档 |
| `src/skin-runtime.js`、`settings-ui.js` | 样式选择器、帧合并预览、原生设置页组件 |
| `themes/`、`vendor/` | 可分发主题与上游校验模块 |

保留当前“主题 → 背景 → 界面”设置组织。组件修改必须同时验证作用范围和互相独立性：右侧面板的参数只影响右侧面板，中间设置卡片的参数只影响中间卡片。

## 提交修改

请说明触发条件、用户能看到的变化、验证结果和影响版本。启动和储存变更应补充真实失败条件的回归用例。样式变更应提供使用合成内容的截图，隐藏个人聊天与路径。

PowerShell 文件含中文，按 UTF-8 BOM 保存以兼容系统 PowerShell 5.1。打包脚本会明确携带所需文件；添加新运行模块时同步 `scripts/release-files.mjs` 的清单。

## 发布准备

更新 `package.json` 与 `package-lock.json` 的版本、`CHANGELOG.md`，执行所有验证后审查三个公开 ZIP 和 SHA-256 清单。构建会把单一版本写入发行用运行时。编译后的 Windows 启动器未使用商业签名，用户可从公开源码自行构建。

`npm run audit:release` 检查运行数据、机器路径、凭据模式、图片范围、归档文件清单及散列。内置背景按维护者明确要求收录，作者及公开分发许可未核实；必须保留其资产说明、MIT 排除条款及联系删除声明。新增其他图片仍需核实来源与许可并更新审计清单。测试通过及本地打包本身均不会发布到 GitHub。
