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
        const scale = Math.min(4, Math.max(1.5, 2500 / img.width));
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
        const f = (259 * 290) / (255 * 224);
        for (let i = 0; i < d.length; i += 4) {
          d[i] = clamp(f * (d[i] - 128) + 128);
          d[i + 1] = clamp(f * (d[i + 1] - 128) + 128);
          d[i + 2] = clamp(f * (d[i + 2] - 128) + 128);
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

// ─── Text helpers ─────────────────────────────────────────────────────────────
function toCamelCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join("")
    .slice(0, 60);
}

function toPascalCase(text: string): string {
  return text
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

function cleanLines(lines: string[]): string[] {
  return lines
    .map((l) => l.trim())
    .filter((l) => {
      if (l.length < 2) return false;
      const alphaNum = l.replace(/[^a-zA-Z0-9€$£%.,!?&():/ \-+@#]/g, "").length;
      return alphaNum / l.length >= 0.3;
    });
}

function classifyLine(line: string): TextType {
  const t = line.trim();
  if (!t) return "Other";
  if (/^https?:\/\//i.test(t) || /^www\./i.test(t) || /\.(com|org|net|io|app|dev)\b/i.test(t))
    return "Link";
  if (/^(yes|no|true|false|on|off|enabled|disabled|active|inactive|checked|unchecked)$/i.test(t))
    return "Boolean";
  if (
    /^(submit|cancel|save|delete|edit|add|create|update|remove|close|open|confirm|back|next|continue|upload|download|export|import|search|filter|reset|apply|login|logout|sign in|sign out|register|send|approve|reject|done|refresh|clear|go|ok|proceed|get started|try free|subscribe|buy now|learn more|view all|see more|contact us|sign up|log in)$/i.test(
      t,
    )
  )
    return "Action";
  if (/^[\u2022\-\*\u25BA\u25CF]\s/.test(t) || /^\d+\.\s/.test(t) || /^\[\s*[\sx]\s*\]/.test(t))
    return "ListOption";
  if (t.length > 100 || t.split(/\s+/).length > 15) return "RichText";
  if (t.length <= 50 && !/[.!?]$/.test(t) && t.split(/\s+/).length <= 6) return "Label";
  if (t.split(/\s+/).length > 8) return "RichText";
  return "Label";
}

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

  if (
    /©|copyright|\bprivacy policy\b|\bcookies\b|\bterms\b|\ball rights reserved\b|\bgeneral conditions\b/i.test(
      allText,
    )
  ) {
    return { kind: "Footer", label: "Footer", score: 95 };
  }

  if (
    lines.length <= 3 &&
    /(.+\s[>/]\s.+){1,}/.test(allText) &&
    lines.every((l) => l.split(/\s+/).length <= 10)
  ) {
    return { kind: "Breadcrumb", label: "Breadcrumb", score: 90 };
  }

  if (/(\d+\s*[.)]\s*\w[\w\s]{0,25}){2,}/.test(allText) && lines.length <= 5) {
    return { kind: "Steps", label: "Steps", score: 88 };
  }

  if (hasPrice(allText)) {
    return { kind: "PricingCard", label: "PricingCard", score: 92 };
  }

  const allShortWords = lines.every((l) => l.split(/\s+/).length <= 4);
  const noLongSentence = !lines.some((l) => l.split(/\s+/).length > 6);
  if (lines.length >= 3 && allShortWords && noLongSentence && !hasPrice(allText) && isWide) {
    return { kind: "Navigation", label: "Navigation", score: 80 };
  }

  if (relY < 0.1 && isWide && lines.length <= 3) {
    return { kind: "Header", label: "Header", score: 78 };
  }

  const actionWords =
    /\b(submit|cancel|save|delete|edit|close|confirm|back|next|continue|apply|reset|login|sign in|sign up|ok|proceed|get started|subscribe|buy|download|export|send|add|create|upload|search)\b/i;
  const actionLineCount = lines.filter(
    (l) => actionWords.test(l) && l.split(/\s+/).length <= 4,
  ).length;
  if (actionLineCount >= 1 && actionLineCount >= lines.length * 0.6) {
    return { kind: "ActionBar", label: "ActionBar", score: 85 };
  }

  const linkLikeCount = lines.filter(
    (l) => /^https?:\/\//i.test(l) || /\.(com|org|net|io)\b/i.test(l),
  ).length;
  if (linkLikeCount >= 2 || (linkLikeCount >= 1 && lines.length <= 3)) {
    return { kind: "LinkSection", label: "LinkSection", score: 82 };
  }

  const formLabelCount = lines.filter(
    (l) => /^[\w\s]{2,30}:?\s*$/.test(l) && l.split(/\s+/).length <= 5,
  ).length;
  const hasInputLike =
    /\b(email|password|name|phone|address|username|search|select|choose|enter|type)\b/i.test(lower);
  if (formLabelCount >= 2 || (hasInputLike && lines.length >= 2)) {
    return { kind: "FormSection", label: "FormSection", score: 78 };
  }

  const tabularLikeCount = lines.filter((l) => l.split(/\s{2,}|\t/).length >= 3).length;
  if (tabularLikeCount >= 2) {
    return { kind: "TableSection", label: "TableSection", score: 80 };
  }

  const hasStatLike = /\d+[\d,.]*\s*(%|k|m|gb|tb|ms|s|h|min|users?|items?|files?|records?)/i.test(
    allText,
  );
  if (hasStatLike && lines.length <= 6) {
    return { kind: "InfoCard", label: "InfoCard", score: 75 };
  }

  if (
    lines.length === 1 &&
    lines[0].split(/\s+/).length <= 8 &&
    lines[0].length <= 50 &&
    relY < 0.35
  ) {
    const label = toPascalCase(lines[0]) || "PageTitle";
    return { kind: "PageTitle", label, score: 72 };
  }

  if (lines.some((l) => l.split(/\s+/).length > 8)) {
    return { kind: "Description", label: "Description", score: 65 };
  }

  const heading = lines.find((l) => l.length <= 50 && l.split(/\s+/).length <= 7);
  const label = heading ? toPascalCase(heading) || "Section" : "Section";
  return { kind: "Section", label, score: 50 };
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
      if (match) return toPascalCase(line.trim()) + "Component";
    }
  }
  const topBlocks = blocks.filter((b) => (b.bbox.y0 + b.bbox.y1) / 2 / imageH < 0.5);
  for (const b of topBlocks) {
    const heading = b.lines.find(
      (l) => l.length >= 3 && l.length <= 45 && l.split(/\s+/).length <= 6 && !/©|\d{4}/.test(l),
    );
    if (heading) return toPascalCase(heading) + "Component";
  }
  return "UnknownComponent";
}

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

  const rawText = result.data.text;
  const ocrWords = result.data.words ?? [];

  type TesseractBlock = { text: string; confidence: number; bbox: BBox };
  type BlockItem = { bbox: BBox; confidence: number; lines: string[] };

  const toBlockItems = (items: TesseractBlock[]): BlockItem[] =>
    items
      .map((b) => ({
        bbox: b.bbox,
        confidence: b.confidence,
        lines: cleanLines(b.text.split("\n")),
      }))
      .filter((b) => b.lines.length > 0);

  let blockData: BlockItem[] = toBlockItems((result.data.blocks ?? []) as TesseractBlock[]);
  if (blockData.length === 0)
    blockData = toBlockItems((result.data.paragraphs ?? []) as TesseractBlock[]);
  if (blockData.length === 0) blockData = toBlockItems((result.data.lines ?? []) as TesseractBlock[]);

  if (blockData.length === 0 && rawText.trim()) {
    const conf = result.data.confidence ?? 50;
    const groups = rawText.split(/\n{2,}/).filter((g) => g.trim().length > 0);
    if (groups.length > 1) {
      blockData = groups
        .map((g, i) => ({
          bbox: { x0: 0, y0: i * 120, x1: 800, y1: (i + 1) * 120 },
          confidence: conf,
          lines: cleanLines(g.split("\n")),
        }))
        .filter((b) => b.lines.length > 0);
    } else {
      blockData = [
        {
          bbox: { x0: 0, y0: 0, x1: 800, y1: 1000 },
          confidence: conf,
          lines: cleanLines(rawText.split("\n")),
        },
      ];
    }
  }

  const imageH = blockData.length > 0 ? Math.max(...blockData.map((b) => b.bbox.y1)) : 1000;
  const imageW = blockData.length > 0 ? Math.max(...blockData.map((b) => b.bbox.x1)) : 800;

  const baseComponent = componentNameOverride?.trim() || detectComponentName(blockData, imageH);

  const rawSections: Array<{ label: string; bbox: BBox; rows: ExtractedRow[] }> = [];

  for (const block of blockData) {
    const analysis = analyzeBlock(block.lines, block.bbox, imageH, imageW);
    const componentName = `${baseComponent}_${analysis.label}`;
    const seen = new Set<string>();
    const rows: ExtractedRow[] = [];

    for (const line of block.lines) {
      if (seen.has(line)) continue;
      seen.add(line);

      const type = classifyLine(line);
      const key = toCamelCase(line.slice(0, 50)) || "unknown";

      const lineWords = line.toLowerCase().split(/\s+/);
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

    if (rows.length > 0) {
      rawSections.push({ label: analysis.label, bbox: block.bbox, rows });
    }
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
