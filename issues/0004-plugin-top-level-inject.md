# 0004 · 宿主插件顶层 `inject` 让 `apply` 永不执行

| 项 | 内容 |
|---|---|
| 现象分类 | 插件 / 生命周期 |
| 平台 | Windows 11 x64 |
| DSH | 0.2.1-rc.3 |
| 严重程度 | 中（插件静默失效，无报错） |
| 状态 | 规避方案（改用运行时注入） |
| 关键词 | cordis、inject、apply、webServer、插件不生效 |

## 症状

自己写的宿主插件（注册一条 HTTP 路由）装进 profile 并重启后：

- 路由返回 **404**
- 插件自身在启动时打了一行日志，说明**模块被 import 了**
- 但 `apply` 里的日志一行都没有

也就是说：模块加载了，插件体没跑，而且**整个过程没有任何报错**。

## 环境

- Windows 11 x64，DSH 0.2.1-rc.3
- 自有插件以 `link:` 方式装入 profile，`dsh.bundle.patch` 里 `insert` 一行
- 同一个 profile 里其它官方插件（open-in-app、sidebar-right 等）路由正常，说明 web 服务器与路由表本身可用

## 排查思路

分三层，每层只回答一个问题：

1. **服务在不在**：请求一个已知插件路由 → 返回 401（存在但需鉴权）而不是 404，说明路由机制正常。
2. **插件加载了没**：在模块顶层写文件日志 → 有记录，说明 import 成功。
3. **apply 跑了没**：在 `apply` 第一行写日志 → 没有，说明插件体被拦截。

第 3 层把范围压到了"cordis 没有激活这个插件"。

## 被排除的假设

| 假设 | 做法 | 结果 | 结论 |
|---|---|---|---|
| web 服务器不可用 | 请求官方插件路由 | 401 | 排除 |
| 插件路径/行名写错 | 对比官方 patch 行格式 | 一致 | 排除 |
| 路由注册参数写错 | 对照官方 `webServer.register` 调用 | 一致 | 待定（但根本没走到这一步） |
| 模块 import 失败 | 顶层写日志 | 有日志 | 排除 |

## 转折点

把插件声明从

```js
export const inject = ["webServer"];
export function apply(ctx) { … }
```

改成

```js
export function apply(ctx) {
  ctx.inject(["webServer"], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({ kind: "exact", path, handler }), "…");
  });
}
```

重启后 `apply called` 与 `webServer service available` 两个日志立即出现，路由返回 200。

## 根因

**已验证**：模块级导出的 `inject` 数组让 cordis 把插件挂进"等待依赖"状态，但它并没有把 `webServer` 识别为可满足的依赖，于是插件体永远不执行，且不报错。

**推测**：`inject` 的语义更接近"声明这个插件提供的依赖/服务"或需要配合其它声明字段使用，而不是"本插件运行前必须就绪的服务清单"；官方插件普遍采用 `apply` 内的 `ctx.inject([...], cb)`，那种写法才是运行时等待。

## 修复

改用 `apply` 内的 `ctx.inject(["webServer"], cb)`，在回调里注册路由并用 `webCtx.effect(...)` 管理生命周期。

替代方案及代价：

- 干脆不依赖服务、用 `setTimeout` 轮询 `ctx.webServer`：能用但脏，且拿不到正确的销毁时机。
- 监听 `session/created` 之类的事件：与"服务就绪"是两回事，不解决根因。

## 验证

| 检查 | 修复前 | 修复后 |
|---|---|---|
| 模块顶层日志 | 有 | 有 |
| `apply` 日志 | 无 | 有 |
| 路由注册日志 | 无 | 有 |
| `GET /notes/api` | 404 | 200 + 正确 JSON |

## 教训

- 第三方插件里**不要写顶层 `inject` 数组**，一律在 `apply` 内用 `ctx.inject([...], cb)` 等待服务。
- 判断"插件是否真的活了"不要看安装是否成功，要看 **apply 内的落盘日志**；客户端插件同理（这次是靠宿主日志才定位到）。
- 插件不生效且无报错时，先怀疑生命周期，别先怀疑路径和权限。

## 复现要点（脱敏）

1. 在 `<PLUGIN_DIR>` 建一个 bundle，`cordis.patch.yml` 插入一行宿主插件。
2. 插件写成 `export const inject = ["webServer"]` + `apply` 内注册路由，并在 `apply` 首行写日志。
3. `dsh plugin --profile <profile> add link:<PLUGIN_DIR>`，重启。
4. 观察：模块日志有、apply 日志无、路由 404。
