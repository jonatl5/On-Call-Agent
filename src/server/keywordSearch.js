import { createSnippet } from "./htmlParser.js";

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function tokenizeQuery(query = "") {
  const trimmed = String(query ?? "").trim();
  if (!trimmed) {
    return [];
  }

  const tokens = trimmed.match(/[a-zA-Z0-9_+#.-]+|[\p{Script=Han}]+|[^\s]/gu) ?? [];
  return unique([trimmed, ...tokens.map((token) => token.trim())]);
}

function countOccurrences(text, term) {
  if (!term) {
    return 0;
  }

  let count = 0;
  let index = 0;

  while (index <= text.length) {
    const hit = text.indexOf(term, index);
    if (hit === -1) {
      break;
    }
    count += 1;
    index = hit + Math.max(term.length, 1);
  }

  return count;
}

export function keywordScore(document, query) {
  const terms = tokenizeQuery(query);
  if (terms.length === 0) {
    return 0;
  }

  const lowerTitle = document.title.toLowerCase();
  const lowerText = document.text.toLowerCase();
  const exact = String(query).trim().toLowerCase();
  let score = 0;

  for (const term of terms) {
    const lowerTerm = term.toLowerCase();
    const titleHits = countOccurrences(lowerTitle, lowerTerm);
    const textHits = countOccurrences(lowerText, lowerTerm);
    const termWeight = term.length === 1 ? 0.75 : Math.min(4, Math.max(1, term.length / 2));

    score += titleHits * 12 * termWeight;
    score += textHits * termWeight;
  }

  if (exact && lowerTitle.includes(exact)) {
    score += 20;
  }
  if (exact && lowerText.includes(exact)) {
    score += 8;
  }

  return score;
}

export function toSearchResult(document, query, score, snippetTerms = tokenizeQuery(query)) {
  return {
    id: document.id,
    title: document.title,
    snippet: createSnippet(document.text, snippetTerms),
    score: Number(score.toFixed(3))
  };
}

export function keywordSearch(documents, query, options = {}) {
  const limit = options.limit ?? 10;
  const results = [];

  for (const document of documents) {
    const score = keywordScore(document, query);
    if (score > 0) {
      results.push(toSearchResult(document, query, score));
    }
  }

  return results
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);
}
