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

会话状态可以直接订阅：

```js
ctx.remote.$on("api-session/status", (sessionId, running) => { ... })
```

浏览器 `Notification` 和 `navigator.setAppBadge` 都能直接用。

### 第三步半：审批事件接不到，改用 DOM 观察

一开始审批也是订阅 `ctx.remote.$on("approval/request", ...)`，但**实测收不到**：这个事件是 waterfall，审批组件自己接住并接管了这次请求，后注册的监听器拿不到（它没有把链传下去）。

改用观察界面：审批面板挂载时带 `data-approval-key` 属性，用 `MutationObserver` 盯它出现和消失，完全不依赖事件顺序：

```js
const observer = new MutationObserver(checkAll);
observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: [attrs] });
```

顺带解决"通知什么时候关"：面板消失 = 已处理 = 关掉对应通知。

同一个套路覆盖了所有"阻塞等你操作"的界面——它们各自挂载时都带一个稳定属性：

| 阻塞类型 | 挂载属性 | 通知标题 |
|---|---|---|
| 审批请求 | `data-approval-key` | DSH 需要你确认 |
| 待回答问题 | `data-question-key` | DSH 在等你回答 |
| 计划确认 | `data-plan-review-key` | DSH 等你确认计划 |

注意「待回答问题」这类阻塞**不会**让 `api-session/status` 变成 idle（回合还在进行），所以只靠会话状态是漏的，必须靠界面观察。

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

### 第六步：通知的生命周期

第一版只能手动点"关闭"，用起来反而更啰嗦（切窗口、批完、再回来关通知）。改成**通知跟着原因走**：

| 时机 | 动作 |
|---|---|
| 审批面板消失（批准/拒绝/自动通过） | 关闭对应通知 |
| 窗口获得焦点 | 关闭所有还开着的通知 |
| 开始新一轮交互 | 关闭所有通知并清零角标 |

实际使用中，因为审批必须聚焦窗口才能点，所以"聚焦即关"这条路径基本覆盖了审批场景；"面板消失即关"是兜底。

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
| 后台出现审批框 | ✅ 弹「DSH 需要你确认」+ 审批摘要 |
| 后台出现待回答问题 | ✅ 弹「DSH 在等你回答」+ 问题摘要 |
| 审批被处理 / 窗口获得焦点 | ✅ 通知自动关闭，无需手动点"关闭" |

## 已知限制

- **通知约 5 秒后自动收进通知中心**：浏览器 `Notification` 在 Windows 上做不到"常驻到手动关闭"。要常驻得用 WinRT 的 `reminder` 场景，从主进程或外部进程发。
- **通知上没有「允许 / 拒绝」按钮**：网页 Notification 在 Windows 上不支持动作按钮，要做必须走 WinRT toast + 协议激活 + 回填审批，工程量大，暂不做。
- **依赖 AppUserModelID**：没有 AUMID / 对应快捷方式的 Win32 应用，`new Notification()` 能创建成功但系统会静默丢弃。本机 DSH 可以正常显示；换机器收不到时先查这一项。
- 角标依赖 `navigator.setAppBadge`，Chromium 不支持时静默跳过。

## 教训

1. **先确认代码跑在哪个进程里**：`require('electron')` 返回对象、返回路径字符串、还是直接抛错，对应三种完全不同的运行上下文
2. 无法直接观测内部状态时，**把诊断写进用户看得见的地方**（通知正文），比翻日志快得多
3. UI 语义要想清楚：角标是"未读"还是"当前状态"？清零点选错，功能等于没做
4. 前后台判断这类信号，**多路冗余**比赌单一 API 可靠
5. 事件订阅不生效时，先怀疑**事件链被上游接管**（waterfall 不往下传），降级到观察界面状态往往更稳
6. 通知的生命周期应该绑定"原因消失"，而不是让用户手动关——否则功能反而增加操作
