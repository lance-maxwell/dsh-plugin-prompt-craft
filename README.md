# dsh-plugin-prompt-craft

把输入框里凌乱、冗长、不通顺的文字，改写成通俗易懂、排版工整的提示词，然后一键注入会话，让 AI 按提示词工作。

**唯一硬约束：只调整表达，绝不省略、绝不曲解原文的本意。**

## 功能

- **对话框内的按钮**：位于输入框左下工具行（`conversation.input.left`），紧挨附件与计划按钮。
- **四种模式**：标准 / 精简 / 详细 / 结构化。点模式即改写，结果实时预览。
- **一键注入**：「注入并发送」直接把改写结果写进输入框并发送；「仅填入输入框」只填充、等你确认。
- **保真校验**：原文里的数字、英文标识符/路径、引号内内容会被逐一核对；漏了会补在「原文细节（照抄）」里，漏太多则自动改用本地保真模式。
- **两个引擎**：
  - `模型改写`：走当前 profile 的 Agent 默认模型（或行配置里指定的 provider/model），做真正的重写润色。
  - `本地保真`：纯本地重排 + 补标题，一个字都不改，离线可用，也是模型不可信时的兜底。
- **快捷键**：面板内 `Esc` 关闭，`Ctrl/Cmd + Enter` 重新改写。

## 安装

### 方式一：从 GitHub 装（推荐先试）

在 DSH 的插件窗口里选「添加插件」，填 Git 地址：

```text
github:lance-maxwell/dsh-plugin-prompt-craft
```

或者：

```text
https://github.com/lance-maxwell/dsh-plugin-prompt-craft
```

如果钉版本，用 tag：

```text
github:lance-maxwell/dsh-plugin-prompt-craft#v1.0.0
```

> 当前 DSH 的插件管理器接受包名、Git 地址、tarball 和本地路径；GitHub 仓库根目录必须就是包根。

### 方式二：从 npm 装（发布后）

```text
dsh-plugin-prompt-craft
```

或指定版本：

```text
dsh-plugin-prompt-craft@1.0.0
```

### 方式三：本地目录

在插件窗口里填这个目录的绝对路径，例如：

```text
C:\path\to\prompt-craft-repo
```

安装后**完全退出 DSH 再启动**（桌面端从托盘退出），刷新页面，输入框左下工具行会出现 `✨ 提示词`。

## 使用

1. 在输入框里写下草稿，哪怕很乱。
2. 点 `✨ 提示词`，选「标准 / 精简 / 详细 / 结构化」。
3. 看预览：
   - 「注入并发送」：直接替换输入框并发送；
   - 「仅填入输入框」：只填充，你自己再改。
4. `Esc` 关闭；`Ctrl/Cmd + Enter` 重新改写。

## 配置模型

默认用当前 profile 的 Agent 默认模型。想固定改写用的模型，在 `cordis.patch.yml` 的插入行里加 `config`：

```yaml
- insert:
    - id: prompt-craft
      name: dsh-plugin-prompt-craft
      config:
        provider: deepseek-official
        model: deepseek-flash
```

改完重启 DSH 生效。

## 工作方式

- 宿主半侧只注册一个 Fetch 路由：`POST /api/prompt-craft`。
- 请求体：`{ endpoint, payload }`。
  - `polish`：`{ text, mode }`，走模型改写；
  - `local`：`{ text, mode }`，强制本地保真；
  - `describe`：`{}`，返回模式、路由与引擎信息。
- 不注册任何模型可调用的工具：这是给用户的按钮，不是第二个入口。
- 客户端半侧通过 `dsh.client`（`platform: web`）注入输入框工具行；桌面端加载的是同一套 Web UI。

## 开发与测试

纯 JavaScript，无原生依赖、无需构建，Node ≥ 20。

```bash
node test/run-tests.mjs
```

期望：`PASS — 139/139 assertions`。

## 发布

见 [PUBLISHING.md](./PUBLISHING.md)：GitHub 建仓、npm 发布、版本 tag、市场收录说明。

## 目录

```text
.
├─ index.js              # 宿主半侧：/api/prompt-craft
├─ client.js             # 客户端半侧：输入框按钮与面板
├─ cordis.patch.yml      # DSH bundle patch
├─ icon.svg
├─ test/run-tests.mjs
├─ README.md
├─ PUBLISHING.md
├─ CHANGELOG.md
└─ LICENSE
```

## License

MIT。见 [LICENSE](./LICENSE)。
