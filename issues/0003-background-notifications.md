# 0003 · 后台提醒：Windows 通知 + 任务栏数字角标

| 项 | 内容 |
|---|---|
| 现象分类 | 桌面集成 / UI |
| 平台 | Windows 11 x64 |
| DSH | 0.2.1-rc.3（Electron 44） |
| 严重程度 | 低（体验问题）：审批/完成提示只在窗口内可见 |
| 状态 | 已实现：本地插件，随 profile 走，不受升级影响 |
| 关键词 | Notification、setAppBadge、AUMID、Electron-as-node、client module、焦点判断 |

## 需求

DSH 的审批弹框、完成提示都渲染在窗口内部。窗口不在前台时看不到，希望能像 ChatGPT / WPS 那样：

1. 需要你操作时，右下角弹系统通知
2. 任务栏图标上显示待处理数量的角标

"阻塞"的范围包括：审批请求、会话空闲（任务完成或等待回答）。

## 排查过程

### 第一步：确认能力是否存在

主进程包里搜到 `import { BrowserWindow, Notification, ... } from "electron"`，并用在"桌面更新完成"的提示上——说明系统通知能力本身是通的。

### 第二步：宿主插件行不通

按 DSH 的插件机制写了宿主侧插件，订阅 `approval/request` 和 `agent/status`。插件加载成功、事件也收到了，但什么都没弹。

在插件里打日志后拿到关键一行：

```
load: require('electron') threw Cannot find module 'electron'
load: process.type=n/a versions.electron=44.7.0
```

**宿主进程是 Electron-as-node**：`versions.electron` 有值，但 `process.type` 为空、`electron` 模块不可解析。也就是说宿主里根本没有 `Notification` / `BrowserWindow` API，宿主插件这条路走不通。

### 第三步：改到渲染层

DSH 的界面是网页，客户端插件通过 `window.__ModuleLoader__.load({ id, factory })` 注册，`package.json` 里用 `dsh.client` 声明，宿主启动时**动态扫描**这些声明来组装页面入口。

渲染层里能拿到和审批组件同源的事件：

```js
ctx.remote.$on("approval/request", (request, next) => { ... })
ctx.remote.$on("api-session/status", (sessionId, running) => { ... })
```

浏览器 `Notification` 和 `navigator.setAppBadge` 都能直接用。

### 第四步：焦点判断踩坑

第一版用 `document.hasFocus()` 判断前后台，结果**前台也弹**。

问题在于单个信号在 Electron 里不可靠（文档焦点、窗口焦点、可见性可能不一致）。于是把判断依据直接写进通知正文做对照：

| 状态 | `document.hasFocus()` | `visibilityState` | `blur/focus` 监听 |
|---|---|---|---|
| 前台 | `true` | `visible` | `true` |
| 后台 | `false` | `hidden` | `false` |

三个信号都干净地翻转，于是改成 **任一**指向"不在前台"就通知：

```js
!document.hasFocus() || document.visibilityState === "hidden" || !windowActive
```

### 第五步：角标的语义

`navigator.setAppBadge(n)` 可用，但第一版写的是"窗口获得焦点就清零"——结果切回窗口的瞬间角标就没了，等于永远看不到。

改成**未读语义**：

- 后台触发时 +1
- 聚焦窗口**不清零**（只补应用一次，防止后台设置被系统丢弃）
- 用户**开始新一轮交互**（`running === true`）时清零

## 实现

插件包 `plugins/dsh-approval-notify/`：

| 文件 | 作用 |
|---|---|
| `package.json` | `main` + `./client` 导出，`dsh.client` 声明 |
| `lib/client.js` | 渲染层：订阅事件、弹通知、设角标、判断前后台 |
| `lib/index.js` | 宿主侧：只打一行日志（能力不在这里） |
| `cordis.patch.yml` | 注册宿主行 |
| `README.md` | 安装、配置、限制 |

安装（用 `link:`，改代码重启即生效）：

```powershell
dsh plugin --profile desktop add link:<本目录绝对路径>
```

## 验证

| 检查 | 结果 |
|---|---|
| 窗口在前台，会话空闲 | ✅ 不弹 |
| 窗口在后台，会话空闲 | ✅ 弹「DSH 任务已结束」 |
| 后台触发后任务栏 | ✅ 红色角标 `1` |
| 切回窗口但不发消息 | ✅ 角标保留 |
| 发出下一条消息 | ✅ 角标清零 |

## 已知限制

- **通知约 5 秒后自动收进通知中心**：浏览器 `Notification` 在 Windows 上做不到"必须手动关闭"。要常驻得用 WinRT 的 `reminder` 场景，从主进程或外部进程发。
- **依赖 AppUserModelID**：没有 AUMID / 对应快捷方式的 Win32 应用，`new Notification()` 能创建成功但系统会静默丢弃。本机 DSH 可以正常显示；换机器收不到时先查这一项。
- 角标依赖 `navigator.setAppBadge`，Chromium 不支持时静默跳过。

## 教训

1. **先确认代码跑在哪个进程里**：`require('electron')` 返回对象、返回路径字符串、还是直接抛错，对应三种完全不同的运行上下文
2. 无法直接观测内部状态时，**把诊断写进用户看得见的地方**（通知正文），比翻日志快得多
3. UI 语义要想清楚：角标是"未读"还是"当前状态"？清零点选错，功能等于没做
4. 前后台判断这类信号，**多路冗余**比赌单一 API 可靠
