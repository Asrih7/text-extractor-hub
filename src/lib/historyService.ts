import type { OcrResult } from "./types";

const STORAGE_KEY = "ocr_history";

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function getHistory(): OcrResult[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OcrResult[];
    return parsed.map((r) => ({ ...r, sections: r.sections ?? [] }));
  } catch {
    return [];
  }
}

export function saveToHistory(result: OcrResult): void {
  if (!isBrowser()) return;
  try {
    const existing = getHistory();
    const toStore: OcrResult = { ...result, imageDataUrl: undefined };
    localStorage.setItem(STORAGE_KEY, JSON.stringify([toStore, ...existing].slice(0, 50)));
  } catch {
    /* full */
  }
}

export function deleteFromHistory(id: string): void {
  if (!isBrowser()) return;
  const updated = getHistory().filter((r) => r.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function getHistoryItem(id: string): OcrResult | undefined {
  return getHistory().find((r) => r.id === id);
}

export function clearHistory(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(STORAGE_KEY);
}
