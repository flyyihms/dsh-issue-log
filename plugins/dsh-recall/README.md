# dsh-recall

顶栏一个放大镜，点开右侧抽屉，两个标签页：**笔记**和**全局**。

解决的问题：问过的概念记不住、想再问一次；以前讨论过的事情找不到。前者靠笔记沉淀，后者靠会话全文搜索。

## 功能

### 笔记

- 读一个 markdown 笔记文件，按 `##` 分类分组展示
- 顶部输入框在本地过滤（标题 + 正文）
- 「打开源文件」调用系统默认程序打开该 md

### 全局

跨所有历史会话做全文搜索。

| 能力 | 说明 |
|---|---|
| 只搜真实对话 | 只索引 `user/message` 与 `assistant/message` 的文本部分 |
| 排除注入消息 | 引擎把运行环境快照、技能清单、AGENTS.md 提醒也记成 `user/message`，用 `data.source.kind` 区分，只保留 `kind: "user"` |
| 排除子代理会话 | `delegationDepth > 0` 的会话里，"user" 是 agent 写的提示词，不是人话 |
| 角色筛选 | 全部 / 我 / 助手 |
| 命中高亮 | 不区分大小写，一条里出现多次全部标注 |
| 就地看上下文 | 点一条结果，展开前后各 3 条对话，命中那条高亮 |
| 复制 | 复制全文；或复制「会话 id + seq + 时间」用于定位 |

## 架构

渲染层（网页）读不了磁盘，所以数据都由宿主插件通过 **HTTP 路由**提供，渲染层同源 `fetch`：

| 路由 | 方法 | 作用 |
|---|---|---|
| `/notes/api` | GET | 解析后的笔记分类与条目 |
| `/notes/search?q=&limit=&role=` | GET | 会话全文搜索 |
| `/notes/context?session=&seq=&around=` | GET | 某条命中的前后对话 |
| `/notes/open` | POST | 用系统默认程序打开笔记 md |
| `/notes/log` | POST | 渲染层诊断信息写入宿主日志 |

选择 HTTP 路由而不是 DSH 的 Remote 服务：Remote 需要编译期生成的类型契约，第三方插件很难接入；`ctx.webServer.register({ kind, path, handler })` 是公开且稳定的。

### 会话存储

```
$DSH_HOME/sessions/--<cwd 编码>--/<session-id>/session.v4.jsonl.zstd
```

**这是一个多帧 zstd 文件**：每条追加事件都是独立的 zstd 帧，Node 内置的 `zstdDecompressSync` 只解第一帧。`lib/zstd.js` 按 zstd 帧头逐帧切分再解压，解压结果按 `(mtime, size)` 缓存。

## 笔记文件格式

```markdown
# 标题

## 分类

### 条目标题 <!-- 日期 -->
正文…
```

`##` 是分类，`###` 是条目，标题后的 HTML 注释存日期。可以手工编辑。

## 安装

```powershell
dsh plugin --profile desktop add link:<本目录绝对路径>
```

在 profile 的 `cordis.patch.yml` 里配置 `notesPath` 指向自己的 md，然后重启 DSH：

```yaml
- insert:
    - id: recall-host
      name: 'dsh-recall'
      config:
        notesPath: '<NOTES_PATH>/dsh-notes.md'
```

## 踩过的坑

1. **插件顶层 `inject` 会让插件挂起**：`export const inject = ["webServer"]` 与 cordis 语义不符，`apply` 永远不执行。改用 `apply` 里的 `ctx.inject(["webServer"], cb)`。
2. **`header.corner` 是单槽位**：`conversation.session.header.corner` 的 `kind` 是 `single`，第三方插件注册会顶掉右侧栏开关。应使用 `kind: "list"` 的 `conversation.session.header.utilities`。
3. **`explorer.exe <file>` 打开的是文件夹**：`.md` 无关联时会退化成"显示所在位置"。要用 `cmd /c start "" "<file>"` 走 ShellExecute。
4. **注入消息伪装成用户消息**：运行环境快照、技能清单等也以 `user/message` 记录，靠 `data.source.kind !== "user"` 排除。
5. **子代理会话的 user 消息是 agent 写的**：`delegationDepth > 0` 的会话要整体跳过。
6. **热重载时旧样式残留**：`ensureStyles()` 若发现 `<style>` 已存在就直接 return，新类名没有规则、会渲染成裸元素。改成每次都覆盖 `textContent`。
7. **多帧 zstd**：见上文，直接解压只能拿到第一帧。

## 已知限制

- **无法跳到对话的具体位置**：DSH 客户端没有暴露按会话/消息定位的接口（`ctx.sessions.enter` 是存储层 API），Web UI 也没有会话深链。用"就地展开上下文"替代。
- 首次搜索要解压全部会话（数十 MB），约 1–3 秒；之后走缓存。
- 路由未做鉴权，仅本机可访问，笔记内容不敏感时够用。
- 笔记写入（"记一下" → 提炼 → 确认 → 落盘）尚未实现，目前只能手工编辑 md。

## 版本

- `0.2.0`：改名 dsh-notes → dsh-recall；新增会话搜索（角色筛选、上下文、高亮）；笔记面板改为抽屉 + 分段控件。
