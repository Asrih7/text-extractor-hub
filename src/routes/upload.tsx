import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef, useCallback } from "react";
import { nanoid } from "nanoid";
import {
  Upload as UploadIcon,
  ImageIcon,
  FileSpreadsheet,
  Download,
  Loader2,
  CheckCircle,
  X,
  ChevronDown,
  ChevronUp,
  FileUp,
  Layers,
  Languages,
  FileJson,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TYPE_COLORS,
  getConfidenceBg,
  getSectionColor,
  LANG_LABELS,
  type ExtractedRow,
  type OcrResult,
  type TextType,
  type PageSection,
  type DownloadLang,
} from "@/lib/types";
import { runOcr } from "@/lib/ocrService";
import { generateExcel, downloadJson, importTemplateAndFill } from "@/lib/excelService";
import { translateAll } from "@/lib/translationService";
import { saveToHistory } from "@/lib/historyService";

export const Route = createFileRoute("/upload")({
  head: () => ({
    meta: [
      { title: "Upload & Extract — OCR Extractor" },
      {
        name: "description",
        content: "Drop a UI screenshot to OCR it in your browser, then download as Excel.",
      },
    ],
  }),
  component: UploadPage,
});

function SectionBlock({
  section,
  onUpdateRow,
  showTranslations,
}: {
  section: PageSection;
  onUpdateRow: (
    sectionName: string,
    rowIndex: number,
    field: "en" | "fr" | "nl",
    value: string,
  ) => void;
  showTranslations: boolean;
}) {
  const [open, setOpen] = useState(true);
  const color = getSectionColor(section.label);

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors text-left"
      >
        <span
          className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border ${color}`}
        >
          {section.label}
        </span>
        <span className="text-xs text-muted-foreground font-mono truncate flex-1">
          {section.name}
        </span>
        <span className="text-xs text-muted-foreground shrink-0">{section.rows.length} rows</span>
        {open ? (
          <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
      </button>
      {open && (
        <div className="border-t border-border overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-1.5 font-semibold text-muted-foreground w-24">
                  TYPE
                </th>
                <th className="text-left px-3 py-1.5 font-semibold text-muted-foreground w-28">
                  KEY
                </th>
                <th className="text-left px-3 py-1.5 font-semibold text-muted-foreground">EN</th>
                {showTranslations && (
                  <>
                    <th className="text-left px-3 py-1.5 font-semibold text-muted-foreground">
                      FR
                    </th>
                    <th className="text-left px-3 py-1.5 font-semibold text-muted-foreground">
                      NL
                    </th>
                  </>
                )}
                <th className="text-right px-3 py-1.5 font-semibold text-muted-foreground w-12">
                  CONF
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {section.rows.map((row, i) => (
                <tr key={i} className="hover:bg-muted/20">
                  <td className="px-3 py-1.5">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${TYPE_COLORS[row.type as TextType] || TYPE_COLORS.Other}`}
                    >
                      {row.type}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-muted-foreground truncate max-w-[100px]">
                    {row.key}
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="text"
                      value={row.en}
                      onChange={(e) => onUpdateRow(section.name, i, "en", e.target.value)}
                      className="w-full bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none py-0.5 transition-colors min-w-[80px]"
                    />
                  </td>
                  {showTranslations && (
                    <>
                      <td className="px-3 py-1.5">
                        <input
                          type="text"
                          value={row.fr ?? ""}
                          onChange={(e) => onUpdateRow(section.name, i, "fr", e.target.value)}
                          placeholder="—"
                          className="w-full bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none py-0.5 transition-colors text-sky-700 min-w-[80px]"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="text"
                          value={row.nl ?? ""}
                          onChange={(e) => onUpdateRow(section.name, i, "nl", e.target.value)}
                          placeholder="—"
                          className="w-full bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none py-0.5 transition-colors text-emerald-700 min-w-[80px]"
                        />
                      </td>
                    </>
                  )}
                  <td className="px-3 py-1.5 text-right">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${getConfidenceBg(row.confidence)}`}
                    >
                      {row.confidence.toFixed(0)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [componentName, setComponentName] = useState("");
  const [result, setResult] = useState<OcrResult | null>(null);
  const [editableSections, setEditableSections] = useState<PageSection[]>([]);

  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState("");

  const [translating, setTranslating] = useState(false);
  const [translateProgress, setTranslateProgress] = useState({ done: 0, total: 0 });
  const [translated, setTranslated] = useState(false);

  const [showRaw, setShowRaw] = useState(false);
  const [jsonLang, setJsonLang] = useState<DownloadLang>("en");
  const [templateFile, setTemplateFile] = useState<File | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const templateRef = useRef<HTMLInputElement>(null);

  const allRows: ExtractedRow[] = editableSections.flatMap((s) => s.rows);

  const handleFile = (f: File) => {
    setFile(f);
    setResult(null);
    setEditableSections([]);
    setTranslated(false);
    setProgress(0);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(f);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFile(dropped);
  }, []);

  const handleProcess = async () => {
    if (!file || processing) return;
    setProcessing(true);
    setProgress(0);
    setProgressStatus("Starting...");
    setTranslated(false);
    try {
      const ocrResult = await runOcr(file, componentName.trim() || undefined, (pct, status) => {
        setProgress(pct);
        setProgressStatus(status);
      });
      const id = nanoid();
      const fullResult: OcrResult = {
        id,
        fileName: file.name,
        rawText: ocrResult.rawText,
        rows: ocrResult.rows,
        sections: ocrResult.sections,
        componentName: ocrResult.componentName,
        processedAt: new Date().toISOString(),
        averageConfidence: ocrResult.averageConfidence,
        imageDataUrl: preview || undefined,
      };
      setResult(fullResult);
      setEditableSections(ocrResult.sections);
      saveToHistory(fullResult);
    } catch (err) {
      console.error("OCR error:", err);
      setProgressStatus("Error during processing");
    } finally {
      setProcessing(false);
    }
  };

  const handleTranslate = async () => {
    if (!result || translating) return;
    setTranslating(true);
    setTranslateProgress({ done: 0, total: 0 });
    try {
      const texts = Array.from(new Set(allRows.map((r) => r.en).filter(Boolean)));
      const maps = await translateAll(texts, (done, total) =>
        setTranslateProgress({ done, total }),
      );

      setEditableSections((prev) =>
        prev.map((section) => ({
          ...section,
          rows: section.rows.map((row) => ({
            ...row,
            fr: maps.fr[row.en] ?? row.fr,
            nl: maps.nl[row.en] ?? row.nl,
          })),
        })),
      );
      setTranslated(true);
    } catch (err) {
      console.error("Translation error:", err);
    } finally {
      setTranslating(false);
    }
  };

  const handleUpdateRow = (
    sectionName: string,
    rowIndex: number,
    field: "en" | "fr" | "nl",
    value: string,
  ) => {
    setEditableSections((prev) =>
      prev.map((s) =>
        s.name === sectionName
          ? { ...s, rows: s.rows.map((r, i) => (i === rowIndex ? { ...r, [field]: value } : r)) }
          : s,
      ),
    );
  };

  const handleDownloadExcel = () => result && generateExcel(allRows, result.fileName);
  const handleDownloadJson = () => result && downloadJson(allRows, jsonLang, result.fileName);
  const handleTemplateDownload = async () => {
    if (!templateFile || !result) return;
    try {
      await importTemplateAndFill(templateFile, allRows);
    } catch (err) {
      console.error(err);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setEditableSections([]);
    setComponentName("");
    setShowRaw(false);
    setProgress(0);
    setProgressStatus("");
    setTranslated(false);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Upload & Extract</h2>
        <p className="text-sm text-muted-foreground mt-1">
          OCR runs in your browser · groups text by visual section · translates to FR and NL
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
        {/* Left panel */}
        <div className="space-y-4">
          <div
            className={cn(
              "relative border-2 border-dashed rounded-xl p-6 transition-all cursor-pointer select-none",
              isDragging
                ? "border-primary bg-accent"
                : "border-border hover:border-primary/50 hover:bg-muted/30",
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => !file && inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            {preview ? (
              <div className="relative">
                <img
                  src={preview}
                  alt="Preview"
                  className="w-full max-h-52 object-contain rounded-lg"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    reset();
                  }}
                  className="absolute top-2 right-2 p-1.5 bg-background/90 rounded-full border border-border shadow-sm hover:bg-background"
                  aria-label="Remove"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="text-center py-2">
                <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-accent flex items-center justify-center">
                  <UploadIcon className="w-6 h-6 text-accent-foreground" />
                </div>
                <p className="text-sm font-medium">Drag & drop any image here</p>
                <p className="text-xs text-muted-foreground mt-1">
                  PNG, JPG, WebP, BMP, TIFF — any size
                </p>
              </div>
            )}
          </div>

          {file && (
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <ImageIcon className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
              </div>
            </div>
          )}

          {file && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Component Name (optional)</label>
              <input
                type="text"
                value={componentName}
                onChange={(e) => setComponentName(e.target.value)}
                placeholder="e.g. AddDisneyComponent"
                className="w-full px-3 py-2 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleProcess}
              disabled={!file || processing}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors",
                !file || processing
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-primary text-primary-foreground hover:opacity-90",
              )}
            >
              {processing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <FileSpreadsheet className="w-4 h-4" />
                  Extract & Analyze
                </>
              )}
            </button>
            {file && !processing && (
              <button
                onClick={reset}
                className="px-3 py-2.5 rounded-lg text-sm border border-border hover:bg-muted transition-colors"
              >
                Reset
              </button>
            )}
          </div>

          {processing && (
            <div className="p-3 bg-accent/50 border border-accent rounded-lg space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-sm font-medium">{progressStatus}</span>
                </div>
                <span className="text-xs text-muted-foreground font-mono">{progress}%</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {result && !processing && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-emerald-800">Extraction complete</p>
                <p className="text-xs text-emerald-700">
                  {editableSections.length} sections · {allRows.length} rows ·{" "}
                  {result.averageConfidence}% confidence
                </p>
              </div>
            </div>
          )}

          {result && !processing && (
            <div className="p-4 bg-card border border-card-border rounded-xl space-y-3">
              <div className="flex items-center gap-2">
                <Languages className="w-4 h-4 text-primary" />
                <p className="text-sm font-semibold">Translate</p>
                {translated && (
                  <span className="ml-auto text-xs text-emerald-600 font-medium">
                    FR + NL ready
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Automatically translate all extracted text to French and Dutch using MyMemory.
              </p>
              <button
                onClick={handleTranslate}
                disabled={translating}
                className={cn(
                  "w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                  translating
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-sky-600 text-white hover:bg-sky-700",
                )}
              >
                {translating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Translating {translateProgress.done}/{translateProgress.total}...
                  </>
                ) : (
                  <>
                    <Languages className="w-4 h-4" />
                    {translated ? "Re-translate FR + NL" : "Translate to FR + NL"}
                  </>
                )}
              </button>
              {translating && translateProgress.total > 0 && (
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sky-500 rounded-full transition-all duration-200"
                    style={{
                      width: `${Math.round(
                        (translateProgress.done / translateProgress.total) * 100,
                      )}%`,
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {result && !processing && (
            <div className="p-4 bg-card border border-card-border rounded-xl space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Download
              </p>

              <button
                onClick={handleDownloadExcel}
                className="w-full flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Download Excel {translated ? "(EN + FR + NL)" : "(EN)"}
              </button>

              <div className="flex gap-2">
                <select
                  value={jsonLang}
                  onChange={(e) => setJsonLang(e.target.value as DownloadLang)}
                  className="flex-1 px-3 py-2 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="en">{LANG_LABELS.en}</option>
                  <option value="fr" disabled={!translated}>
                    {LANG_LABELS.fr}
                    {!translated ? " (translate first)" : ""}
                  </option>
                  <option value="nl" disabled={!translated}>
                    {LANG_LABELS.nl}
                    {!translated ? " (translate first)" : ""}
                  </option>
                </select>
                <button
                  onClick={handleDownloadJson}
                  disabled={jsonLang !== "en" && !translated}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors border",
                    jsonLang !== "en" && !translated
                      ? "bg-muted text-muted-foreground border-border cursor-not-allowed"
                      : "bg-background border-border hover:bg-muted text-foreground",
                  )}
                >
                  <FileJson className="w-4 h-4" />
                  JSON
                </button>
              </div>

              <div className="pt-1 border-t border-border space-y-2">
                <p className="text-xs text-muted-foreground">
                  Or fill an existing Excel template:
                </p>
                <input
                  ref={templateRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => setTemplateFile(e.target.files?.[0] || null)}
                />
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => templateRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted transition-colors"
                  >
                    <FileUp className="w-3.5 h-3.5" />
                    {templateFile ? templateFile.name : "Choose template"}
                  </button>
                  {templateFile && (
                    <button
                      onClick={handleTemplateDownload}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary/10 text-primary border border-primary/20 rounded-lg hover:bg-primary/20 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Fill & Download
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="space-y-4 min-w-0">
          {result ? (
            <>
              <div className="bg-card border border-card-border rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowRaw((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
                >
                  <span>Raw Extracted Text</span>
                  {showRaw ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
                {showRaw && (
                  <div className="px-4 pb-4">
                    <pre className="text-xs font-mono bg-muted/50 rounded-lg p-3 overflow-auto max-h-40 whitespace-pre-wrap text-muted-foreground">
                      {result.rawText || "(no text extracted)"}
                    </pre>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 px-1 flex-wrap">
                  <Layers className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold">Sections</h3>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {editableSections.length} detected · {allRows.length} rows
                    {translated && (
                      <span className="ml-2 text-sky-600">· FR + NL translated</span>
                    )}
                  </span>
                </div>
                <div className="space-y-2 overflow-auto max-h-[600px] pr-1">
                  {editableSections.map((section) => (
                    <SectionBlock
                      key={section.name}
                      section={section}
                      onUpdateRow={handleUpdateRow}
                      showTranslations={translated}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                <span>
                  Saved to{" "}
                  <Link to="/history" className="text-primary hover:underline">
                    History
                  </Link>
                </span>
                <span className="font-mono">{result.componentName}</span>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center min-h-64 border-2 border-dashed border-border rounded-xl">
              <div className="text-center text-muted-foreground">
                <Layers className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">Sections appear here</p>
                <p className="text-xs mt-1">
                  Each visual section of the UI is detected and grouped separately
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
