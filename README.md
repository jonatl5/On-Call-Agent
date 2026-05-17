# On-Call Assistant 项目说明

## 技术方案

本项目实现了一个本地可运行的 On-Call Assistant Web 应用，使用 Node.js 原生能力完成 HTTP 服务、接口路由、测试和校验脚本。项目不依赖数据库、外部 API、付费模型或远程 embedding 服务，所有搜索和问答逻辑都基于 `data/` 目录中的本地 SOP HTML 文件。

整体分为三个阶段：

- `/v1`：关键词搜索。解析 SOP HTML，提取可见正文和标题，支持中英文关键词检索，并返回 `id`、`title`、`snippet`、`score`。
- `/v2`：语义搜索。使用确定性的意图词表、同义词扩展和轻量评分规则，让用户不必完全输入文档原词也能找到相关 SOP。
- `/v3`：On-Call 对话 Agent。根据用户问题选择相关 SOP 文件，通过唯一工具 `readFile(fname)` 读取文件，再基于读取内容生成处理建议，并在响应和页面中展示工具调用轨迹。

## 实现思路

1. HTML 解析层位于 `src/server/htmlParser.js`，会移除 `script`、`style`、`noscript`、隐藏内容等非正文区域，解码 HTML entity，并保留中英文可检索文本。
2. 文档索引层位于 `src/server/documentStore.js`，服务启动时加载 `data/` 下的 `.html` 文件，生成统一的文档对象。
3. `/v1` 使用 `src/server/keywordSearch.js` 做大小写不敏感的关键词匹配、打分和片段生成。
4. `/v2` 使用 `src/server/semanticSearch.js` 做确定性语义匹配，例如“服务器挂了”会优先命中后端服务和 SRE SOP，“黑客攻击”会优先命中信息安全 SOP。
5. `/v3` 使用 `src/server/onCallAgent.js` 实现 Agent。运行时只暴露一个工具：

```text
readFile(fname: string) -> string
```

Agent 不能列目录、不能使用通配符、不能调用 shell，也不能读取 `data/` 目录外的路径。所有被用于回答的文件都会通过 `readFile` 读取，并出现在 `trace` 字段和前端工具调用展示中。

## 运行方式

```text
npm install
npm run dev
```

启动后访问：

- `http://localhost:3000/v1`
- `http://localhost:3000/v2`
- `http://localhost:3000/v3`

## 测试与验证

```text
npm test
npm run validate
```

验证覆盖内容包括：

- `/v1/search?q=OOM` 能命中 `sop-001`
- `/v1/search?q=故障` 返回多个 SOP
- `/v1/search?q=replication` 不会命中只出现在脚本中的内容
- `/v1/search?q=CDN` 能命中 `sop-003` 和 `sop-010`
- `/v1/search?q=%26` 能搜索可见正文中的 `&`
- `/v2/search?q=服务器挂了` 将 `sop-001` 和 `sop-004` 排在前列
- `/v2/search?q=黑客攻击` 优先命中 `sop-005`
- `/v2/search?q=机器学习模型出问题` 优先命中 `sop-008`
- `/v3/chat` 对指定 On-Call 问题返回带 `readFile` 轨迹的回答
- `/v1`、`/v2`、`/v3` 页面可以正常加载

## 关于打包要求

题目中“打包整个 Git 仓库（包含 `.git` 目录），确保提交历史完整可追溯”的意思是：最终提交时不要只压缩源码文件，也不要删除隐藏的 `.git/` 目录，而是把整个项目文件夹一起压缩成 `.zip`。

这样评审方解压后可以运行：

```text
git log
git status
```

来查看提交历史、提交作者、提交时间和完整版本记录。

如果需要按题目结构提交，可以在最终压缩包外层组织为：

```text
your-name/
├── code/          # 放整个 Git 仓库，包含 .git 目录
├── prompt/        # 放与 AI 交互过程中的提示词截图
├── screenshot/    # 放最终产品运行效果截图
└── README.md      # 本说明文件或其副本
```

其中 `code/` 目录应包含完整项目，例如 `src/`、`data/`、`test/`、`package.json`、`.git/` 等。
