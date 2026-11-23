# 0007 · 会话日志是多帧 zstd，`zstdDecompressSync` 只解第一帧

| 项 | 内容 |
|---|---|
| 现象分类 | 数据格式 / 存储 |
| 平台 | Windows 11 x64 |
| DSH | 0.2.1-rc.3 |
| 严重程度 | 中（全文搜索/统计类工具直接失效，且不报错） |
| 状态 | 规避方案（逐帧手工解码） |
| 关键词 | zstd、多帧、session.v4.jsonl.zstd、zstdDecompressSync |

## 症状

写脚本遍历 sessions 目录解压 `session.v4.jsonl.zstd` 做全文搜索：

- 17 个会话文件、共 23.4 MB
- 搜索命中 **0 条**，而里面的词明明存在
- 解压结果只有两百多字符，明显不对

## 环境

- Windows 11 x64，Node 24.21.0（`zlib.zstdDecompressSync` 可用）
- 会话路径：`%USERPROFILE%\.dsh\sessions\--<cwd 编码>--\<session-id>\session.v4.jsonl.zstd`
- 最大单文件 5.3 MB

## 排查思路

1. 确认文件确实是 zstd（魔数检查）。
2. 数魔数出现次数 → 判断是不是多帧。
3. 对比"库解压长度"和"文件真实行数"。

## 被排除的假设

| 假设 | 做法 | 结果 | 结论 |
|---|---|---|---|
| 文件损坏 | 解码后是无异常 | 能解出合法 JSON 首行 | 排除 |
| 编码问题 | 按 utf8 读 | 首行正常 | 排除 |
| 搜索逻辑写错 | 用固定字符串测 | 仍然 0 命中 | 排除 |
| 文件不是 zstd | 读前 4 字节 | `0xFD2FB528` | 排除 |

## 转折点

统计整个文件里 `28 B5 2F FD`（小端魔数）的出现次数：一个 5.5 MB 文件里出现 **3421 次**——文件是 3421 个 zstd 帧的拼接（每条追加事件一帧）。而解压库只返回了第一帧，长度 218 字符。

## 根因

**已验证**：`session.v4.jsonl.zstd` 是**追加式多帧**格式；Node 的 `zstdDecompressSync` 与流式解压都只处理第一帧，不继续消费后续帧。

**推测**：这是设计使然（按事件追加、便于增量压缩），并非文件损坏。

## 修复

自己按 zstd 帧格式逐帧切分再解压：

1. 读 4 字节魔数；兼容可跳过帧（`0x184D2A50`~`0x184D2A5F`）。
2. 解析 Frame_Header_Descriptor：`Single_Segment`、`Content_Checksum`、`Dictionary_ID_flag`、`Frame_Content_Size_flag`，据此跳过变长头。
3. 循环读 3 字节 Block_Header（last 位 / type / size），累加块长度直到 last=1。
4. 有 checksum 再加 4 字节 → 得到一个完整帧的边界。
5. 对每帧单独 `zstdDecompressSync`，拼接文本。

解压结果按 `(mtime, size)` 缓存，避免每次搜索重新解压。

替换方案及代价：
- 用带多帧支持的第三方 zstd 绑定：多一个原生依赖，且要处理 ABI。
- 忽略后续帧：等于丢 99% 内容，不可接受。

## 验证

| 检查 | 修复前 | 修复后 |
|---|---|---|
| 5.5 MB 文件解压字符数 | 218 | 15,749,128 |
| 行数 | 1 | 5,745 |
| 全文搜索命中 | 0 | 正常命中 |
| 末尾事件 | 读不到 | 能读到 `session/end-seed` 等尾部事件 |

## 教训

- 对"追加式日志"做全文搜索前，先数魔数确认是不是**单帧**。
- 解压类 API 返回"成功"不代表读全了；用长度/行数与文件大小做交叉校验。
- 自写帧解析器只依赖标准帧结构，比引入原生依赖更省事；解析失败就停，不要伪造数据。

## 复现要点（脱敏）

1. 取一个会话日志：`%USERPROFILE%\.dsh\sessions\--<cwd 编码>--\<id>\session.v4.jsonl.zstd`。
2. `zlib.zstdDecompressSync(buf)` 只得到首个事件。
3. 统计魔数次数得到帧数；按帧边界循环解压后行数与文件行数一致。
