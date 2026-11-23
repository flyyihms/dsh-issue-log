# 0006 · `explorer.exe <file>` 打开的是文件夹，不是文件

| 项 | 内容 |
|---|---|
| 现象分类 | 系统集成 / 打开方式 |
| 平台 | Windows 11 x64 |
| DSH | 0.2.1-rc.3 |
| 严重程度 | 低（功能可用但不达预期） |
| 状态 | 规避方案（改用 `cmd /c start`） |
| 关键词 | explorer.exe、ShellExecute、start、文件关联、.md |

## 症状

插件里点"打开笔记源文件"，期望用默认编辑器打开 `.md`，实际弹出了**资源管理器窗口**，显示的是文件所在目录，文件本身没被打开。

## 环境

- Windows 11 x64
- 宿主侧用 `child_process.spawn("explorer.exe", [path], { detached: true })`
- 目标文件是 `.md`，该扩展名没有可靠的默认关联程序

## 排查思路

1. 确认路径正确（同一个路径 `fs.statSync` 能读到文件）。
2. 确认进程真的启动了（`spawn` 无异常）。
3. 只剩"explorer 对文件参数的处理方式"这一个变量。

## 被排除的假设

| 假设 | 做法 | 结果 | 结论 |
|---|---|---|---|
| 路径拼错/含空格失败 | 打印实际路径并 `fs.existsSync` | 存在 | 排除 |
| 进程启动失败 | 捕获 spawn 异常 | 无异常 | 排除 |
| 权限不足 | 以同一账号手动执行 | 同样弹文件夹 | 排除 |

## 转折点

手动在命令行执行 `explorer.exe "<file>.md"`，得到同样的"打开所在文件夹"行为；换成 `cmd /c start "" "<file>.md"` 才调用默认关联程序。

## 根因

**已验证**：`explorer.exe <file>` 不保证走文件关联打开，在扩展名没有关联程序时退化为"定位到该文件/打开其所在目录"。

**推测**：`start` 内部走 ShellExecute，才会按关联打开；explorer 的参数语义更接近"在资源管理器中选中/浏览"。

## 修复

```js
spawn("cmd.exe", ["/c", `start "" "${notesPath}"`], {
  detached: true,
  stdio: "ignore",
  windowsVerbatimArguments: true,
});
```

`start` 的第一个空引号参数是窗口标题占位，必须保留，否则路径含空格时会被当成标题。

替代方案：
- `ShellExecute` 的 Node 绑定（`open` 包）：多一个依赖，收益相同。
- Electron 的 `shell.openPath`：宿主进程中拿不到 `electron` 模块（Electron-as-node），不可用。

## 验证

| 检查 | 修复前 | 修复后 |
|---|---|---|
| 点击"打开源文件" | 弹出所在文件夹 | **待复测**（修复已实现，未在成品上再点一次） |

## 教训

- Windows 上"打开文件"要用 ShellExecute 语义（`start`），不要用 `explorer.exe <path>`。
- `.md` 这类无默认关联的扩展名，一定要预期"会弹选择打开方式"或"没有关联"，不能当成稳定行为。
- 路径含空格时，`start` 的标题占位引号不能省。

## 复现要点（脱敏）

1. 准备一个没有默认关联的扩展名文件，例如 `<WORKSPACE>\notes\x.md`。
2. `explorer.exe "<WORKSPACE>\notes\x.md"` → 打开文件夹。
3. `cmd /c start "" "<WORKSPACE>\notes\x.md"` → 弹"选择打开方式"或直接打开默认程序。
