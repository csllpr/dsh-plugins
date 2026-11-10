# DeepSeek 用量与余额（peak/off-peak）

DSH Web UI 插件：显示 DeepSeek API **余额**、**本地估算的 Token 用量与费用**，并检测和显示当前处于
**峰时 / 谷时**（DeepSeek V4 系列 2026-08-17 起的分时计价）。

- 插件包名：`@local/dsh-deepseek-usage`
- 组合入口（bundle patch）：`deepseek-usage`
- 依赖：无（Host 半只用 Node 内置能力与 DSH 可选服务；Client 半只 `require('react')`）

## 两个显示位置

1. **输入框下方的环境条**（`conversation.composer.dock`）——常驻紧凑胶囊：
   `余额 ¥110.00 · 谷时 · 今 ≈¥0.42 · 会话 ≈¥0.12`（示意）。
   点击弹出浮窗明细（点击外部或 Esc 关闭）：余额构成、今日/本会话 Token 与估算费用、缓存命中率、峰谷状态与倒计时、
   价格表、刷新按钮、平台用量/充值链接。
2. **设置 → DeepSeek 用量与余额**（`settings.section`）——完整信息页：余额卡片、峰谷时段与下一次切换、
   今日用量、价格表、平台链接和说明。

## 数据来源

| 数据 | 来源 | 性质 |
|---|---|---|
| 余额 | 优先 DSH `deepseekAccount` 服务（已登录 DeepSeek 账号时）；否则用 Open Platform API Key 调 `GET https://api.deepseek.com/user/balance` | **官方**，原样展示（金额为十进制字符串） |
| 今日 / 本会话 Token | 本机会话日志（`ctx.sessionQuery` 读取 `assistant/message` / `assistant/attempt` 中的 provider `usage`），跳过 fork 继承事件避免重复计费 | 精确到日志中的每次模型调用 |
| 费用 | 按上面 Token × 峰谷价格表估算；每条调用按事件发生时刻判断峰/谷 | **本地估算**，不是账单 |
| 峰谷状态 | 官方规则：北京时间周一至周五 09:00–12:00、14:00–18:00 为峰时（双倍价），其余时段、周末、中国法定节假日全天为谷时（半价） | 规则内置 2026–2027 节假日表，可配置 |

DeepSeek 官方**没有**公开的用量历史 REST API（只有 `/user/balance` 与平台页面 CSV 导出），
所以"用量/费用"是本插件根据本机会话日志计算的估算值；余额是官方值。

## 安装与启用

```bash
# 在本仓库根目录执行；DSH 插件管理器会安装到当前 profile（web）
# plugin_manager install_bundle target = 本目录下 plugins/deepseek-usage 的绝对路径
```

安装后 bundle 会插入 `deepseek-usage` 行；如未自动启用，在 设置 → 插件 中启用并刷新页面。
更新代码后需重启 DSH 进程（Host 半）并刷新页面（Client 半）。

## 配置（`cordis.patch.yml`，全部可选）

```yaml
- id: deepseek-usage
  config:
    apiKeyEnv: DEEPSEEK_API_KEY       # 余额 API Key 的 credential 引用（回退 DEEPSEEK_BALANCE_API_KEY）
    baseURL: https://api.deepseek.com
    balanceRefreshMs: 300000          # 余额缓存 TTL；失败后按 30s→5min 退避
    usageRefreshMs: 60000             # 今日用量缓存 TTL
    requestTimeoutMs: 15000
    maxSessions: 200                  # 今日用量最多读取的会话数
    accountFirst: true                # 已登录 DeepSeek 账号时优先用账号余额
    allowedHosts: []                  # 备用路由额外允许的 Host（默认仅回环地址与服务器 origin）
    replaceHolidays: false            # true = 用 schedule.holidays 替换内置 2026–2027 节假日表
    pricing:                          # 单位：currency 每 unitTokens（1M）的“峰时”价格
      currency: CNY
      unitTokens: 1000000
      fallbackModel: deepseek-flash
      models:
        deepseek-flash:  { name: DeepSeek-V4.1-Flash, cacheHit: 0.04, cacheMiss: 2, output: 8 }
        deepseek-v4-pro: { name: DeepSeek-V4-Pro,     cacheHit: 0.30, cacheMiss: 9, output: 27 }
      aliases:
        deepseek-v4-flash: deepseek-flash
    schedule:
      timezone: Asia/Shanghai
      utcOffsetMinutes: 480
      peakWindows: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }]
      weekdaysOnly: true
      holidays: []                    # 追加节假日（YYYY-MM-DD；默认内置 2026–2027，replaceHolidays:true 才替换）
      offPeakMultiplier: 0.5
    links:
      usageUrl: https://platform.deepseek.com/usage
      topUpUrl: https://platform.deepseek.com/top_up
```

价格表来源：官方定价页（2026-11-09 抓取；V4.1-Flash 价格自 2026-09-10 生效）。DeepSeek 保留调价权利，
调价后改上面的 `pricing` 即可，无需改代码。

## 安全设计

- **不把 API Key 写入配置或页面**：Key 只在 Host 进程内通过 `ctx.credentials.resolve` 每次使用时解析，
  仅发往 `https://api.deepseek.com`；Client 半永远拿不到 Key。
- 状态接口只读、同源 JSON：首选走 Connection 的**认证**通道 `GET /api/dsh-plugin-deepseek-usage/state`
  （浏览器会话认证，匿名请求到不了处理函数）；备用 `GET /dsh-plugin/deepseek-usage/state` 仅绑定回环
  地址并校验 Host/Sec-Fetch-Site，拒绝 DNS rebinding 页面读取余额；`Cache-Control: no-store`。
- `baseURL` 默认只指向 `https://api.deepseek.com`；如需改成代理地址，请只填写你信任的代理（配置层
  被视为可信输入，插件不会把 Key 发往其他主机，除非你自己在配置里改了 `baseURL`）。
- 不给页面注入任何脚本/HTML；Session 日志只读，不写日志、不新增事件类型。
- 未从网络复制代码：只借鉴了公开 MIT 项目的**思路**（开发时做过只读安全审查），
  实现全部为本仓库原创。

## 已知限制

- 费用为估算：以下单价格计算，不含 Search/Fetch 的按次计费（¥5/千次），也不含赠送金/代金券规则。
- "今日用量"统计**今天新建的会话 + 当前仍存活的会话**，不扫描历史归档会话；跨天续聊的旧会话可能少计。
- 法定节假日表内置到 2027 年；之后需在 `schedule.holidays` 配置追加。
- 周末调休上班日按官方"周末全天谷时"规则处理（不按峰时）。
- 设置页不显示"本会话"用量（设置面板没有会话上下文），会话用量请看输入框下方的胶囊。

## License

[MIT](../../LICENSE) © 2026 Ledu Wang.
