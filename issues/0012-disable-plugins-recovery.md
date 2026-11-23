# 0012 · 恢复按钮"禁用第三方插件"会清空 profile 的 bundles 与 patch

| 项 | 内容 |
|---|---|
| 现象分类 | 启动失败恢复 / 配置 |
| 平台 | Windows 11 x64 |
| DSH | 0.2.1-rc.3 |
| 严重程度 | 中（恢复得进界面，但所有插件与个性化设置消失） |
| 状态 | 已定位（需手动还原） |
| 关键词 | 禁用第三方插件、profile patch、bundles、cordis.patch.yml、恢复 |

## 症状

应用因插件导入失败无法启动时，弹窗提供三个按钮：`退出` / `重启` / `禁用第三方插件、备份 profile patch 并重启`。

点第三个按钮确实能进界面，但进去之后：

- 顶栏、侧栏的第三方插件入口**全部消失**（连通知、侧边栏、市场也一样）
- `cordis.patch.yml` 里原有的默认模型、MCP 服务器、provider 配置**不见了**
- 插件列表里只剩官方 bundles 和一个会自动补回的市场插件

## 环境

- DSH 0.2.1-rc.3 桌面版
- profile 目录：`%USERPROFILE%\.dsh\profiles\<profile>\`
- 配置：`package.json` 的 `dsh.profile.bundles` + `cordis.patch.yml`

## 排查思路

1. 对比"恢复前/后" profile 目录的文件与时间戳。
2. 看 `package.json` 的 `bundles` 是否被改写。
3. 看 `cordis.patch.yml` 是否被替换，以及是否留下备份文件。

## 被排除的假设

| 假设 | 做法 | 结果 | 结论 |
|---|---|---|---|
| 插件被卸载了 | 查 `dependencies` | 依赖仍在 | 排除 |
| node_modules 被删 | 检查目录 | 仍在 | 排除 |
| 界面缓存导致不显示 | 完全重启 | 仍不显示 | 排除 |

## 转折点

对比目录时间戳发现恢复按钮改写了两个文件：

- `package.json`：`dsh.profile.bundles` 被裁到 `["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"]`（之后市场插件会把自己补回）
- `cordis.patch.yml`：被替换成精简版，同时生成备份 `cordis.patch.yml.bak-<epoch 毫秒>`

备份里保留了原始的默认模型、`ui-settings`、MCP 服务器 insert 段、provider 配置。

## 根因

**已验证**：该恢复按钮的行为是"停用全部第三方 bundle + 备份并精简 profile patch"，属于**破坏性恢复**：它让应用先能启动，但不打算保留自定义插件状态，也不自动还原。

**推测**：在启动失败场景下它无法判断是哪个插件出错，所以选择全部禁用；保留备份是为了让人工有还原余地。

## 修复

手动还原，两步：

1. `package.json` 的 `bundles` 把插件清单补回（顺序无所谓，官方两项在最前）：

```json
"bundles": [
  "@deepseek-ai/dsh-base",
  "@deepseek-ai/dsh-web-app",
  "<PLUGIN_A>", "<PLUGIN_B>", "…"
]
```

2. 若要恢复个性化配置，用备份覆盖或用编辑器把缺的段落粘回 `cordis.patch.yml`：

```powershell
Copy-Item cordis.patch.yml.bak-<epoch> cordis.patch.yml
```

注意备份可能是旧的（本次备份内容来自更早的编辑），若备份里的 `ui-settings.enabled`、`developerTools`、`purpose` 与近期手动设置不一致，只挑缺失的段落粘回，不要整份覆盖。

## 验证

| 检查 | 恢复按钮之后 | 手动还原后 |
|---|---|---|
| 第三方插件入口 | 全部消失 | 全部回来 |
| `bundles` 列表 | 只剩官方 | 与原来一致 |
| `cordis.patch.yml` 自定义段 | 丢失 | 恢复 |
| 应用可启动 | 是 | 是 |

## 教训

- 见到这个恢复按钮，**先把它会改哪些文件记下来**再点；它不是"重试"，而是"关掉第三方插件"。
- profile 目录应纳入版本控制或定期备份（`package.json` + `cordis.patch.yml` 两个文件就够还原全部插件状态）。
- 更好的顺序永远是：**先在本地做静态检查**（如 `node --check`）把坏插件找出来，而不是用禁用全部插件的方式绕过。
- 按钮留下的 `cordis.patch.yml.bak-<epoch>` 是最重要的还原线索，别删。

## 复现要点（脱敏）

1. 制造一个会让插件 import 失败的改动，触发启动失败弹窗。
2. 点"禁用第三方插件、备份 profile patch 并重启"。
3. 观察 `<profile>/package.json` 的 `bundles` 被裁减，`cordis.patch.yml` 被替换并新增 `bak-*` 备份。
