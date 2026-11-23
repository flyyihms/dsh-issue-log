# 0005 · 会话顶栏 `header.corner` 是单槽位，注册会顶掉侧栏开关

| 项 | 内容 |
|---|---|
| 现象分类 | UI / 插件 / 插槽 |
| 平台 | Windows 11 x64 |
| DSH | 0.2.1-rc.3 |
| 严重程度 | 中（自己的入口出现，别人的入口消失） |
| 状态 | 规避方案（改用 `utilities` 插槽） |
| 关键词 | slots、conversation.session.header.corner、single、utilities |

## 症状

把自定义图标注册到会话顶栏最右侧的 `conversation.session.header.corner` 后：

- 自定义图标**没有出现**
- 原本在那里的**侧边栏开关图标消失了**

即：既有插件被顶掉，新插件也没渲染出来。

## 环境

- DSH 0.2.1-rc.3 桌面版
- 客户端插件（`dsh.client`）通过 `ctx.slots.register` 注册按钮
- 参考实现：`dsh-client-ui-sidebar-right` 往同一个槽位注册了展开按钮

## 排查思路

1. 先确认槽位存在且被别的插件使用 → 读 asar 里 `dsh-client-ui-conversation` 的插槽声明。
2. 看槽位的 `kind` 定义，判断是否允许多个注册。
3. 查客户端日志确认我们的注册**是否执行**（用 HTTP 上报到宿主日志）。

## 被排除的假设

| 假设 | 做法 | 结果 | 结论 |
|---|---|---|---|
| 槽位名写错 | 在 asar 里搜槽位名 | 存在，官方在用 | 排除 |
| 注册代码抛错 | 客户端上报 try/catch | 注册成功，无异常 | 排除 |
| 组件渲染失败 | 换极简组件 | 仍不显示 | 排除 |

## 转折点

读插槽声明时看到：

```js
"conversation.session.header.corner":   { kind: "single", scope: "session" },
"conversation.session.header.utilities": { kind: "list",   scope: "session" },
```

`single` 只有一个位置，后注册者覆盖先注册者——解释了"我的没显示、原开关消失"（或反过来）。

## 根因

**已验证**：`conversation.session.header.corner` 是 `kind: "single"` 的单值槽位，不是列表。第三方插件注册进去等于**替换**该位置的所有者，而不是追加。

**推测**：`single` 槽位在渲染时只取当前注册项，多个注册的胜者取决于注册时序，因此表现为"看见一个、丢一个"。

## 修复

改用同为顶栏、但 `kind: "list"` 的 `conversation.session.header.utilities`：

```js
ctx.slots.inject("conversation.session.header.utilities", () =>
  ctx.slots.register({ name: "conversation.session.header.utilities", id: "recall-entry", order: 30 }, Entry),
);
```

位置在 corner 左侧，与官方 open-in-app、schedule 的图标并排，互不影响。

## 验证

| 检查 | 修复前 | 修复后 |
|---|---|---|
| 自定义图标 | 不显示 | 显示 |
| 侧栏开关图标 | 消失 | 正常显示 |
| 其它 utilities 图标（open-in-app 等） | 正常 | 正常 |

## 教训

- 往顶栏/工具栏加东西之前，**先读槽位声明确认 `kind`**：`single` 是"占位"，`list` 才是"追加"。
- 一旦发现"我的图标没出来、别人的没了"，直接怀疑单槽位覆盖，不用查渲染。
- 官方实现往 `single` 槽位注册只适用于"该插件就是这一格的唯一主人"的场景（如侧栏开关）。

## 复现要点（脱敏）

1. 客户端插件注册 `conversation.session.header.corner`（`kind: "single"`）。
2. 重启，观察该位置只剩一个图标（或原有图标消失）。
3. 改成 `conversation.session.header.utilities` 后两者共存。
