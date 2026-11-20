# 0002 · 沙箱内无法启动任何外部程序（命名管道被拒）

| 项 | 内容 |
|---|---|
| 现象分类 | 命令执行 / Windows 沙箱 |
| 平台 | Windows 11 x64 |
| DSH | 0.2.1-rc.3 |
| 严重程度 | 中：沙箱模式下无法调用任何外部 exe，只读分析与文件操作不受影响 |
| 状态 | 未解决（疑似设计边界），有可用规避 |
| 关键词 | 命名管道、`\\.\pipe\LOCAL\dotnet_*`、`ResourceUnavailable`、受限令牌、piped grandchild |

## 症状

`workspace-write` 沙箱下，从工具里调用**任何外部程序**都失败，错误完全一致：

```
ResourceUnavailable:
Line |
   3 | "user.name = " + (git config --global user.name)
     | ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
     | 程序'git.exe'运行失败： Access to the path '\\.\pipe\LOCAL\dotnet_e07ce961ff6d4bb884d732b93a9870d8' is denied。

[sandbox: file access denied under workspace-write mode]
```

一开始以为只是 git 的问题，逐个探测后确认范围是**全部外部程序**：

| 程序 | 结果 |
|---|---|
| `git` / `whoami` / `cmd` / `node` / `python` / `docker` / `curl` | DENIED |
| `ping` / `ipconfig` / `hostname` / `tasklist` / `java` | DENIED |
| `dotnet` / `rg` | 不在 PATH（未验证） |

- 失败是**间歇性**的：同一个会话里 `git --version` 可能成功一次，紧接着 `git config` 就失败
- 纯 PowerShell cmdlet（`Get-Content`、`Set-Content`、`Select-String` 等）正常
- 换成 `danger-full-access` 后一切正常

## 环境

- 沙箱模式 `workspace-write`，工作区外写操作本来就被拒
- 命令通过 PowerShell 7 调用原生 exe
- git 2.5x（Windows 版）

## 排查思路

1. 先确认不是某个程序自身的问题：`git --version` 能跑 → 二进制可加载、PATH 正常
2. 看错误里的路径：给的是 `\\.\pipe\LOCAL\dotnet_*`，不是磁盘文件 → 被拒的是**命名管道**
3. 横向铺开：把 12 个常用外部程序各跑一次 → 全部同一错误 → 与具体程序无关
4. 对照：`danger-full-access` 下全部正常 → 与受限令牌有关
5. 复核隔离是否仍在：沙箱内写工作区外的文件仍被拒 → 沙箱本身正常，问题只出在"启动孙子进程"

## 根因

**已验证**：失败发生在命名管道的访问上，报错直接给出管道路径；且与程序无关、与文件权限无关。

**推测**：沙箱的受限令牌是**写限制**的（只对被授权目录放行写），而 PowerShell 启动外部程序并捕获输出时要用命名管道；创建/访问这条管道属于写操作，受限令牌在 `\\.\pipe` 上没有授权，于是子进程启动失败。这也解释了为什么"输出必须被捕获"的场景必挂、间歇性出现（不同调用路径要不要建管道不一样）。

与 DSH 文档中提到的 "piped grandchild spawn" 限制吻合，倾向于是**设计边界**而非缺陷。

## 影响

- 沙箱模式下不能跑 git、构建工具、脚本解释器、网络工具……
- 也就是说"沙箱模式只能做只读分析 + 文件编辑 + cmdlet"，做不完整开发循环
- 需要外部程序时只能切 `danger-full-access`，等于整段会话放弃隔离

## 规避

1. **需要外部程序时切到 `danger-full-access`**
2. 或者把外部命令留在宿主机终端里跑，沙箱只做分析与编辑
3. 不要试图改 PATH、注册表或 ACL —— 问题在令牌对管道对象的访问上

## 教训

1. 报错里出现 `\\.\pipe\...` 时，先判断"被拒的是管道不是文件"，排查方向完全不同
2. 一个程序出问题，先横向铺开同类程序，确认是"个别程序"还是"整类操作"
3. 沙箱限制要按**内核对象类型**理解：文件、管道、注册表键各有各的规则，不能只想着"工作区外不能写"
4. 间歇性失败往往意味着"不同调用路径用到不同的内核对象"，比稳定失败更需要横向对照
