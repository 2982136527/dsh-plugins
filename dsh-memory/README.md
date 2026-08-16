# dsh-memory

DeepSeek Harness 本地记忆插件：让 agent 自动记住重要信息——用户提供的
用户名/密码等凭据、个人偏好、重要事实——需要时自动回忆。

## 安全承诺

- **数据只保存在本机** `$DSH_HOME/memory/memory.json`（默认 `~/.dsh/memory/memory.json`）
- **没有任何网络请求**：插件只使用 Node 文件系统 API，代码中无 `fetch`/网络调用
- 存储目录权限 `0700`、文件权限 `0600`，仅当前用户可读
- 原子写入（临时文件 + rename），并发写串行化，文件不会损坏

> ⚠️ 注意：记忆文件是**明文 JSON**。密码/token 等敏感信息保存前请知晓：
> 文件虽仅本机可读，但明文落盘意味着任何能读取你主目录的程序都能看到。
> 建议不要保存高价值密码；或仅保存账号名等非敏感部分。

## 工具

| 工具 | 作用 |
|---|---|
| `memory_save` | 保存一条记忆（内容 + 类别 credential/preference/fact/other + 检索标签） |
| `memory_recall` | 按关键词回忆匹配的记忆（可限定类别、条数） |
| `memory_forget` | 删除一条记忆（按 id 或内容） |

自动记忆行为：插件向系统提示注入使用指南——模型在用户提供凭据、偏好、
重要事实时**自动调用 `memory_save`**，后续需要时调用 `memory_recall`。

## 安装

```bash
# 开发机（实时同步）
cd ~/.dsh/profiles/web
pnpm add link:/路径/to/dsh-plugins/dsh-memory

# 其他机器（monorepo 克隆后）
pnpm add file:/路径/to/dsh-plugins/dsh-memory
```

然后在 `~/.dsh/profiles/web/cordis.patch.yml` 末尾加入：

```yaml
- insert:
    - id: dsh-memory
      name: dsh-memory
```

profile 补丁层热加载：**无需重启**，刷新浏览器页面后新会话即可使用。

## 数据格式

```json
{
  "version": 1,
  "updatedAt": "2026-08-16T...",
  "entries": [
    { "id": "...", "content": "用户的 GitHub 用户名是 xxx", "kind": "credential",
      "tags": ["github", "username"], "createdAt": "...", "updatedAt": "..." }
  ]
}
```

## 卸载

```bash
cd ~/.dsh/profiles/web && pnpm remove dsh-memory
# 删除 cordis.patch.yml 中的 dsh-memory insert
```
记忆文件保留（`~/.dsh/memory/memory.json`），如需彻底删除请手动删除该文件。
