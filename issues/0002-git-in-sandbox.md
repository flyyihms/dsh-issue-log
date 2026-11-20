# 0002 · 沙箱内无法执行 `git`（命名管道被拒）

| 项 | 内容 |
|---|---|
| 现象分类 | 命令执行 / Windows 沙箱 |
| 平台 | Windows 11 x64 |
| DSH | 0.2.1-rc.3 |
| 严重程度 | 中：沙箱模式下无法用 git 提交/推送，但不影响其它命令 |
| 状态 | 未解决（沙箱设计限制），有可用规避 |
| 关键词 | 命名管道、`\\.\pipe\LOCAL\dotnet_*`、`ResourceUnavailable`、受限令牌 |

## 症状

`workspace-write` 沙箱下，从工具里调用 `git` 会失败，典型输出：

```
ResourceUnavailable:
Line |
   3 | "user.name = " + (git config --global user.name)
     | ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
     | 程序'git.exe'运行失败： Access to the path '\\.\pipe\LOCAL\dotnet_e07ce961ff6d4bb884d732b93a9870d8' is denied。

[sandbox: file access denied under workspace-write mode]
```

特点：

- **不稳定**：同一个会话里 `git --version` 能正常输出，紧接着的 `git config` 就失败
- 同样的错误也会出现在 `whoami.exe` 等其它外部程序上
- 换成 `danger-full-access` 后一切正常

## 环境

- 沙箱模式 `workspace-write`，工作区外写操作本来就被拒
- git 2.5x（Windows 版），凭据由 Git Credential Manager 提供
- 命令通过 PowerShell 调用原生 exe

## 排查思路

1. 先确认不是 git 自身问题：`git --version` 能跑 → 二进制可加载、PATH 正常
2. 再确认错误来源：报错里给出的是 `\\.\pipe\LOCAL\dotnet_*`，不是文件路径 → 被拒的是**命名管道**，不是磁盘写入
3. 横向比对：`whoami.exe` 同样失败 → 与 git 无关，是"外部程序 + 管道"这个组合
4. 对照：`danger-full-access` 下全部正常 → 与受限令牌有关

## 根因（部分推测）

沙箱给子进程的是**受限令牌**（低完整性 + 写限制）。外部程序被 PowerShell 拉起时，运行时会用到命名管道（`\\.\pipe\LOCAL\dotnet_*` 是 .NET 的诊断通道），而受限令牌没有这条管道的访问权限，于是程序启动即失败。

**已验证**：失败确实发生在管道访问上，报错路径就是管道名。
**推测**：具体是管道对象的 DACL 与受限 SID 不匹配，还是 .NET 诊断通道在低完整性下被系统拒绝，没有继续深究——对日常使用而言，规避成本更低。

## 影响

- 沙箱模式下不能提交、不能推送、不能读 git 配置
- 只影响"从沙箱里调用外部程序"这一路径；纯 PowerShell cmdlet 正常

## 规避

1. **需要 git 时切到 `danger-full-access`**（最直接）
2. 或者改在宿主机终端里做 git 操作，沙箱只跑只读/分析类命令
3. 不要试图为这件事改 PATH、注册表或 ACL——问题在令牌的管道访问上，不在查找路径

## 教训

1. 报错里出现 `\\.\pipe\...` 时，先判断"被拒的是管道不是文件"，排查方向完全不同
2. 同一个程序"一会儿行一会儿不行"，往往是因为不同调用路径用到的内核对象不同（这里是有没有走诊断管道）
3. 沙箱限制要按**内核对象类型**理解：文件、管道、注册表键各有各的规则，不能只想着"工作区外不能写"
