# 发布与上架

这份说明覆盖三件事：**查重名、发 GitHub、发 npm / 进市场**。


## 0. 先查重名

npm 包名（2026-11-15 查询）：

```bash
npm view dsh-plugin-prompt-craft version
```

当时返回 **404 Not Found**，说明 `dsh-plugin-prompt-craft` 在 npm 上还没人占用。

发布前再查一次；如果被占了，两个选择：

1. 换名：`dsh-plugin-prompt-craft-neko`、`prompt-craft-dsh` 等；
2. 用 scope：`@你的npm用户名/dsh-plugin-prompt-craft`，然后 `npm publish --access public`。

> GitHub 仓库名和 npm 包名可以不同；用户装 npm 时认的是 `package.json` 里的 `name`。

## 1. 发 GitHub

### 方式 A：网页上传（最省事，适合第一次）

1. GitHub 右上角 **+ → New repository**；
2. 名字填 `dsh-plugin-prompt-craft`，**不要**勾选 “Add a README”（否则会和本地冲突）；
3. 创建后点 **Add file → Upload files**；
4. 把这个目录里的**所有文件和文件夹**拖进去（包括 `.github`、`test`）；
5. 填 commit message，点 **Commit changes**。

网页上传的限制：单文件 25 MB、一次 100 个文件；后续更新要么再上传覆盖，要么改用 Git。

### 方式 B：Git Bash / 命令行（推荐，后面更新方便）

在仓库目录里，先确认 Git 身份；本机当前邮箱是占位，GitHub 不会把提交关联到你：

```bash
git config --global user.name "你的名字"
git config --global user.email "你的GitHub noreply 邮箱"
```

然后：

```bash
git init
git add .
git commit -m "feat: initial prompt-craft plugin"
git branch -M main
git remote add origin https://github.com/lance-maxwell/dsh-plugin-prompt-craft.git
git push -u origin main
```

认证方式三选一：

- **Git Credential Manager**：`git push` 时弹浏览器，用已登录的 GitHub 账号授权（本机已配置 `credential.helper=manager`，最顺）；
- **PAT**：GitHub → Settings → Developer settings → Personal access tokens，用 token 当密码；
- **SSH**：把公钥加到 GitHub，remote 用 `git@github.com:lance-maxwell/dsh-plugin-prompt-craft.git`。

> 先在网页建一个**空仓库**，再 push；不要勾 README，否则要先 `git pull --rebase`。

### 打 tag（给用户钉版本）

```bash
git tag v1.0.2
git push origin v1.0.2
```

用户就能填：

```text
github:lance-maxwell/dsh-plugin-prompt-craft#v1.0.2
```

## 2. 发 npm（想“在市场里按包名装”就走这条）

GitHub 登录不等于 npm 登录；需要单独注册/登录 npm：

```bash
npm login
npm publish --access public
```

发布前会自动跑 `prepublishOnly` 里的测试（`node test/run-tests.mjs`）。

发布后验证：

```bash
npm view dsh-plugin-prompt-craft version
```

用户就能在插件窗口填：

```text
dsh-plugin-prompt-craft
```

### scoped 包

如果换成 `@你的名字/dsh-plugin-prompt-craft`：

```bash
npm publish --access public
```

用户填 `@你的名字/dsh-plugin-prompt-craft`。

## 3. 插件市场怎么上

分清楚两件事：

- **能装**：当前 DSH 的插件管理器接受包名、Git 地址、tarball、本地路径。所以只发 GitHub，用户填 Git 地址就能装。
- **在“市场列表”里出现**：GitHub 不会自动同步到市场。市场通常按 npm 包名/索引解析；要出现在列表里，最稳的是 **发 npm + 按市场的收录方式登记**（如果市场有索引仓库/提交入口，就在那里提一个 PR 或 issue）。

所以：

| 目标 | 做法 |
|---|---|
| 别人拿到地址就能装 | GitHub 发源码 + tag，给 Git 地址 |
| 别人能按包名装 | `npm publish` |
| 别人能在市场里搜到/订阅 | 发 npm，再按市场索引登记（GitHub 只是源码与 Release） |

也可以把 `npm pack` 出的 `.tgz` 挂到 GitHub Release，用户填 tarball 地址安装。

## 4. 发布前检查清单

- [ ] `package.json` 的 `name` 没被占用
- [ ] `repository` / `homepage` / `bugs` 的 URL 正确
- [ ] `node test/run-tests.mjs` 通过
- [ ] `npm pack --dry-run` 里没有 `node_modules`、日志、本机路径
- [ ] 没有 cookie、token、个人路径、聊天记录
- [ ] `files` 包含 `index.js`、`client.js`、`cordis.patch.yml`、`icon.svg`、`README.md`、`LICENSE`
- [ ] 版本号与 tag 一致（`1.0.2` ↔ `v1.0.2`）
- [ ] 在干净的 profile 里试装一次
