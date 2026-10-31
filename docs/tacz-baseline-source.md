# TACZ 官方基准从哪里来

`tacz_spec` 要能取到官方默认枪包的基准文件（`default_state_machine.lua`、参考动画、
display 文件），供 data-smith 抄字段、供 reviewer 对照。本文件说明它的**真实解析顺序**，
以及每种来源的适用条件和失败表现。

实现：`packages/dsh-tacz-gunpack/lib/official-spec.mjs`。

---

## 1. 解析顺序（本地优先，最后才联网）

`resolveOfficialFile(rel)` 按下面的顺序找**同一个**相对路径，命中即停：

| 顺序 | 来源 | 触发条件 |
|---|---|---|
| 1 | `TACZ_SOURCE` | 环境变量指向一个目录 |
| 2 | `vendor/TACZ` | 工作目录下有 `vendor/TACZ/` |
| 3 | 工作目录本身 | `cwd` 里直接能找到基准文件 |
| 4 | 缓存 | `~/.dsh/tacz-gunpack/spec-cache/<ref>/` 里已有该文件 |
| 5 | GitHub | 前面全落空，才走网络 |

> `TACZ_JAR` 只用于**提示**，不会自动解压：`locate` 会告诉你找到了 jar，
> 需要你解压后把 `TACZ_SOURCE` 指到解压出来的 `assets/tacz`。

### 一个目录里的四种摆法都能认

基准文件在磁盘上的相对位置可能因来源不同而不同，所以每个候选目录会依次试这四层前缀：

```
（目录根）
src/main/resources/assets/tacz/custom/tacz_default_gun/assets/tacz
assets/tacz
custom/tacz_default_gun/assets/tacz
```

也就是说，把整个 TACZ 源码仓库、解压后的 mod jar、或只留 `assets/tacz` 的目录，
丢给 `TACZ_SOURCE` 都能用。

---

## 2. 哪些文件算“基准”

`locate` 用三个文件判定一个目录是不是有效来源：

| 文件 | 用途 |
|---|---|
| `scripts/default_state_machine.lua` | 状态机骨架，管式/双管枪改 reload 的起点 |
| `display/guns/ak47_display.json` | display 字段全集对照（官方字段最多的一把） |
| `animations/ak47.animation.json` | 动画片段名与骨骼命名对照 |

三个里**任意一个**存在，这个目录就会被列为有效来源。

---

## 3. 联网时的行为

只有前四步都没命中才请求 GitHub，目标是官方仓库：

```
MCModderAnchor/TACZ @ 1.20.1
```

- 单文件读取走 GitHub contents API，拿到内容后**写进缓存**，下次离线也能用。
- 缓存里会同时写 `_source.json`，记录 repo / ref / sha / url / 抓取时间。
- 命中 403 会明确提示限流，建议设 `GITHUB_TOKEN` 或改用本地 `TACZ_SOURCE`。
- 文件不存在会报错并建议检查路径。

缓存位置：

```
~/.dsh/tacz-gunpack/spec-cache/<ref>/
```

`ref` 默认 `1.20.1`，可通过 `tacz_spec` 的参数换成别的分支或 tag。

---

## 4. 常用路径

这些是实际会去取的相对路径（都不带 `assets/tacz/` 前缀）：

```
scripts/default_state_machine.lua
display/guns/ak47_display.json
display/guns/m870_display.json
animations/ak47.animation.json
animations/m870.animation.json
```

---

## 5. 为什么不让角色技能里写死绝对路径

技能是可改写、可蒸馏、可跨机器复用的文本。写进 `E:\mine craft\...\tacz_default_gun`
这种绝对路径，换一台机器就失效，还会污染 `LESSONS.md`。

所以规则是：

- 技能里只说“用 `tacz_spec` 取官方基准”；
- 具体路径由 `tacz_spec` 在运行时解析；
- 记录来源时写 `TACZ_SOURCE` / `vendor/TACZ` / `repo@ref#sha`，**不写机器绝对路径**。

`tacz_skill action="learn"` 的 `source` 参数也按这个约定校验。

---

## 6. 取不到基准时怎么办

按顺序试：

1. `tacz_spec action="locate"` — 看它认到了哪些来源、缓存存不存在。
2. 本地有 jar 就先解压，再把 `TACZ_SOURCE` 指过去。
3. 网络可用就让它联网抓一次，之后进缓存。
4. 都没有：**不要凭记忆编字段**。告诉用户缺基准，或者先用 `tacz_spec` 能拿到的那部分做，
   把不确定项标出来等确认。

最后一条是硬约束。基准缺失时编造 display 字段，产出的包一定加载失败，
而且错误会被埋进 JSON 里很难查。
