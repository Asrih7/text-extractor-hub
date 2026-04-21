export type TextType = "Label" | "RichText" | "ListOption" | "Link" | "Boolean" | "Action" | "Other";

export interface ExtractedRow {
  webComponent: string;
  type: TextType;
  key: string;
  en: string;
  fr?: string;
  nl?: string;
  confidence: number;
}

export interface PageSection {
  name: string;
  label: string;
  rows: ExtractedRow[];
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface OcrResult {
  id: string;
  fileName: string;
  rawText: string;
  rows: ExtractedRow[];
  sections: PageSection[];
  componentName: string;
  processedAt: string;
  averageConfidence: number;
  imageDataUrl?: string;
}

export const TYPE_COLORS: Record<TextType, string> = {
  Label: "bg-blue-100 text-blue-800",
  RichText: "bg-slate-100 text-slate-700",
  ListOption: "bg-indigo-100 text-indigo-800",
  Link: "bg-purple-100 text-purple-800",
  Boolean: "bg-teal-100 text-teal-800",
  Action: "bg-orange-100 text-orange-800",
  Other: "bg-gray-100 text-gray-700",
};

export function getConfidenceBg(confidence: number): string {
  if (confidence >= 80) return "bg-emerald-100 text-emerald-800";
  if (confidence >= 60) return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-800";
}

export const SECTION_LABEL_COLORS: Record<string, string> = {
  Header: "bg-violet-100 text-violet-800 border-violet-200",
  Navigation: "bg-sky-100 text-sky-800 border-sky-200",
  Breadcrumb: "bg-cyan-100 text-cyan-800 border-cyan-200",
  Steps: "bg-indigo-100 text-indigo-800 border-indigo-200",
  PageTitle: "bg-blue-100 text-blue-800 border-blue-200",
  PricingCard: "bg-emerald-100 text-emerald-800 border-emerald-200",
  FormSection: "bg-amber-100 text-amber-800 border-amber-200",
  TableSection: "bg-teal-100 text-teal-800 border-teal-200",
  ActionBar: "bg-orange-100 text-orange-800 border-orange-200",
  InfoCard: "bg-purple-100 text-purple-800 border-purple-200",
  Description: "bg-slate-100 text-slate-700 border-slate-200",
  LinkSection: "bg-rose-100 text-rose-800 border-rose-200",
  Footer: "bg-zinc-100 text-zinc-700 border-zinc-200",
};

export function getSectionColor(label: string): string {
  return SECTION_LABEL_COLORS[label] || "bg-slate-100 text-slate-700 border-slate-200";
}

export type DownloadLang = "en" | "fr" | "nl";

export const LANG_LABELS: Record<DownloadLang, string> = {
  en: "English (EN)",
  fr: "French (FR)",
  nl: "Dutch (NL)",
};
