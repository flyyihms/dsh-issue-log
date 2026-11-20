# dsh-approval-notify

DSH bundle：窗口不在前台时，用 **Windows 通知**提醒你，并在任务栏图标上显示**待处理数量角标**。

## 触发时机

| 事件 | 通知 |
|---|---|
| 审批请求（`approval/request`） | 「DSH 需要你确认」+ 工具名与摘要 |
| 会话空闲（`api-session/status` running=false） | 「DSH 任务已结束」 |

只在窗口**不在前台**时触发；任务栏角标累计待处理数，**开始新一轮交互**（`api-session/status` running=true）时清零——相当于"未读"，聚焦窗口不会清掉它。

## 实现位置

DSH 的宿主进程是 Electron-as-node，拿不到 `electron` 模块（`require('electron')` 直接报找不到），所以通知必须在**渲染层**发：

- `lib/client.js`：渲染层插件，`ctx.remote.$on(...)` 订阅上面两个事件，用浏览器 `Notification` 弹窗、`navigator.setAppBadge` 设角标
- `lib/index.js`：宿主侧插件，只做诊断日志（保留是因为宿主事件也能观察到，便于对照）

### 前台/后台判断

单个信号在 Electron 里都不可靠，所以用三个冗余信号，**任一**指向"不在前台"就通知：

```js
!document.hasFocus() || document.visibilityState === "hidden" || !windowActive
```

实测数据（同一台机器）：

| 状态 | `hasFocus()` | `visibilityState` | blur/focus 监听 |
|---|---|---|---|
| 前台 | `true` | `visible` | `true` |
| 后台 | `false` | `hidden` | `false` |

## 已知限制

- **通知约 5 秒后自动收进通知中心**：浏览器 `Notification` 在 Windows 上做不到"必须手动关闭"。要常驻需要用 WinRT 的 `reminder` 场景 toast，得从主进程或外部进程发。
- **依赖 AppUserModelID**：没有 AUMID / 对应快捷方式的 Win32 应用，`new Notification()` 能创建成功但系统会静默丢弃。本机 DSH 能正常显示，说明 AUMID 已就位；换机器如果收不到，先查这一项。
- 角标用的是 `navigator.setAppBadge`，Chromium 若不支持则静默跳过。

## 安装

```powershell
dsh plugin --profile desktop add link:<本目录绝对路径>
```

用 `link:` 而不是 `file:`：改代码后重启即生效，不用重装（本包无依赖，`link:` 安全）。

安装后重启 DSH。

## 配置

`cordis.patch.yml`：

| 字段 | 默认 | 说明 |
|---|---|---|
| `notifyApproval` | `true` | 审批请求时通知 |
| `notifyIdle` | `true` | 会话空闲时通知 |
| `notifyOnFocusedWindow` | `false` | 前台也通知（默认只在后台） |
| `badge` | `true` | 任务栏数字角标 |

## 卸载

```powershell
dsh plugin --profile desktop remove dsh-approval-notify
```

## 边界

- 通知失败静默跳过，不影响审批链路；审批处理器永远 `return next()`
- 只在桌面端有效，纯 CLI 场景不会触发
