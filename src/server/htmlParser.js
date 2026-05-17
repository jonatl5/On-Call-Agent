const INVISIBLE_BLOCK_TAGS = ["script", "style", "noscript", "template", "svg"];

const BLOCK_TAG_RE =
  /<\/?(address|article|aside|blockquote|br|dd|details|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)\b[^>]*>/gi;

const NAMED_ENTITIES = {
  amp: "&",
  apos: "'",
  colon: ":",
  comma: ",",
  commat: "@",
  gt: ">",
  hellip: "...",
  laquo: "<<",
  larr: "<-",
  ldquo: "\"",
  lt: "<",
  mdash: "-",
  nbsp: " ",
  ndash: "-",
  period: ".",
  quot: "\"",
  raquo: ">>",
  rarr: "->",
  rdquo: "\"",
  semi: ";"
};

export function decodeHtmlEntities(value = "") {
  return String(value).replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]+);/gi, (match, entity) => {
    if (entity[0] === "#") {
      const isHex = entity[1]?.toLowerCase() === "x";
      const rawCode = isHex ? entity.slice(2) : entity.slice(1);
      const codePoint = Number.parseInt(rawCode, isHex ? 16 : 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function stripTagBlocks(html, tagName) {
  const blockRe = new RegExp(`<\\s*${tagName}\\b[^>]*>[\\s\\S]*?<\\s*\\/\\s*${tagName}\\s*>`, "gi");
  return html.replace(blockRe, " ");
}

function stripHiddenBlocks(html) {
  let output = html;
  const hiddenBlockRe =
    /<([a-z][\w:-]*)\b(?=[^>]*(?:\bhidden\b|aria-hidden\s*=\s*["']?true|style\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)))[^>]*>[\s\S]*?<\/\1\s*>/gi;

  for (let i = 0; i < 4; i += 1) {
    output = output.replace(hiddenBlockRe, " ");
  }

  return output;
}

export function stripInvisibleMarkup(html = "") {
  let output = String(html).replace(/<!--[\s\S]*?-->/g, " ");

  for (const tagName of INVISIBLE_BLOCK_TAGS) {
    output = stripTagBlocks(output, tagName);
  }

  return stripHiddenBlocks(output);
}

function stripTags(fragment = "") {
  return fragment.replace(BLOCK_TAG_RE, " ").replace(/<[^>]+>/g, " ");
}

function normalizeWhitespace(text = "") {
  return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export function extractTitle(html = "", fallback = "Untitled document") {
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const h1Match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const rawTitle = titleMatch?.[1] || h1Match?.[1] || fallback;
  return normalizeWhitespace(decodeHtmlEntities(stripTags(rawTitle))) || fallback;
}

export function parseHtmlDocument(html = "", options = {}) {
  const source = String(html);
  const visibleHtml = stripInvisibleMarkup(source);
  const bodyMatch = visibleHtml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const bodyHtml = bodyMatch?.[1] ?? visibleHtml;
  const text = normalizeWhitespace(decodeHtmlEntities(stripTags(bodyHtml)));
  const title = extractTitle(visibleHtml, options.id || options.filename || "Untitled document");
  const filename = options.filename ?? null;
  const id = options.id ?? (filename ? filename.replace(/\.html$/i, "") : null);

  return {
    id,
    filename,
    title,
    text,
    searchableText: normalizeWhitespace(`${title} ${text}`)
  };
}

export function createSnippet(text = "", queryTerms = [], maxLength = 180) {
  const normalizedText = normalizeWhitespace(text);
  if (!normalizedText) {
    return "";
  }

  const lowerText = normalizedText.toLowerCase();
  const terms = queryTerms
    .map((term) => String(term ?? "").trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  let hitIndex = -1;
  for (const term of terms) {
    const index = lowerText.indexOf(term.toLowerCase());
    if (index >= 0 && (hitIndex === -1 || index < hitIndex)) {
      hitIndex = index;
    }
  }

  const center = hitIndex >= 0 ? hitIndex : 0;
  const start = Math.max(0, center - Math.floor(maxLength / 3));
  const end = Math.min(normalizedText.length, start + maxLength);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < normalizedText.length ? "..." : "";

  return `${prefix}${normalizedText.slice(start, end).trim()}${suffix}`;
}
