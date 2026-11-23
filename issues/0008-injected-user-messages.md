# 0008 · 注入消息也被记成 `user/message`，被当成"用户说过的话"

| 项 | 内容 |
|---|---|
| 现象分类 | 数据格式 / 会话解析 |
| 平台 | Windows 11 x64 |
| DSH | 0.2.1-rc.3 |
| 严重程度 | 中（搜索结果错位，会让人以为"我没说过这句"） |
| 状态 | 规避方案（按 `data.source.kind` 过滤） |
| 关键词 | user/message、source.kind、runtime-context、skill-catalog |

## 症状

自己做的会话搜索里，筛选"我（user）"之后，结果中出现了大量**用户本人从未输入过的文字**：

- `You are an AI agent powered by …` 这类身份提示
- 整套 Skill 目录（几十条 `name` + `description`）
- 每轮的运行环境快照（工作目录、沙箱策略、审批策略、Web GUI URL）
- `The approval policy changed from "ask" to "never"` 之类的系统通知

它们都被标成了"我"。

## 环境

- DSH 0.2.1-rc.3，会话日志格式 v4（事件流 JSONL，zstd 多帧）
- 初版检索逻辑：`event.type === "user/message"` 即视为用户发言

## 排查思路

1. 确认事件类型名（`user/message` 数量 191 条，远多于真实提问数）。
2. 打印这些事件的完整结构，看有没有区分字段。
3. 对各字段取值做频次统计，确认哪个字段能区分真伪。

## 被排除的假设

| 假设 | 做法 | 结果 | 结论 |
|---|---|---|---|
| 事件类型判定错 | 打印 type 字段 | 确实是 `user/message` | 排除 |
| 搜索逻辑匹配了相邻字段 | 只看 `data.content` | 文字确实在里面 | 排除 |
| 会话文件串了 | 校验 session id | 一致 | 排除 |

## 转折点

打印 `user/message` 的 `data` 键集合，全部都是 `content,id,role,source`；再按 `source.kind` 做频次统计：

| `source.kind` | 含义 | 约计数 |
|---|---|---|
| `runtime-context` | 每轮运行环境快照 | 数十条 |
| `skill-catalog` | 可用技能清单 | 数十条 |
| `agent-instructions` | AGENTS.md/CLAUDE.md 注入提醒 | 9 |
| `user-approval` | 审批/权限变更通知 | 13 |
| `time-context` | 时间快照 | 2 |
| **`user`** | **真人输入** | **3** |

## 根因

**已验证**：DSH 把"注入给模型的消息"与"用户输入"统一记录为 `user/message`，用 `data.source.kind` 区分；只有 `kind === "user"` 是真人输入，其余都是引擎生成的上下文。

**推测**：这样设计是为了让回放时保持与当轮请求一致的顺序与结构，属于有意为之。

## 修复

检索时只接受 `kind === undefined || kind === "user"` 的 `user/message`：

```js
const kind = event?.data?.source?.kind;
if (kind !== undefined && kind !== "user") return "";
```

助手侧（`assistant/message`）不受影响，本来就是模型的回复。

## 验证

| 检查 | 修复前 | 修复后 |
|---|---|---|
| 搜 `AGENT` 的结果 | 大量系统提示、技能清单 | 只剩真实对话 |
| 筛选"我" | 混入机器文本 | 只有真人输入 |
| 搜一个用户没提过的词 | 仍能命中（来自注入） | 无命中 |

## 教训

- 判断"谁说的"不能只看事件类型，**要看来源标记**；日志格式里凡是"记录"字段都可能包含注入内容。
- 做历史检索类功能前，先对候选事件的字段做频次统计——异常分布（191 条 user 消息 vs 实际提问数）比逐个读内容更快暴露问题。
- 结果与用户记忆冲突时，优先怀疑数据模型，而不是用户的记忆。

## 复现要点（脱敏）

1. 打开任一 `session.v4.jsonl.zstd`，按 0007 的方式解压。
2. 统计 `type === "user/message"` 事件的 `data.source.kind` 分布。
3. 观察 `kind !== "user"` 的条目内容为系统注入文本。
