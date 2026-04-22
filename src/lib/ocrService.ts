import Tesseract from "tesseract.js";
import type { ExtractedRow, TextType, PageSection } from "./types";

export interface OcrProcessResult {
  rawText: string;
  rows: ExtractedRow[];
  sections: PageSection[];
  componentName: string;
  averageConfidence: number;
}

export type OcrProgressCallback = (progress: number, status: string) => void;

// ─── Image preprocessing ──────────────────────────────────────────────────────
async function preprocessImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const scale = Math.min(4, Math.max(2, 2800 / img.width));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, w, h);
        const id = ctx.getImageData(0, 0, w, h);
        const d = id.data;
        // Grayscale + contrast boost — better OCR for UI screenshots
        const contrast = 1.4;
        for (let i = 0; i < d.length; i += 4) {
          const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          const c = clamp((g - 128) * contrast + 128);
          d[i] = d[i + 1] = d[i + 2] = c;
        }
        ctx.putImageData(id, 0, 0);
        URL.revokeObjectURL(url);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
          "image/png",
        );
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function clamp(v: number) {
  return Math.min(255, Math.max(0, Math.round(v)));
}

// ─── OCR text cleanup ─────────────────────────────────────────────────────────
// Fixes common Tesseract misreads on UI screenshots
function cleanOcrText(raw: string): string {
  let t = raw;
  // Normalize quotes/dashes/whitespace
  t = t
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/[^\S\n]+/g, " ");

  // Fix vertical bars / pipes that should be I or l
  t = t.replace(/(?<=[a-zA-Z])\|(?=[a-zA-Z])/g, "l");
  t = t.replace(/\b\|(?=[a-zA-Z])/g, "I");

  // Normalize bullets
  t = t.replace(/[\u25CF\u25CB\u25A0\u25A1\u25BA\u25C6\u2756]/g, "•");

  // Fix digit-in-word misreads (only inside alphabetic words)
  t = t.replace(/\b([A-Za-z]*)([0-9])([A-Za-z]+)\b/g, (_, pre, dig, post) => {
    const map: Record<string, string> = { "0": "o", "1": "l", "5": "s", "8": "B", "6": "G" };
    const replacement = map[dig] ?? dig;
    // Preserve case of preceding char
    const useUpper = pre.length > 0 ? /[A-Z]/.test(pre[pre.length - 1]) : /[A-Z]/.test(post[0]);
    return pre + (useUpper ? replacement.toUpperCase() : replacement) + post;
  });

  // Collapse repeated punctuation
  t = t.replace(/\.{4,}/g, "...");
  t = t.replace(/-{3,}/g, "—");

  return t;
}

function cleanLine(line: string): string {
  let t = cleanOcrText(line).trim();
  // Strip leading/trailing junk punctuation
  t = t.replace(/^[^\w€$£•\[\(]+/, "").replace(/[\s\\\/|]+$/, "");
  return t.trim();
}

// Discard pure noise lines
function isJunk(line: string): boolean {
  if (line.length < 2) return true;
  const letters = (line.match(/[A-Za-z]/g) || []).length;
  const digits = (line.match(/[0-9]/g) || []).length;
  const meaningful = letters + digits;
  if (meaningful === 0) return true;
  // Ratio of meaningful chars must be reasonable
  if (meaningful / line.length < 0.4) return true;
  // Single repeated character
  if (/^(.)\1+$/.test(line.replace(/\s/g, ""))) return true;
  return false;
}

// ─── Key generation ───────────────────────────────────────────────────────────
const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "in", "on", "at", "to", "for",
  "with", "by", "from", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could", "should",
  "may", "might", "can", "this", "that", "these", "those", "it", "its",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

function toCamel(words: string[]): string {
  if (words.length === 0) return "";
  return words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join("");
}

function toPascal(words: string[]): string {
  return words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join("");
}

function semanticKey(text: string, type: TextType, hint?: string): string {
  const tokens = tokenize(text).filter((t) => !STOP_WORDS.has(t)).slice(0, 4);
  const significant = tokens.length > 0 ? tokens : tokenize(text).slice(0, 3);
  const base = toCamel(significant) || "field";

  const suffix: Partial<Record<TextType, string>> = {
    Label: "Label",
    Action: "Button",
    Link: "Link",
    Boolean: "Toggle",
    ListOption: "Option",
    RichText: "Text",
    Other: "",
  };

  // Strip suffix-like words already present at the end
  let keyBase = base;
  const lower = keyBase.toLowerCase();
  const sfx = (suffix[type] || "").toLowerCase();
  if (sfx && lower.endsWith(sfx)) {
    return keyBase;
  }

  if (hint) {
    const hintCamel = hint[0].toLowerCase() + hint.slice(1);
    keyBase = `${hintCamel}${base[0].toUpperCase()}${base.slice(1)}`;
  }

  return suffix[type] ? `${keyBase}${suffix[type]}` : keyBase;
}

// ─── Classification ───────────────────────────────────────────────────────────
function classifyLine(line: string): TextType {
  const t = line.trim();
  if (!t) return "Other";
  if (/^https?:\/\//i.test(t) || /^www\./i.test(t) || /\.(com|org|net|io|app|dev|co)\b/i.test(t))
    return "Link";
  if (/^(yes|no|true|false|on|off|enabled|disabled|active|inactive)$/i.test(t)) return "Boolean";
  if (
    /^(submit|cancel|save|delete|edit|add|create|update|remove|close|open|confirm|back|next|continue|upload|download|export|import|search|filter|reset|apply|login|log\s?in|logout|log\s?out|register|send|approve|reject|done|refresh|clear|ok|proceed|get\s?started|try\s?free|subscribe|buy\s?now|learn\s?more|view\s?all|see\s?more|contact\s?us|sign\s?up|sign\s?in)$/i.test(
      t,
    )
  )
    return "Action";
  if (/^[•\-*►●]\s/.test(t) || /^\d+[.)]\s/.test(t) || /^\[\s*[\sx]\s*\]/.test(t))
    return "ListOption";
  if (t.length > 100 || t.split(/\s+/).length > 15) return "RichText";
  if (t.length <= 50 && !/[.!?]$/.test(t) && t.split(/\s+/).length <= 6) return "Label";
  if (t.split(/\s+/).length > 8) return "RichText";
  return "Label";
}

// ─── Layout / section analysis ────────────────────────────────────────────────
type SectionKind =
  | "Header"
  | "Navigation"
  | "Breadcrumb"
  | "Steps"
  | "PageTitle"
  | "PricingCard"
  | "FormSection"
  | "TableSection"
  | "ActionBar"
  | "InfoCard"
  | "Description"
  | "LinkSection"
  | "Footer"
  | "Section";

type BBox = { x0: number; y0: number; x1: number; y1: number };

interface BlockAnalysis {
  kind: SectionKind;
  label: string;
  hint: string;
  score: number;
}

function hasPrice(text: string) {
  return (
    /\d+[.,]\d{2}\s*(€|\$|£|USD|EUR|month|year|mo|yr)/i.test(text) ||
    /\d+\s*(€|\$|£)\s*(\/|per)\s*(mo|month|yr|year)/i.test(text)
  );
}

function analyzeBlock(lines: string[], bbox: BBox, imageH: number, imageW: number): BlockAnalysis {
  const allText = lines.join(" ");
  const lower = allText.toLowerCase();
  const relY = (bbox.y0 + bbox.y1) / 2 / imageH;
  const blockW = bbox.x1 - bbox.x0;
  const isWide = blockW / imageW > 0.6;

  if (/©|copyright|privacy policy|cookies?|terms|all rights reserved/i.test(allText))
    return { kind: "Footer", label: "Footer", hint: "footer", score: 95 };

  if (lines.length <= 3 && /(.+\s[>/]\s.+){1,}/.test(allText))
    return { kind: "Breadcrumb", label: "Breadcrumb", hint: "breadcrumb", score: 90 };

  if (/(\d+\s*[.)]\s*\w[\w\s]{0,25}){2,}/.test(allText) && lines.length <= 5)
    return { kind: "Steps", label: "Steps", hint: "step", score: 88 };

  if (hasPrice(allText))
    return { kind: "PricingCard", label: "PricingCard", hint: "pricing", score: 92 };

  const allShortWords = lines.every((l) => l.split(/\s+/).length <= 4);
  if (lines.length >= 3 && allShortWords && !hasPrice(allText) && isWide)
    return { kind: "Navigation", label: "Navigation", hint: "nav", score: 80 };

  if (relY < 0.1 && isWide && lines.length <= 3)
    return { kind: "Header", label: "Header", hint: "header", score: 78 };

  const actionWords =
    /\b(submit|cancel|save|delete|edit|close|confirm|back|next|continue|apply|reset|login|sign in|sign up|ok|proceed|get started|subscribe|buy|download|export|send|add|create|upload|search)\b/i;
  const actionLineCount = lines.filter(
    (l) => actionWords.test(l) && l.split(/\s+/).length <= 4,
  ).length;
  if (actionLineCount >= 1 && actionLineCount >= lines.length * 0.6)
    return { kind: "ActionBar", label: "ActionBar", hint: "action", score: 85 };

  const linkLikeCount = lines.filter(
    (l) => /^https?:\/\//i.test(l) || /\.(com|org|net|io)\b/i.test(l),
  ).length;
  if (linkLikeCount >= 2 || (linkLikeCount >= 1 && lines.length <= 3))
    return { kind: "LinkSection", label: "LinkSection", hint: "link", score: 82 };

  const formLabelCount = lines.filter(
    (l) => /^[\w\s]{2,30}:\s*$/.test(l) && l.split(/\s+/).length <= 5,
  ).length;
  const hasInputLike =
    /\b(email|password|name|phone|address|username|search|select|choose|enter|type)\b/i.test(lower);
  if (formLabelCount >= 2 || (hasInputLike && lines.length >= 2))
    return { kind: "FormSection", label: "FormSection", hint: "form", score: 78 };

  const tabularLikeCount = lines.filter((l) => l.split(/\s{2,}|\t/).length >= 3).length;
  if (tabularLikeCount >= 2)
    return { kind: "TableSection", label: "TableSection", hint: "table", score: 80 };

  const hasStat = /\d+[\d,.]*\s*(%|k|m|gb|tb|ms|s|h|min|users?|items?|files?|records?)/i.test(
    allText,
  );
  if (hasStat && lines.length <= 6)
    return { kind: "InfoCard", label: "InfoCard", hint: "info", score: 75 };

  if (lines.length === 1 && lines[0].split(/\s+/).length <= 8 && relY < 0.35) {
    const heading = lines[0];
    const tokens = tokenize(heading).filter((t) => !STOP_WORDS.has(t)).slice(0, 3);
    const label = tokens.length > 0 ? toPascal(tokens) : "PageTitle";
    return { kind: "PageTitle", label, hint: "title", score: 72 };
  }

  if (lines.some((l) => l.split(/\s+/).length > 8))
    return { kind: "Description", label: "Description", hint: "description", score: 65 };

  const heading = lines.find((l) => l.length <= 50 && l.split(/\s+/).length <= 7);
  const tokens = heading
    ? tokenize(heading).filter((t) => !STOP_WORDS.has(t)).slice(0, 3)
    : [];
  const label = tokens.length > 0 ? toPascal(tokens) : "Section";
  const hint = tokens.length > 0 ? toCamel(tokens) : "section";
  return { kind: "Section", label, hint, score: 50 };
}

function deduplicateLabels(sections: Array<{ label: string }>): void {
  const counts: Record<string, number> = {};
  const seen: Record<string, number> = {};
  for (const s of sections) counts[s.label] = (counts[s.label] || 0) + 1;
  for (const s of sections) {
    if (counts[s.label] > 1) {
      seen[s.label] = (seen[s.label] || 0) + 1;
      s.label = `${s.label}${seen[s.label]}`;
    }
  }
}

function detectComponentName(
  blocks: Array<{ lines: string[]; bbox: BBox }>,
  imageH: number,
): string {
  for (const block of blocks) {
    for (const line of block.lines) {
      const match = line
        .trim()
        .match(/^(Add|Edit|Create|View|Manage|Detail(?:ed)?|New|Update|Delete|Remove)\s+(.{2,40})$/i);
      if (match) {
        const tokens = tokenize(line).slice(0, 4);
        return toPascal(tokens) + "Component";
      }
    }
  }
  const topBlocks = blocks.filter((b) => (b.bbox.y0 + b.bbox.y1) / 2 / imageH < 0.5);
  for (const b of topBlocks) {
    const heading = b.lines.find(
      (l) => l.length >= 3 && l.length <= 45 && l.split(/\s+/).length <= 6 && !/©|\d{4}/.test(l),
    );
    if (heading) {
      const tokens = tokenize(heading).filter((t) => !STOP_WORDS.has(t)).slice(0, 4);
      if (tokens.length > 0) return toPascal(tokens) + "Component";
    }
  }
  return "UnknownComponent";
}

// ─── Main pipeline ────────────────────────────────────────────────────────────
export async function runOcr(
  file: File,
  componentNameOverride?: string,
  onProgress?: OcrProgressCallback,
): Promise<OcrProcessResult> {
  onProgress?.(0, "Preparing image...");

  let imageInput: Blob;
  try {
    imageInput = await preprocessImage(file);
    onProgress?.(8, "Image ready, loading OCR engine...");
  } catch {
    imageInput = file;
    onProgress?.(8, "Loading OCR engine...");
  }

  const result = await Tesseract.recognize(imageInput, "eng", {
    logger: (m) => {
      if (m.status === "recognizing text" && typeof m.progress === "number") {
        onProgress?.(8 + Math.round(m.progress * 82), "Recognizing text...");
      } else if (m.status === "loading tesseract core") onProgress?.(10, "Loading OCR engine...");
      else if (m.status === "initializing tesseract") onProgress?.(12, "Initializing...");
      else if (m.status === "loading language traineddata")
        onProgress?.(16, "Loading language data...");
      else if (m.status === "initializing api") onProgress?.(20, "Starting analysis...");
    },
  });

  onProgress?.(91, "Analyzing layout & sections...");

  const data = result.data as unknown as {
    text: string;
    confidence?: number;
    words?: Array<{ text?: string; confidence: number }>;
    blocks?: Array<{ text: string; confidence: number; bbox: BBox }>;
    paragraphs?: Array<{ text: string; confidence: number; bbox: BBox }>;
    lines?: Array<{ text: string; confidence: number; bbox: BBox }>;
  };

  const rawText = cleanOcrText(data.text);
  const ocrWords = data.words ?? [];

  type TesseractBlock = { text: string; confidence: number; bbox: BBox };
  type BlockItem = { bbox: BBox; confidence: number; lines: string[] };

  const toBlockItems = (items: TesseractBlock[]): BlockItem[] =>
    items
      .map((b) => ({
        bbox: b.bbox,
        confidence: b.confidence,
        lines: b.text
          .split("\n")
          .map(cleanLine)
          .filter((l) => l.length > 0 && !isJunk(l)),
      }))
      .filter((b) => b.lines.length > 0);

  let blockData: BlockItem[] = toBlockItems((data.blocks ?? []) as TesseractBlock[]);
  if (blockData.length === 0)
    blockData = toBlockItems((data.paragraphs ?? []) as TesseractBlock[]);
  if (blockData.length === 0) blockData = toBlockItems((data.lines ?? []) as TesseractBlock[]);

  if (blockData.length === 0 && rawText.trim()) {
    const conf = data.confidence ?? 50;
    const groups = rawText.split(/\n{2,}/).filter((g) => g.trim().length > 0);
    if (groups.length > 1) {
      blockData = groups
        .map((g, i) => ({
          bbox: { x0: 0, y0: i * 120, x1: 800, y1: (i + 1) * 120 },
          confidence: conf,
          lines: g.split("\n").map(cleanLine).filter((l) => l.length > 0 && !isJunk(l)),
        }))
        .filter((b) => b.lines.length > 0);
    } else {
      blockData = [
        {
          bbox: { x0: 0, y0: 0, x1: 800, y1: 1000 },
          confidence: conf,
          lines: rawText.split("\n").map(cleanLine).filter((l) => l.length > 0 && !isJunk(l)),
        },
      ];
    }
  }

  const imageH = blockData.length > 0 ? Math.max(...blockData.map((b) => b.bbox.y1)) : 1000;
  const imageW = blockData.length > 0 ? Math.max(...blockData.map((b) => b.bbox.x1)) : 800;

  const baseComponent = componentNameOverride?.trim() || detectComponentName(blockData, imageH);

  // Track key uniqueness across the whole result (by section+key)
  const sectionKeyCounts: Record<string, Record<string, number>> = {};

  const rawSections: Array<{ label: string; bbox: BBox; rows: ExtractedRow[] }> = [];

  for (const block of blockData) {
    const analysis = analyzeBlock(block.lines, block.bbox, imageH, imageW);
    const componentName = `${baseComponent}_${analysis.label}`;
    const seenText = new Set<string>();
    const rows: ExtractedRow[] = [];
    sectionKeyCounts[analysis.label] = sectionKeyCounts[analysis.label] || {};

    for (const line of block.lines) {
      const norm = line.toLowerCase();
      if (seenText.has(norm)) continue;
      seenText.add(norm);

      const type = classifyLine(line);
      const baseKey = semanticKey(line, type, analysis.hint) || "field";

      // Make key unique per section
      const counts = sectionKeyCounts[analysis.label];
      counts[baseKey] = (counts[baseKey] || 0) + 1;
      const key = counts[baseKey] > 1 ? `${baseKey}${counts[baseKey]}` : baseKey;

      const lineWords = norm.split(/\s+/);
      const matched = ocrWords
        .filter((w) => w?.text && lineWords.includes(w.text.toLowerCase()))
        .map((w) => w.confidence);
      const conf =
        matched.length > 0
          ? matched.reduce((a, b) => a + b, 0) / matched.length
          : block.confidence;

      rows.push({
        webComponent: componentName,
        type,
        key,
        en: line,
        confidence: Math.round(conf * 10) / 10,
      });
    }

    if (rows.length > 0) rawSections.push({ label: analysis.label, bbox: block.bbox, rows });
  }

  deduplicateLabels(rawSections);

  const sections: PageSection[] = rawSections.map((s) => {
    const componentName = `${baseComponent}_${s.label}`;
    return {
      name: componentName,
      label: s.label,
      bbox: s.bbox,
      rows: s.rows.map((r) => ({ ...r, webComponent: componentName })),
    };
  });

  const rows = sections.flatMap((s) => s.rows);
  const avg =
    rows.length > 0
      ? Math.round((rows.reduce((s, r) => s + r.confidence, 0) / rows.length) * 10) / 10
      : 0;

  onProgress?.(100, "Done");
  return { rawText, rows, sections, componentName: baseComponent, averageConfidence: avg };
}
