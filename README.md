# DSH Issue Log

> A personal log of problems hit while using **DeepSeek Harness (DSH)** on Windows —
> symptoms, investigation steps, root causes and verified fixes.
> Not affiliated with the DSH project; nothing here is official documentation.

记录 DSH（DeepSeek Harness）日常使用中遇到的问题、排查路径与结论。不是教程，是"踩坑档案"：每个问题一个文件，结论要么被我实测验证过，要么明确标成推测。

## 索引

| # | 问题 | 平台 | DSH 版本 | 状态 |
|---|---|---|---|---|
| [0001](issues/0001-pwsh-sandbox-0xc0000142.md) | 沙箱内 `pwsh` 一律 `0xC0000142` | Windows 11 x64 | 0.2.1-rc.3 | 本地补丁已修复 |
| [0002](issues/0002-sandbox-external-programs.md) | 沙箱内无法启动任何外部程序（命名管道被拒） | Windows 11 x64 | 0.2.1-rc.3 | 未解决（疑似设计边界），有规避 |

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

## 新增问题

复制 [templates/issue.md](templates/issue.md)，编号顺延（`0002-…`），并在上面的索引表里登记一行。
