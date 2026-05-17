# On-Call Assistant

Minimal Node.js implementation of the three-phase On-Call Assistant from the supplied `AGENTS.md`.

Assumption: no project `README.md` existed when implementation began, so the supplied `AGENTS.md` was used as the effective source of truth.

## Commands

```text
install: npm install
dev: npm run dev
test: npm test
validate: npm run validate
```

The app uses only Node.js built-ins and does not require a network service, paid API, database, or embedding provider.

## Routes

- `GET /v1` renders the keyword-search page.
- `POST /v1/documents` stores or updates an in-memory document. Send JSON with `{ "id": "custom-sop", "html": "<html>...</html>" }`; response is `201` with `{ "id", "title" }`.
- `GET /v1/search?q={query}` returns `{ "query", "results" }`.
- `GET /v2` renders the semantic-search page.
- `GET /v2/search?q={query}` returns `{ "query", "results" }`.
- `GET /v3` renders the on-call chat page.
- `POST /v3/chat` accepts `{ "message": "..." }` and returns `{ "message", "route", "answer", "trace", "tools" }`.
- `GET /v3/tools` returns the runtime agent tool list.

Search results contain `id`, `title`, `snippet`, and `score`.

## Parser Behavior

The shared parser extracts visible body text, extracts a useful title, decodes HTML entities, preserves Chinese and English text, and removes `script`, `style`, `noscript`, `template`, SVG, comments, and practical hidden blocks before indexing.

The literal ampersand search should use `q=%26`. A raw `q=&` is parsed by standard URL semantics as an empty query.

## v3 Tool Constraint

The runtime assistant exposes exactly one user-facing tool:

```text
readFile(fname: string) -> string
```

`readFile` accepts only a filename under `data/`, rejects path traversal through filename normalization, and is the only tool shown in `/v3/tools` and chat response traces. The routing layer is deterministic and every SOP used in an answer is read through `readFile`.

## Validation Coverage

`npm test` and `npm run validate` cover:

- `/v1/search?q=OOM` includes `sop-001`.
- `/v1/search?q=故障` returns multiple SOPs.
- `/v1/search?q=replication` returns empty because the term appears only in script text.
- `/v1/search?q=CDN` includes `sop-003` and `sop-010`.
- `/v1/search?q=%26` finds visible ampersands.
- `/v2/search?q=服务器挂了` ranks `sop-001` and `sop-004` near the top.
- `/v2/search?q=黑客攻击` ranks `sop-005` first.
- `/v2/search?q=机器学习模型出问题` ranks `sop-008` first.
- `/v3/chat` reads the expected SOP files for the five required validation questions and returns visible `readFile` traces.
- `/v1`, `/v2`, and `/v3` frontend pages load.
