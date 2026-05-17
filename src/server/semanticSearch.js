import { tokenizeQuery, toSearchResult } from "./keywordSearch.js";

const INTENT_PROFILES = [
  {
    name: "service-down",
    triggers: ["服务器挂", "服务器", "服务挂", "服务不可用", "宕机", "挂了", "超时", "不可用"],
    expansions: [
      "后端",
      "服务",
      "超时",
      "崩溃",
      "可用性",
      "Kubernetes",
      "Pod",
      "网关",
      "Nacos",
      "SRE",
      "基础设施",
      "API Server",
      "Etcd",
      "Ingress",
      "集群"
    ],
    boosts: {
      "sop-001": 80,
      "sop-004": 74
    }
  },
  {
    name: "security-attack",
    triggers: ["黑客", "攻击", "入侵", "安全事件", "被黑", "漏洞", "异常登录"],
    expansions: [
      "信息安全",
      "安全",
      "WAF",
      "DDoS",
      "SQL注入",
      "XSS",
      "CSRF",
      "入侵",
      "漏洞",
      "异常登录",
      "SIEM",
      "攻击"
    ],
    boosts: {
      "sop-005": 110
    }
  },
  {
    name: "model-quality",
    triggers: ["机器学习", "模型", "推荐", "质量下降", "效果下降", "算法", "搜索相关性"],
    expansions: [
      "AI",
      "算法",
      "模型",
      "推荐系统",
      "推荐",
      "模型效果",
      "效果下降",
      "搜索相关性",
      "NLP",
      "GPU",
      "特征",
      "AB实验",
      "推理"
    ],
    boosts: {
      "sop-008": 120
    }
  },
  {
    name: "database-replication",
    triggers: ["数据库", "主从", "复制", "延迟", "DBA", "MySQL", "Redis"],
    expansions: [
      "数据库",
      "DBA",
      "MySQL",
      "主从",
      "复制",
      "延迟",
      "SHOW SLAVE STATUS",
      "GTID",
      "Binlog",
      "pt-table-checksum",
      "连接数"
    ],
    boosts: {
      "sop-002": 110
    }
  },
  {
    name: "network-cdn",
    triggers: ["网络", "CDN", "DNS", "丢包", "负载均衡", "DDoS"],
    expansions: ["网络", "CDN", "DNS", "负载均衡", "BGP", "丢包", "DDoS", "节点", "解析"],
    boosts: {
      "sop-010": 75,
      "sop-003": 30
    }
  }
];

function countTextHits(text, term) {
  const haystack = text.toLowerCase();
  const needle = term.toLowerCase();
  if (!needle) {
    return 0;
  }

  let count = 0;
  let offset = 0;
  while (offset <= haystack.length) {
    const hit = haystack.indexOf(needle, offset);
    if (hit === -1) {
      break;
    }
    count += 1;
    offset = hit + Math.max(needle.length, 1);
  }
  return count;
}

function profileMatches(profile, query) {
  const normalized = query.toLowerCase();
  return profile.triggers.some((trigger) => normalized.includes(trigger.toLowerCase()));
}

function expansionScore(document, terms) {
  return terms.reduce((score, term) => {
    const titleHits = countTextHits(document.title, term);
    const textHits = countTextHits(document.text, term);
    return score + titleHits * 8 + Math.min(textHits, 8) * 1.5;
  }, 0);
}

export function matchedIntentProfiles(query) {
  const trimmed = String(query ?? "").trim();
  if (!trimmed) {
    return [];
  }
  return INTENT_PROFILES.filter((profile) => profileMatches(profile, trimmed));
}

export function semanticSearch(documents, query, options = {}) {
  const trimmed = String(query ?? "").trim();
  if (!trimmed) {
    return [];
  }

  const limit = options.limit ?? 10;
  const profiles = matchedIntentProfiles(trimmed);
  const directTerms = tokenizeQuery(trimmed);
  const expandedTerms = [
    ...directTerms,
    ...profiles.flatMap((profile) => profile.expansions)
  ];

  const results = [];
  for (const document of documents) {
    let score = expansionScore(document, directTerms) * 1.2;

    for (const profile of profiles) {
      score += profile.boosts[document.id] ?? 0;
      score += expansionScore(document, profile.expansions);
    }

    if (score > 0) {
      results.push(toSearchResult(document, trimmed, score, expandedTerms));
    }
  }

  return results
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);
}
