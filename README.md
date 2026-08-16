# dsh-plugins

DeepSeek Harness (dsh) 自研插件合集（monorepo）。所有插件为独立的 npm 包，
可通过 Git 子目录直接安装。

## 插件列表

| 目录 | 包名 | 作用 |
|---|---|---|
| [dsh-mobile](dsh-mobile/) | dsh-mobile | 移动端页面优化：全宽聊天、侧栏抽屉、输入框紧凑布局、安全区、触控优化 |
| [dsh-search](dsh-search/) | dsh-search | 免 API key 的网络搜索工具（Bing RSS 主、DuckDuckGo 备） |

## 安装（对方机器）

**dsh-search**（bundle 型，一条命令）：

```bash
dsh plugin --profile web add "git+https://github.com/2982136527/dsh-plugins.git#subdir=dsh-search"
```

**dsh-mobile**：

```bash
cd ~/.dsh/profiles/web
pnpm add "git+https://github.com/2982136527/dsh-plugins.git#subdir=dsh-mobile"
```

然后在 `~/.dsh/profiles/web/cordis.patch.yml` 末尾加入：

```yaml
- insert:
    - id: dsh-mobile
      name: dsh-mobile
```

- dsh-search 重启 `dsh web` 生效；dsh-mobile 刷新页面即生效。
- 详细说明见各插件 README 和 `INSTALL.md`。

## 本地开发

```bash
cd dsh-plugins
pnpm install          # workspace 链接
cd ~/.dsh/profiles/web
pnpm add link:/路径/to/dsh-plugins/dsh-mobile
```
