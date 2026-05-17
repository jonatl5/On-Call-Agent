import assert from "node:assert/strict";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";
import { createApp } from "../src/server/app.js";
import { DocumentStore } from "../src/server/documentStore.js";

let server;
let baseUrl;

async function startServer() {
  const store = new DocumentStore({ dataDir: fileURLToPath(new URL("../data", import.meta.url)) });
  server = http.createServer(createApp({ rootDir: process.cwd(), store }));

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
}

async function getJson(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  assert.equal(response.status, 200);
  return response.json();
}

async function postJson(pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return { response, payload: await response.json() };
}

before(startServer);
after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe("v1 keyword search", () => {
  it("loads documents and ignores script-only words", async () => {
    const health = await getJson("/health");
    assert.equal(health.documents, 10);

    const replication = await getJson("/v1/search?q=replication");
    assert.deepEqual(replication.results, []);
  });

  it("finds required keyword cases from visible text", async () => {
    const oom = await getJson("/v1/search?q=OOM");
    assert.ok(oom.results.some((result) => result.id === "sop-001"));

    const incident = await getJson(`/v1/search?q=${encodeURIComponent("故障")}`);
    assert.ok(incident.results.length >= 4);

    const cdn = await getJson("/v1/search?q=CDN");
    assert.ok(cdn.results.some((result) => result.id === "sop-003"));
    assert.ok(cdn.results.some((result) => result.id === "sop-010"));

    const ampersand = await getJson("/v1/search?q=%26");
    assert.ok(ampersand.results.length > 0);
    assert.ok(ampersand.results.some((result) => result.snippet.includes("&")));
  });

  it("stores or updates documents through POST /v1/documents", async () => {
    const { response, payload } = await postJson("/v1/documents", {
      id: "custom-sop",
      html: "<!doctype html><title>Custom SOP</title><main><p>Visible custom signal</p><script>hiddenOnlyNeedle</script></main>"
    });

    assert.equal(response.status, 201);
    assert.deepEqual(payload, { id: "custom-sop", title: "Custom SOP" });

    const visible = await getJson("/v1/search?q=custom%20signal");
    assert.ok(visible.results.some((result) => result.id === "custom-sop"));

    const hidden = await getJson("/v1/search?q=hiddenOnlyNeedle");
    assert.equal(hidden.results.some((result) => result.id === "custom-sop"), false);
  });
});

describe("v2 semantic search", () => {
  it("returns backend and infrastructure SOPs near the top for server-down language", async () => {
    const payload = await getJson(`/v2/search?q=${encodeURIComponent("服务器挂了")}`);
    const topIds = payload.results.slice(0, 3).map((result) => result.id);
    assert.ok(topIds.includes("sop-001"));
    assert.ok(topIds.includes("sop-004"));
  });

  it("routes attack and model-quality language to the right SOPs", async () => {
    const attack = await getJson(`/v2/search?q=${encodeURIComponent("黑客攻击")}`);
    assert.equal(attack.results[0].id, "sop-005");

    const model = await getJson(`/v2/search?q=${encodeURIComponent("机器学习模型出问题")}`);
    assert.equal(model.results[0].id, "sop-008");
  });
});

describe("v3 on-call assistant", () => {
  async function chat(message) {
    const { response, payload } = await postJson("/v3/chat", { message });
    assert.equal(response.status, 200);
    assert.ok(payload.answer.length > 80);
    assert.ok(payload.trace.length >= 1);
    assert.ok(payload.trace.every((item) => item.tool === "readFile"));
    return payload;
  }

  it("exposes exactly one runtime tool", async () => {
    const payload = await getJson("/v3/tools");
    assert.deepEqual(payload.tools.map((tool) => tool.name), ["readFile"]);
  });

  it("reads expected SOPs for validation questions", async () => {
    const db = await chat("数据库主从延迟超过30秒怎么处理？");
    assert.ok(db.trace.some((item) => item.args.fname === "sop-002.html"));
    assert.match(db.answer, /主从|复制|延迟/u);

    const oom = await chat("服务 OOM 了怎么办？");
    assert.ok(oom.trace.some((item) => item.args.fname === "sop-001.html"));
    assert.match(oom.answer, /OOM|OutOfMemory|内存/u);

    const p0 = await chat("P0 故障的响应流程是什么？");
    assert.ok(p0.trace.length >= 3);
    assert.match(p0.answer, /升级|P0|负责人/u);

    const security = await chat("怀疑有人入侵了系统");
    assert.ok(security.trace.some((item) => item.args.fname === "sop-005.html"));
    assert.match(security.answer, /安全|入侵|攻击/u);

    const model = await chat("推荐结果质量下降了");
    assert.ok(model.trace.some((item) => item.args.fname === "sop-008.html"));
    assert.match(model.answer, /推荐|模型|效果/u);
  });
});

describe("frontend pages", () => {
  it("loads v1, v2, and v3 pages", async () => {
    for (const pathname of ["/v1", "/v2", "/v3"]) {
      const response = await fetch(`${baseUrl}${pathname}`);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /On-Call Assistant/);
    }
  });
});
