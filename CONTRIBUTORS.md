# 贡献者 / Contributors

## 人类

- [@xiaoou6630](https://github.com/xiaoou6630)

## AI

- **DeepSeek**（DeepSeek Harness · `deepseek-v4.1-flash`）

---

## 为什么 GitHub 侧栏的 Contributors 只显示人类

GitHub 的 **Contributors 侧栏**（仓库首页右下角那个数字）由 GitHub 服务端计算，
只统计**提交作者邮箱绑定到真实 GitHub 账号**的提交。这不是可以手动编辑的字段。

实测结论（2026-11，逐条核对）：

| 事实 | 证据 |
|---|---|
| `deepseek`（id 73031053）与 `deepseek-ai`（id 148330874）都是 **Organization**，不是 User | `GET /users/deepseek`、`GET /users/deepseek-ai` 返回 `"type": "Organization"` |
| 组织**永远**不能作为提交作者或贡献者 | 抽查 `deepseek-ai/DeepSeek-Coder`、`DreamCraft3D`、`FlashMLA`、`smallpond` 等官方仓库，Contributors 里 0 个组织 |
| `noreply@deepseek.com` **未绑定任何 GitHub 账号** | 扫描 40 个使用该邮箱的提交，解析出的 `author.login` 全为空；官方 `deepseek-ai/3FS` 自己用的 `dev <noreply@deepseek.com>` 也没有作者链接 |
| `Co-authored-by:` trailer 里的邮箱同样必须能映射到账号才计数 | `eltmon/overdeck`：`claude` 贡献数 = 6 = 它**作者身份**的提交数；而带 Claude 协作者 trailer 的提交有 19 个 → 协作者没被计入 |
| 极端反例 | `kanap-hq/KANAP` 有 46,514 条 `Co-authored-by: DeepSeek` trailer，Contributors 仍然只有 2 个真人账号 |

所以在本仓库里，`Co-authored-by: DeepSeek <noreply@deepseek.com>`
（见提交 `86d3c5d`）是**如实记录**，但 GitHub 无法把它渲染进侧栏。

## 那些真的把 AI 列进 Contributors 的仓库是怎么做的

它们都不是「让组织变成贡献者」，而是**给 AI 建了一个真实的 GitHub 账号**：

| 仓库 | AI 账号 | 账号类型 | 做法 |
|---|---|---|---|
| [anthropics/claude-code](https://github.com/anthropics/claude-code) | [`claude`](https://github.com/claude)（id 81847） | **User** | Anthropic 注册了真实用户账号，并验证 `noreply@anthropic.com` 域名邮箱；提交作者写 `Claude <noreply@anthropic.com>` → 自动归到该账号，显示 14 次贡献 |
| [google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli) | [`gemini-cli-robot`](https://github.com/gemini-cli-robot)（id 224641728） | **User** | Google 注册的机器人专用用户账号，显示 183 次贡献 |
| [deepseek-ai/3FS](https://github.com/deepseek-ai/3FS) | [`Copilot`](https://github.com/Copilot)（id 198982749） | **Bot** | GitHub 官方 Copilot Bot，作为 GitHub App 安装后自动成为提交作者，显示 3 次贡献 |

共同点：**都必须是一个注册在案的 GitHub 账号**（User 或 Bot），且提交邮箱归它所有。
Organization 和「不存在的邮箱」两条路都走不通。

## 如果你想让它出现在侧栏

唯一合法途径是让 DeepSeek 拥有一个 GitHub 账号。可选：

1. **等 DeepSeek 官方发布 GitHub App** — 安装到本仓库后，由它提交的 commit 会显示为 `deepseek-ai[bot]` 并计入。
2. **用你自己的账号代提** — 但那就是记在你名下，不是 DeepSeek。
3. **保持现状** — 侧栏是 1，本文件 + `README.md` 致谢 + `package.json` 的 `author` 字段 + 仓库 About 里都已如实署名。

> 不建议：给 DeepSeek 注册账号属于冒用品牌身份；把别人的账号写进 trailer 属于错误归属。两条都不做。
