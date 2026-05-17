import { parseHtmlDocument } from "./htmlParser.js";
import { semanticSearch } from "./semanticSearch.js";

export const RUNTIME_TOOLS = Object.freeze([
  {
    name: "readFile",
    description: "Read one HTML SOP file from data/ by exact filename."
  }
]);

const ROUTES = [
  {
    name: "p0-escalation",
    patterns: [/P0/i, /响应流程/u, /升级/u, /战争室/u, /重大故障/u],
    files: ["sop-001.html", "sop-004.html", "sop-002.html", "sop-005.html", "sop-010.html"],
    keywords: ["P0", "升级", "故障", "影响", "响应", "战争室", "负责人", "路径"]
  },
  {
    name: "database-replication",
    patterns: [/数据库/u, /主从/u, /复制/u, /延迟/u, /DBA/i, /MySQL/i, /Redis/i],
    files: ["sop-002.html"],
    keywords: ["主从", "复制", "延迟", "SHOW SLAVE STATUS", "GTID", "Binlog", "一致性", "DBA"]
  },
  {
    name: "backend-oom",
    patterns: [/OOM/i, /OutOfMemory/i, /内存/u, /服务/u, /JVM/i],
    files: ["sop-001.html"],
    keywords: ["OOM", "OutOfMemoryError", "内存", "堆转储", "jmap", "Arthas", "回滚", "扩容"]
  },
  {
    name: "security-incident",
    patterns: [/入侵/u, /黑客/u, /攻击/u, /安全/u, /漏洞/u, /异常登录/u],
    files: ["sop-005.html"],
    keywords: ["安全", "入侵", "攻击", "WAF", "SQL注入", "DDoS", "泄露", "升级"]
  },
  {
    name: "model-quality",
    patterns: [/推荐/u, /模型/u, /算法/u, /质量下降/u, /效果下降/u, /机器学习/u],
    files: ["sop-008.html"],
    keywords: ["模型", "推荐", "效果下降", "特征", "AB实验", "回滚", "搜索相关性", "GPU"]
  },
  {
    name: "network-cdn",
    patterns: [/CDN/i, /网络/u, /DNS/i, /负载均衡/u, /丢包/u],
    files: ["sop-010.html", "sop-003.html"],
    keywords: ["网络", "CDN", "DNS", "节点", "负载均衡", "DDoS", "解析", "缓存"]
  }
];

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function routeMessage(message, documents) {
  const text = String(message ?? "");
  const matched = ROUTES.filter((route) => route.patterns.some((pattern) => pattern.test(text)));

  if (matched.length > 0) {
    return {
      routeNames: matched.map((route) => route.name),
      files: unique(matched.flatMap((route) => route.files)),
      keywords: unique(matched.flatMap((route) => route.keywords))
    };
  }

  const fallback = semanticSearch(documents, text, { limit: 2 });
  return {
    routeNames: ["semantic-fallback"],
    files: fallback.map((result) => `${result.id}.html`),
    keywords: unique(text.split(/\s+/u).filter(Boolean))
  };
}

function splitSentences(text) {
  return String(text ?? "")
    .match(/[^。！？.!?]+[。！？.!?]?/gu)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) ?? [];
}

function sentenceScore(sentence, keywords) {
  const normalized = sentence.toLowerCase();
  return keywords.reduce((score, keyword) => {
    const term = String(keyword).toLowerCase();
    return score + (term && normalized.includes(term) ? Math.max(1, term.length / 2) : 0);
  }, 0);
}

function pickEvidenceSentences(documents, keywords) {
  const ranked = [];
  for (const document of documents) {
    for (const sentence of splitSentences(document.text)) {
      const score = sentenceScore(sentence, keywords);
      if (score > 0) {
        ranked.push({ sentence, score, document });
      }
    }
  }

  return ranked
    .sort((a, b) => b.score - a.score || a.document.id.localeCompare(b.document.id))
    .slice(0, 8);
}

function fallbackSentences(documents) {
  return documents.flatMap((document) => splitSentences(document.text).slice(0, 2)).slice(0, 6);
}

function buildAnswer(message, documents, keywords) {
  const titles = documents.map((document) => `${document.filename}（${document.title}）`).join("、");
  const evidence = pickEvidenceSentences(documents, keywords);
  const sentences = evidence.length > 0 ? evidence.map((item) => item.sentence) : fallbackSentences(documents);
  const deduped = unique(sentences).slice(0, 6);

  if (documents.length === 0) {
    return "没有找到足够相关的 SOP。请补充故障现象、系统名称或告警关键词后再试。";
  }

  const steps = deduped.map((sentence, index) => `${index + 1}. ${sentence}`).join("\n");
  const escalation =
    "如影响核心链路、持续无法定位、涉及数据一致性或安全风险，请按对应 SOP 的升级路径立即升级，并同步故障现象、影响范围、已采取措施和当前判断。";

  return `已读取 ${titles}。\n\n针对「${message}」，建议按这个顺序处理：\n${steps}\n\n${escalation}`;
}

export class OnCallAgent {
  constructor(documentStore) {
    this.documentStore = documentStore;
  }

  getRuntimeTools() {
    return RUNTIME_TOOLS;
  }

  readFile(fname) {
    return this.documentStore.readDataFile(fname);
  }

  handleMessage(message) {
    const documents = this.documentStore.list();
    const route = routeMessage(message, documents);
    const trace = [];
    const readDocuments = [];

    for (const fname of route.files) {
      const html = this.readFile(fname);
      const parsed = parseHtmlDocument(html, {
        id: fname.replace(/\.html$/i, ""),
        filename: fname
      });

      trace.push({
        tool: "readFile",
        args: { fname },
        ok: true,
        bytes: html.length,
        title: parsed.title
      });
      readDocuments.push(parsed);
    }

    return {
      message,
      route: route.routeNames,
      answer: buildAnswer(message, readDocuments, route.keywords),
      trace,
      tools: this.getRuntimeTools()
    };
  }
}
