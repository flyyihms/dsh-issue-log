# 0011 · 客户端插件的语法错误会让整个 Web 启动中断

| 项 | 内容 |
|---|---|
| 现象分类 | 插件 / 启动 |
| 平台 | Windows 11 x64 |
| DSH | 0.2.1-rc.3 |
| 严重程度 | 高（应用完全不可用） |
| 状态 | 规避（改动后先做语法检查） |
| 关键词 | web boot、entry did not activate、import failed、客户端插件 |

## 症状

改完客户端插件后重启，应用无法进入界面，弹出错误框：

```
DeepSeek Harness 无法使用
应用无法启动或已意外停止。

web boot: 1 entry did not activate
<plugin-name>: import failed (see console for the import error)
诊断报告: …\crash-<时间>-web-boot.log
```

只有一个插件导入失败，但**整个 Web 端启动被判定为失败**，界面进不去。

## 环境

- DSH 0.2.1-rc.3 桌面版
- 出问题的插件是自建 bundle 的客户端半（`dsh.client` 入口 `lib/client.js`）
- 同一 profile 里还有 6 个第三方 bundle

## 排查思路

1. 读弹窗里给出的 `web-boot.log`（实际只记录了入口未激活，没有堆栈）。
2. 直接用 Node 对客户端文件做语法检查。
3. 定位到具体行后修复，再重启。

## 被排除的假设

| 假设 | 做法 | 结果 | 结论 |
|---|---|---|---|
| 宿主插件把服务搞崩 | 宿主日志无异常 | 正常 | 排除 |
| profile 配置损坏 | 检查 package.json | 正常 | 排除 |
| 依赖未安装 | 检查 node_modules | 正常 | 排除 |
| 浏览器缓存 | 换端口/重启 | 仍失败 | 排除 |

## 转折点

对客户端文件跑语法检查（不需要启动应用）：

```
node --check <PLUGIN_DIR>/lib/client.js
→ SyntaxError: Unexpected token ')'（第 98 行）
```

原因是一次编辑删代码块时**残留了一个多余的 `)`**，模块解析失败 → import 失败 → 入口未激活。

## 根因

**已验证**：客户端插件在启动阶段被 import；任一插件 import 抛错会导致 `web boot: N entry did not activate`，并整体判定启动失败。语法错误属于 import 期错误，无法被插件内部的 try/catch 兜住。

**推测**：启动器把"所有入口都激活"当作进入界面的前置条件，因此单点失败即全局失败。

## 修复

1. 删掉多余括号。
2. 对客户端与宿主两个文件都跑 `node --check`，确认无输出错误。
3. 重启，应用正常进入。

改进后的流程：**每次改完客户端/宿主文件，先 `node --check`，再让用户重启**。

## 验证

| 检查 | 修复前 | 修复后 |
|---|---|---|
| `node --check` | SyntaxError | 通过 |
| 应用启动 | 报 web boot 失败 | 正常进入 |
| 插件功能 | 不可用 | 正常 |

## 教训

- 客户端插件是**启动关键路径**：一个语法错误就能让整个应用打不开，不能像普通脚本那样"跑起来再看"。
- 语法检查是零成本前置动作：`node --check <file>` 不依赖 DSH，几秒钟就能拦住这类事故。
- 弹窗里的 `web-boot.log` 只给"哪个入口没激活"，不给你堆栈——所以别指望诊断文件，直接对文件做静态检查更快。

## 复现要点（脱敏）

1. 在客户端插件文件里制造一处括号不匹配。
2. 重启 DSH → 弹"应用无法启动或已意外停止 / web boot: 1 entry did not activate"。
3. 删除多余字符后重启 → 恢复正常。
