import fs from "node:fs";
import path from "node:path";
import { DocumentStore } from "./documentStore.js";
import { keywordSearch } from "./keywordSearch.js";
import { semanticSearch } from "./semanticSearch.js";
import { OnCallAgent } from "./onCallAgent.js";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const HTML_HEADERS = { "content-type": "text/html; charset=utf-8" };

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, JSON_HEADERS);
  response.end(JSON.stringify(payload));
}

function sendHtml(response, statusCode, html) {
  response.writeHead(statusCode, HTML_HEADERS);
  response.end(html);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function readFrontendPage(rootDir, filename) {
  return fs.readFileSync(path.join(rootDir, "src", "frontend", filename), "utf8");
}

function parseJsonBody(raw) {
  if (!raw.trim()) {
    return {};
  }

  return JSON.parse(raw);
}

export function createApp(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const store = options.store ?? new DocumentStore({ dataDir: path.join(rootDir, "data") });
  const agent = options.agent ?? new OnCallAgent(store);

  return async function app(request, response) {
    const url = new URL(request.url, "http://localhost");

    try {
      if (request.method === "GET" && url.pathname === "/") {
        response.writeHead(302, { location: "/v1" });
        response.end();
        return;
      }

      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, { ok: true, documents: store.list().length });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1") {
        sendHtml(response, 200, readFrontendPage(rootDir, "v1.html"));
        return;
      }

      if (request.method === "GET" && url.pathname === "/v2") {
        sendHtml(response, 200, readFrontendPage(rootDir, "v2.html"));
        return;
      }

      if (request.method === "GET" && url.pathname === "/v3") {
        sendHtml(response, 200, readFrontendPage(rootDir, "v3.html"));
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/search") {
        const query = url.searchParams.get("q") ?? "";
        sendJson(response, 200, {
          query,
          results: query.trim() ? keywordSearch(store.list(), query) : []
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/documents") {
        const raw = await readBody(request);
        const contentType = request.headers["content-type"] ?? "";
        const payload = contentType.includes("application/json") ? parseJsonBody(raw) : {};
        const id = payload.id ?? url.searchParams.get("id");
        const html = payload.html ?? payload.content ?? raw;

        if (!id || !String(html).trim()) {
          sendJson(response, 400, {
            error: "POST /v1/documents requires an id and html/content."
          });
          return;
        }

        const document = store.upsert({ id, html });
        sendJson(response, 201, { id: document.id, title: document.title });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v2/search") {
        const query = url.searchParams.get("q") ?? "";
        sendJson(response, 200, {
          query,
          results: query.trim() ? semanticSearch(store.list(), query) : []
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v3/chat") {
        const raw = await readBody(request);
        const payload = parseJsonBody(raw);
        const message = String(payload.message ?? "");

        if (!message.trim()) {
          sendJson(response, 400, { error: "POST /v3/chat requires a non-empty message." });
          return;
        }

        sendJson(response, 200, agent.handleMessage(message));
        return;
      }

      if (request.method === "GET" && url.pathname === "/v3/tools") {
        sendJson(response, 200, { tools: agent.getRuntimeTools() });
        return;
      }

      sendJson(response, 404, { error: "Not found" });
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
  };
}
