import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../src/server/app.js";

const server = http.createServer(createApp({ rootDir: process.cwd() }));

function start() {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function stop() {
  return new Promise((resolve) => server.close(resolve));
}

async function getJson(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  assert.equal(response.status, 200, pathname);
  return response.json();
}

async function postJson(baseUrl, pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  assert.equal(response.status, 200, pathname);
  return response.json();
}

async function main() {
  const baseUrl = await start();
  const evidence = [];

  try {
    const health = await getJson(baseUrl, "/health");
    assert.equal(health.documents, 10);
    evidence.push(`health: ${health.documents} documents loaded`);

    const v1Cases = [
      ["/v1/search?q=OOM", (payload) => payload.results.some((result) => result.id === "sop-001"), "OOM includes sop-001"],
      [`/v1/search?q=${encodeURIComponent("故障")}`, (payload) => payload.results.length >= 4, "故障 returns multiple SOPs"],
      ["/v1/search?q=replication", (payload) => payload.results.length === 0, "replication script-only term returns empty"],
      ["/v1/search?q=CDN", (payload) => ["sop-003", "sop-010"].every((id) => payload.results.some((result) => result.id === id)), "CDN includes sop-003 and sop-010"],
      ["/v1/search?q=%26", (payload) => payload.results.some((result) => result.snippet.includes("&")), "literal ampersand q=%26 finds visible &"]
    ];

    for (const [pathname, predicate, label] of v1Cases) {
      const payload = await getJson(baseUrl, pathname);
      assert.ok(predicate(payload), label);
      evidence.push(`v1: ${label}`);
    }

    const serviceDown = await getJson(baseUrl, `/v2/search?q=${encodeURIComponent("服务器挂了")}`);
    const serviceTop = serviceDown.results.slice(0, 3).map((result) => result.id);
    assert.ok(serviceTop.includes("sop-001") && serviceTop.includes("sop-004"));
    evidence.push(`v2: 服务器挂了 top3=${serviceTop.join(",")}`);

    const attack = await getJson(baseUrl, `/v2/search?q=${encodeURIComponent("黑客攻击")}`);
    assert.equal(attack.results[0].id, "sop-005");
    evidence.push("v2: 黑客攻击 top1=sop-005");

    const model = await getJson(baseUrl, `/v2/search?q=${encodeURIComponent("机器学习模型出问题")}`);
    assert.equal(model.results[0].id, "sop-008");
    evidence.push("v2: 机器学习模型出问题 top1=sop-008");

    const v3Cases = [
      ["数据库主从延迟超过30秒怎么处理？", ["sop-002.html"]],
      ["服务 OOM 了怎么办？", ["sop-001.html"]],
      ["P0 故障的响应流程是什么？", ["sop-001.html", "sop-004.html", "sop-002.html"]],
      ["怀疑有人入侵了系统", ["sop-005.html"]],
      ["推荐结果质量下降了", ["sop-008.html"]]
    ];

    for (const [message, expectedFiles] of v3Cases) {
      const payload = await postJson(baseUrl, "/v3/chat", { message });
      const files = payload.trace.map((item) => item.args.fname);
      assert.ok(payload.trace.every((item) => item.tool === "readFile"));
      assert.ok(expectedFiles.every((file) => files.includes(file)), message);
      evidence.push(`v3: ${message} -> ${files.join(",")}`);
    }

    for (const pathname of ["/v1", "/v2", "/v3"]) {
      const response = await fetch(`${baseUrl}${pathname}`);
      assert.equal(response.status, 200);
      evidence.push(`frontend: ${pathname} loaded`);
    }

    console.log("Validation passed");
    for (const line of evidence) {
      console.log(`- ${line}`);
    }
  } finally {
    await stop();
  }
}

main().catch(async (error) => {
  console.error("Validation failed");
  console.error(error);
  await stop().catch(() => {});
  process.exitCode = 1;
});
