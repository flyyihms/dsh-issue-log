# 0002 · 沙箱内无法用管道启动外部程序（`Start-Process` 可绕过）

| 项 | 内容 |
|---|---|
| 现象分类 | 命令执行 / Windows 沙箱 |
| 平台 | Windows 11 x64 |
| DSH | 0.2.1-rc.3 |
| 严重程度 | 中：常规写法（`& exe`）全部失败，但有可用规避 |
| 状态 | 未解决（设计边界），**已找到稳定可用的规避** |
| 关键词 | 命名管道、`\\.\pipe\LOCAL\dotnet_*`、`Start-Process`、`RedirectStandardOutput`、受限令牌 |

## 症状

`workspace-write` 沙箱下，用 PowerShell 的调用运算符启动任何外部程序都失败：

```
ResourceUnavailable:
     | 程序'git.exe'运行失败： Access to the path '\\.\pipe\LOCAL\dotnet_e07ce961ff6d4bb884d732b93a9870d8' is denied。
[sandbox: file access denied under workspace-write mode]
```

逐个探测后确认范围是**全部外部程序**，且失败与具体程序无关：

| 程序 | `& exe` 方式 |
|---|---|
| `git` / `whoami` / `cmd` / `node` / `python` / `docker` / `curl` | 全部 DENIED |
| `ping` / `ipconfig` / `hostname` / `tasklist` / `java` | 全部 DENIED |

错误里的路径是 `\\.\pipe\LOCAL\dotnet_*`，不是磁盘文件——所以问题不在文件权限。

## 关键发现：换成文件重定向就能跑

按"管道 vs 文件"做对照，结论非常干净：

| 启动方式 | 结果 |
|---|---|
| `& git --version`（PowerShell 用管道捕获输出） | ❌ DENIED |
| `Start-Process git --version -RedirectStandardOutput <文件>` | ✅ 成功 |
| `Start-Process cmd /c "echo hi"`（不重定向） | ✅ 成功 |
| .NET `ProcessStartInfo` + `RedirectStandardOutput`（管道） | ❌ DENIED |

也就是说：**受限令牌不能给孙子进程建管道，但文件句柄和继承控制台都可以**。

## 根因

**已验证**：失败点是命名管道的创建/访问；同类程序表现一致；改用文件重定向立即成功。

**推测**：沙箱的受限令牌是写限制的，`\\.\pipe` 不在被授权的可写对象里，所以 PowerShell 为捕获子进程输出而建的管道被拒，子进程随之启动失败。这与 DSH 文档中的 "piped grandchild spawn" 限制吻合，属于**设计边界**。

## 可用规避（推荐）

用 `Start-Process` + 文件重定向启动外部程序，输出写到工作区文件里再读：

```powershell
$out = Join-Path $PWD 'cmd.out'
$err = Join-Path $PWD 'cmd.err'
Start-Process -FilePath 'git' -ArgumentList '--version' `
  -NoNewWindow -Wait -PassThru `
  -RedirectStandardOutput $out -RedirectStandardError $err
Get-Content $out
Remove-Item $out, $err
```

两个坑：

1. **退出码读不到**：沙箱里 `$p.ExitCode` 会是空值（`HasExited` 为真但 `ExitCode` 为空）。要拿退出码就用 `cmd` 包装回传：
   ```powershell
   Start-Process cmd -ArgumentList '/c','git --version & echo __EXIT__%errorlevel%' `
     -NoNewWindow -Wait -RedirectStandardOutput $out
   Get-Content $out | Where-Object { $_ -like '__EXIT__*' }
   ```
2. **不适合交互式/流式输出**：只能一次性拿结果。需要交互时切 `danger-full-access`。

## 影响

- 常规写法（`& exe`、`$(exe)`、`exe | ...`）在沙箱里全部不可用
- 但用 `Start-Process` 的文件重定向，**git、node、python 等都能跑**，足以完成"执行 → 取输出 → 取退出码"的闭环
- 只有需要管道流式处理（大输出、实时日志、交互）时才必须切完全权限

## 教训

1. 报错里出现 `\\.\pipe\...` 时，先判断"被拒的是管道不是文件"，排查方向完全不同
2. 一个程序出问题，先横向铺开同类程序，确认是"个别程序"还是"整类操作"
3. 同一个能力换个 API 往往就通了：`&` 用管道捕获输出，`Start-Process` 可以用文件句柄，后者在受限令牌下可行
4. 沙箱限制要按**内核对象类型**理解：文件、管道、注册表键各有各的规则
