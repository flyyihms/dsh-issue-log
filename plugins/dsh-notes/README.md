# dsh-notes

顶栏「笔记」入口 + 右侧抽屉：把值得记下的问答沉淀到一个 markdown 文件，随时翻看、搜索、直接打开源文件。

## 形态

- 顶栏新增一个线框「记事本」图标
- 点开是**右侧抽屉**（带遮罩，`Esc` / `✕` / 点遮罩关闭）
- 抽屉里：搜索框、按分类分组的条目、右上角两个按钮（打开 md 源文件 / 收起）

## 架构

```
渲染层（web UI）                    宿主（Node）
  └─ 顶栏图标 / 抽屉  ── fetch ──►  GET  /notes/api   返回解析后的分类与条目
                                     POST /notes/open  用默认程序打开 md
                                     POST /notes/log   渲染层诊断写入宿主日志
```

关键点：**渲染层读不了磁盘**，所以数据必须由宿主通过 HTTP 路由提供。DSH 的 Remote 服务需要编译期生成的类型契约，第三方插件很难接入；而宿主插件可以用 `ctx.webServer.register({ kind, path, handler })` 注册路由，渲染层同源 `fetch` 即可，这条通道简单且稳定。

## 发现的两个坑

### 1. 顶层 `inject` 会让插件挂起

```js
// 不行：cordis 认为依赖不满足，apply 永远不执行
export const inject = ["webServer"];
```

改成运行时注入：

```js
export function apply(ctx, config) {
  ctx.inject(["webServer"], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({ ... }), "notes: route");
  });
}
```

### 2. `header.corner` 是单槽位，会挤掉侧栏开关

```
conversation.session.header.corner   kind: "single"   ← 右侧栏开关独占
conversation.session.header.utilities kind: "list"    ← 多图标入口
```

往 `corner` 注册会替换掉原有的侧栏切换按钮。第三方插件应该用 `utilities`。

### 3. 打开 md 不能用 `explorer.exe <file>`

无关联的 `.md` 会让 explorer 退化成"打开所在文件夹"。要用 `cmd /c start "" "<file>"` 走 ShellExecute。

## 笔记文件格式

```markdown
# 标题

## 分类

### 条目标题 <!-- 日期 -->
正文…
```

`##` 是分类，`###` 是条目，标题后的 HTML 注释存日期。人可以手工编辑。

## 安装

```powershell
dsh plugin --profile desktop add link:<本目录绝对路径>
```

在 profile 的 `cordis.patch.yml` 里配置 `notesPath` 指向你的 md 文件，然后重启 DSH。

## 当前状态

- ✅ 顶栏入口 + 右侧抽屉
- ✅ 渲染层 → 宿主取数
- ✅ 搜索（标题 + 正文，本地过滤）
- ✅ 打开 md 源文件
- ⬜ 写入（"记一下" → 提炼 → 确认 → 追加/覆盖）
- ⬜ 「旁问」标签页（侧边提问，不进主对话）
