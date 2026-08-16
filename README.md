# dsh-plugins

DeepSeek Harness (dsh) 自研插件合集（monorepo）。每个插件是独立的 npm 包，
放在仓库子目录中，克隆后通过 `file:` 安装（pnpm/npm 不支持从 Git 仓库
子目录直接安装，实测确认）。

## 插件列表

| 目录 | 包名 | 作用 |
|---|---|---|
| [dsh-mobile](dsh-mobile/) | dsh-mobile | 移动端页面优化：全宽聊天、侧栏抽屉、输入框紧凑布局、安全区、触控优化 |
| [dsh-search](dsh-search/) | dsh-search | 免 API key 的网络搜索工具（Bing RSS 主、DuckDuckGo 备） |

## 安装（对方机器）

```bash
# 1. 克隆仓库
git clone https://github.com/2982136527/dsh-plugins.git

# 2. 安装 dsh-search（bundle 型，一条命令，自动入列）
dsh plugin --profile web add file:/绝对路径/dsh-plugins/dsh-search

# 3. 安装 dsh-mobile（客户端插件）
cd ~/.dsh/profiles/web
pnpm add file:/绝对路径/dsh-plugins/dsh-mobile
```

然后在 `~/.dsh/profiles/web/cordis.patch.yml` 末尾加入：

```yaml
- insert:
    - id: dsh-mobile
      name: dsh-mobile
```

- dsh-search 重启 `dsh web` 生效；dsh-mobile 刷新页面即生效。
- 更新插件：`git pull` 后重新 `pnpm add file:...`（或直接再跑一次安装命令）。

## 本地开发

```bash
cd ~/.dsh/profiles/web
pnpm add link:/路径/to/dsh-plugins/dsh-mobile
```

`link:` 方式与开发目录保持实时同步（当前机器就是这样装的）。
