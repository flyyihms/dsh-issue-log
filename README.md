# DSH Issue Log

> A personal log of problems hit while using **DeepSeek Harness (DSH)** on Windows —
> symptoms, investigation steps, root causes and verified fixes.
> Not affiliated with the DSH project; nothing here is official documentation.

记录 DSH（DeepSeek Harness）日常使用中遇到的问题、排查路径与结论。不是教程，是"踩坑档案"：每个问题一个文件，结论要么被我实测验证过，要么明确标成推测。

## 索引

| # | 问题 | 平台 | DSH 版本 | 状态 |
|---|---|---|---|---|
| [0001](issues/0001-pwsh-sandbox-0xc0000142.md) | 沙箱内 `pwsh` 一律 `0xC0000142` | Windows 11 x64 | 0.2.1-rc.3 | 本地补丁已修复 |
| [0002](issues/0002-sandbox-external-programs.md) | 沙箱内无法用管道启动外部程序（`Start-Process` 可绕过） | Windows 11 x64 | 0.2.1-rc.3 | 未解决（设计边界），有稳定规避 |
| [0003](issues/0003-background-notifications.md) | 后台提醒：Windows 通知 + 任务栏数字角标 | Windows 11 x64 | 0.2.1-rc.3 | 已实现（本地插件，见 [plugins/](plugins/)） |
| [0004](issues/0004-plugin-top-level-inject.md) | 宿主插件顶层 `inject` 让 `apply` 永不执行（静默失效） | Windows 11 x64 | 0.2.1-rc.3 | 规避（改运行时注入） |
| [0005](issues/0005-header-corner-single-slot.md) | `header.corner` 是单槽位，注册会顶掉侧栏开关 | Windows 11 x64 | 0.2.1-rc.3 | 规避（改用 `utilities`） |
| [0006](issues/0006-explorer-opens-folder.md) | `explorer.exe <file>` 打开文件夹而非文件 | Windows 11 x64 | 0.2.1-rc.3 | 规避（改用 `cmd /c start`） |
| [0007](issues/0007-session-log-multiframe-zstd.md) | 会话日志是多帧 zstd，库里只解第一帧 | Windows 11 x64 | 0.2.1-rc.3 | 规避（逐帧手工解码） |
| [0008](issues/0008-injected-user-messages.md) | 注入消息也被记成 `user/message`，冒充用户发言 | Windows 11 x64 | 0.2.1-rc.3 | 规避（按 `source.kind` 过滤） |
| [0009](issues/0009-subagent-user-prompts.md) | 子代理会话的 "user 消息" 是 agent 写的提示词 | Windows 11 x64 | 0.2.1-rc.3 | 规避（跳过 `delegationDepth > 0`） |
| [0010](issues/0010-client-style-hot-reload.md) | 客户端插件热重载后样式丢失，新类名无样式 | Windows 11 x64 | 0.2.1-rc.3 | 规避（每次覆盖 style） |
| [0011](issues/0011-client-import-failure-blocks-boot.md) | 客户端插件语法错误导致 Web 启动中断 | Windows 11 x64 | 0.2.1-rc.3 | 规避（改前 `node --check`） |
| [0012](issues/0012-disable-plugins-recovery.md) | 恢复按钮"禁用第三方插件"清空 bundles 与 patch | Windows 11 x64 | 0.2.1-rc.3 | 已定位（需手动还原） |

## 阅读约定

每条问题固定包含：**症状 → 环境 → 排查 → 根因 → 修复 → 验证 → 教训**。

- `已验证` 与 `推测` 分开标注；只有实际跑过的才写"已验证"
- 保留原始返回码，并注明多种写法，例如 `3221225794` = `0xC0000142` = `-1073741502`（同一个值的有符号/无符号形式）
- 失败的做法也记录——排除法本身就是结论
- 修复区分三种：**上游已修** / **本地补丁** / **规避方案**

## 脱敏

- 路径用占位符：`%USERPROFILE%`、`<DSH_INSTALL>`、`<WORKSPACE>`
- 不出现主机名、账号名、私有仓库地址
- 合成 SID 用示例值：`S-1-4-<a>-<b>`；用户 SID 用 `S-1-5-21-…`
- 第三方安全软件不点名，只描述其层级（用户态防护 / 内核驱动）

## 插件

问题记录里提到的本地插件，源码放在 [`plugins/`](plugins/) 下，都是 `link:` 安装到 profile 的：

| 插件 | 作用 | 相关记录 |
|---|---|---|
| [dsh-approval-notify](plugins/dsh-approval-notify/) | 窗口不在前台时发 Windows 通知 + 任务栏数字角标 | [0003](issues/0003-background-notifications.md) |
| [dsh-recall](plugins/dsh-recall/) | 顶栏放大镜 → 右侧抽屉：markdown 笔记 + 跨会话全文搜索 | — |

## 新增问题

复制 [templates/issue.md](templates/issue.md)，编号顺延，并在上面的索引表里登记一行。

