import fs from "node:fs";
import path from "node:path";
import { parseHtmlDocument } from "./htmlParser.js";

const FILENAME_RE = /^[a-zA-Z0-9._-]+\.html$/;

function toDocumentId(filename) {
  return path.basename(filename, path.extname(filename));
}

export function normalizeDocumentFilename(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    throw new Error("Document id is required.");
  }

  const basename = path.basename(raw);
  const filename = basename.toLowerCase().endsWith(".html") ? basename : `${basename}.html`;

  if (!FILENAME_RE.test(filename)) {
    throw new Error("Document id may only contain letters, numbers, dot, underscore, and dash.");
  }

  return filename;
}

export class DocumentStore {
  constructor(options = {}) {
    this.dataDir = path.resolve(options.dataDir ?? path.join(process.cwd(), "data"));
    this.documents = new Map();
    this.loadFromDisk();
  }

  loadFromDisk() {
    this.documents.clear();

    if (!fs.existsSync(this.dataDir)) {
      return;
    }

    const filenames = fs
      .readdirSync(this.dataDir)
      .filter((filename) => FILENAME_RE.test(filename))
      .sort((a, b) => a.localeCompare(b));

    for (const filename of filenames) {
      const html = fs.readFileSync(path.join(this.dataDir, filename), "utf8");
      this.upsert({ id: filename, html, filename, source: "disk" });
    }
  }

  upsert({ id, html, filename, source = "memory" }) {
    const normalizedFilename = normalizeDocumentFilename(filename ?? id);
    const documentId = toDocumentId(normalizedFilename);
    const parsed = parseHtmlDocument(String(html ?? ""), {
      id: documentId,
      filename: normalizedFilename
    });
    const document = {
      ...parsed,
      source,
      updatedAt: new Date().toISOString()
    };

    this.documents.set(document.id, document);
    return document;
  }

  list() {
    return Array.from(this.documents.values()).sort((a, b) => a.id.localeCompare(b.id));
  }

  get(id) {
    const normalizedId = String(id ?? "").replace(/\.html$/i, "");
    return this.documents.get(normalizedId) ?? null;
  }

  readDataFile(filename) {
    const normalizedFilename = normalizeDocumentFilename(filename);
    const fullPath = path.resolve(this.dataDir, normalizedFilename);
    const dataDirWithSep = `${this.dataDir}${path.sep}`;

    if (!fullPath.startsWith(dataDirWithSep)) {
      throw new Error("readFile may only read files from data/ by filename.");
    }

    return fs.readFileSync(fullPath, "utf8");
  }
}
