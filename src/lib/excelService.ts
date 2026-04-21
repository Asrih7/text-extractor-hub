import * as XLSX from "xlsx";
import type { ExtractedRow, DownloadLang } from "./types";

export function generateExcel(rows: ExtractedRow[], fileName: string): void {
  const hasTranslations = rows.some((r) => r.fr || r.nl);

  const headers = hasTranslations
    ? ["WEB COMPONENT", "TYPE", "KEY", "EN", "FR", "NL"]
    : ["WEB COMPONENT", "TYPE", "KEY", "EN"];

  const wsData = [
    headers,
    ...rows.map((r) =>
      hasTranslations
        ? [r.webComponent, r.type, r.key, r.en, r.fr ?? "", r.nl ?? ""]
        : [r.webComponent, r.type, r.key, r.en],
    ),
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  ws["!cols"] = hasTranslations
    ? [{ wch: 32 }, { wch: 14 }, { wch: 35 }, { wch: 55 }, { wch: 55 }, { wch: 55 }]
    : [{ wch: 32 }, { wch: 14 }, { wch: 35 }, { wch: 60 }];

  XLSX.utils.book_append_sheet(wb, ws, "Extracted Text");
  const safeName = fileName.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]/gi, "_");
  XLSX.writeFile(wb, `${safeName}_extracted.xlsx`);
}

export function downloadJson(rows: ExtractedRow[], lang: DownloadLang, fileName: string): void {
  const obj: Record<string, string> = {};
  for (const row of rows) {
    const sectionLabel = row.webComponent.split("_").slice(1).join("_") || row.webComponent;
    const nsKey = `${sectionLabel}.${row.key}`;
    const value =
      lang === "fr" ? (row.fr ?? row.en) : lang === "nl" ? (row.nl ?? row.en) : row.en;
    obj[nsKey] = value;
  }
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const safeName = fileName.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]/gi, "_");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${safeName}.${lang}.i18n.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function importTemplateAndFill(templateFile: File, rows: ExtractedRow[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const existing = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 }) as string[][];
        const startRow = existing.length + 1;

        rows.forEach((row, i) => {
          const r = startRow + i;
          ws[`A${r}`] = { v: row.webComponent, t: "s" };
          ws[`B${r}`] = { v: row.type, t: "s" };
          ws[`C${r}`] = { v: row.key, t: "s" };
          ws[`D${r}`] = { v: row.en, t: "s" };
          if (row.fr) ws[`E${r}`] = { v: row.fr, t: "s" };
          if (row.nl) ws[`F${r}`] = { v: row.nl, t: "s" };
        });

        const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
        range.e.r = startRow + rows.length - 1;
        range.e.c = rows.some((r) => r.fr || r.nl) ? 5 : 3;
        ws["!ref"] = XLSX.utils.encode_range(range);
        XLSX.writeFile(wb, "template_filled.xlsx");
        resolve();
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(templateFile);
  });
}

export const generateExcelBuffer = generateExcel;
