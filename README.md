# DSH plugins

本目录是个人/本地 DSH（DeepSeek Harness）插件工作区。每个插件是一个独立的、可直接安装的
[DSH bundle 包](https://github.com/deepseek-ai/deepseek-harness)：`package.json` 声明
`dsh.bundle.patch`，`cordis.patch.yml` 插入插件行，Host 半为 ESM 模块，Web Client 半为
`window.__ModuleLoader__` 普通 JS 模块。

## 插件列表

| 插件 | 目录 | 说明 |
|---|---|---|
| DeepSeek 用量与余额 | [`plugins/deepseek-usage/`](plugins/deepseek-usage/README.md) | 输入框下方常驻显示 API 余额、今日/本会话 Token 用量与估算费用、峰谷计费状态与倒计时；设置页含价格表与平台链接。 |

## 安装 / 更新

1. 安装（在 DSH 会话中调用插件管理器，`target` 传插件包的**绝对路径**）：
   `plugin_manager({ action: 'install_bundle', target: '/path/to/dsh-plugins/plugins/<name>' })`
2. 安装结果里 `application: applied` 表示组合已生效；如显示 `restart-required`，重启 DSH 进程。
3. 启用：设置 → 插件 → 列表中找到对应行并启用；刷新 Web 页面加载 Client 半。
4. 更新代码后：Host 半改动需重启 DSH 进程；Client 半改动刷新页面即可（或依赖 HMR 重建）。

> 本工作区不写 profile 的 `package.json` / `cordis.patch.yml`，也不在 profile 目录里跑包管理器：
> 安装由 `plugin_manager install_bundle` 完成；插件自身配置通过 `cordis.patch.yml` 的
> `- id: <row>` 覆盖层修改。

## 结构与约定

```
plugins/<name>/
  package.json        # dsh.bundle.patch + dsh.client（Web 半）+ exports/files
  cordis.patch.yml    # - insert: [{ id, name: '@local/...' }]
  index.js            # Host 半：apply(ctx, config)；只用内置能力，不引第三方依赖
  client.js           # Web 半：window.__ModuleLoader__.load({ id, factory })；仅 require('react')
  locale/*.json       # 插件管理器展示用 meta.title/meta.description
  icon.svg            # 原创图标（SVG，<256KiB）
  README.md           # 功能、配置、数据来源、安全与限制
```

- **零第三方依赖**：Host 半通过 `ctx.get()` / `ctx.inject()` 使用 DSH 可选服务；
  Client 半从浏览器模块表取 React，不 import DSH 内部包（升级不脆）。
- **不复制网络代码**：只借鉴公开项目的接口/产品思路；任何下载代码必须逐行审查、
  记录许可证与安全结论后才可参考，绝不 `curl | sh`、`npm postinstall` 或执行未知脚本。
- **不把密钥放进配置**：密钥一律走 DSH credentials（`$DSH_HOME/.credentials.yaml` /
  启动环境），插件配置只保存引用名。
- **最小网络面**：每个插件的 README 必须列出它会访问的域名与端点；默认只访问对应官方 API。
- **本地估算要标注**：凡不是官方返回的数字（如费用估算）UI 上必须标"估算/estimate"。

## 开发与验证

- 语法检查：`node --check plugins/<name>/index.js`、`node --check plugins/<name>/client.js`；
  `node -e "JSON.parse(require('fs').readFileSync('plugins/<name>/package.json'))"`。
- Host 半可在不安装的情况下用假 Cordis 上下文单测（开发辅助脚本与调研/验证笔记属于
  本地工作草稿，不随仓库分发）。
- 安装后用 `cordis_inspect_query` 确认插件行、Client 模块与 Slot 注册；页面刷新后检查控制台无
  `slot entry crashed`，并在浅色/深色主题、中文/英文下检查显示。

## License

[MIT](LICENSE) © 2026 Ledu Wang. 各插件包在 `package.json` 中声明同一许可证；如需用于商业项目，请保留版权与许可声明。
