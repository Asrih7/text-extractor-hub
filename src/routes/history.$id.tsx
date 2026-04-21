import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Download, Trash2, FileText, ChevronDown, ChevronUp, Layers } from "lucide-react";
import { format } from "date-fns";
import {
  TYPE_COLORS,
  getConfidenceBg,
  getSectionColor,
  type TextType,
  type PageSection,
  type OcrResult,
} from "@/lib/types";
import { getHistoryItem, deleteFromHistory } from "@/lib/historyService";
import { generateExcelBuffer } from "@/lib/excelService";

export const Route = createFileRoute("/history/$id")({
  component: HistoryDetailPage,
});

function SectionBlock({ section }: { section: PageSection }) {
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
                <th className="text-left px-3 py-1.5 font-semibold text-muted-foreground">#</th>
                <th className="text-left px-3 py-1.5 font-semibold text-muted-foreground">TYPE</th>
                <th className="text-left px-3 py-1.5 font-semibold text-muted-foreground">KEY</th>
                <th className="text-left px-3 py-1.5 font-semibold text-muted-foreground">EN</th>
                <th className="text-right px-3 py-1.5 font-semibold text-muted-foreground">CONF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {section.rows.map((row, i) => (
                <tr key={i} className="hover:bg-muted/20">
                  <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-1.5">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${TYPE_COLORS[row.type as TextType] || TYPE_COLORS.Other}`}
                    >
                      {row.type}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-muted-foreground truncate max-w-[140px]">
                    {row.key}
                  </td>
                  <td className="px-3 py-1.5">{row.en}</td>
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

function HistoryDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState<OcrResult | null | undefined>(undefined);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    if (id) {
      const found = getHistoryItem(id);
      setItem(found ?? null);
    }
  }, [id]);

  if (item === undefined) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <p className="text-sm">Loading...</p>
      </div>
    );
  }

  if (item === null) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <FileText className="w-12 h-12 mx-auto mb-4 opacity-20" />
        <h2 className="text-lg font-semibold mb-2">Record not found</h2>
        <p className="text-sm text-muted-foreground mb-4">
          This item may have been deleted or expired.
        </p>
        <Link to="/history" className="text-sm text-primary hover:underline">
          Back to History
        </Link>
      </div>
    );
  }

  const handleDownload = () => generateExcelBuffer(item.rows, item.fileName);
  const handleDelete = () => {
    if (!confirm("Delete this record?")) return;
    deleteFromHistory(item.id);
    navigate({ to: "/history" });
  };

  const sections: PageSection[] = item.sections ?? [];
  const hasSections = sections.length > 0;

  const typeCounts: Record<string, number> = {};
  item.rows.forEach((r) => {
    typeCounts[r.type] = (typeCounts[r.type] || 0) + 1;
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link
            to="/history"
            className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <h2 className="text-xl font-bold truncate">{item.fileName}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {item.componentName} ·{" "}
              {format(new Date(item.processedAt), "MMMM d, yyyy 'at' h:mm a")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
          >
            <Download className="w-4 h-4" />
            Download Excel
          </button>
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-destructive/30 text-destructive rounded-lg hover:bg-destructive/10 transition-colors"
            aria-label="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-card border border-card-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Sections</p>
          <p className="text-2xl font-bold mt-1">{sections.length}</p>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Rows</p>
          <p className="text-2xl font-bold mt-1">{item.rows.length}</p>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Avg Confidence</p>
          <p
            className={`text-2xl font-bold mt-1 ${item.averageConfidence >= 80 ? "text-emerald-600" : item.averageConfidence >= 60 ? "text-amber-600" : "text-red-500"}`}
          >
            {item.averageConfidence.toFixed(1)}%
          </p>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Unique Types</p>
          <p className="text-2xl font-bold mt-1">{Object.keys(typeCounts).length}</p>
        </div>
      </div>

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
            <pre className="text-xs font-mono bg-muted/50 rounded-lg p-3 overflow-auto max-h-48 whitespace-pre-wrap text-muted-foreground">
              {item.rawText || "(no text extracted)"}
            </pre>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <Layers className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">
            {hasSections ? `${sections.length} Detected Sections` : "Extracted Rows"}
          </h3>
        </div>

        {hasSections ? (
          <div className="space-y-2">
            {sections.map((section) => (
              <SectionBlock key={section.name} section={section} />
            ))}
          </div>
        ) : (
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">
                      #
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">
                      Type
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">
                      Key
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">
                      EN
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">
                      Confidence
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {item.rows.map((row, i) => (
                    <tr key={i} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{i + 1}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[row.type as TextType] || TYPE_COLORS.Other}`}
                        >
                          {row.type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                        <span className="truncate block max-w-[180px]">{row.key}</span>
                      </td>
                      <td className="px-4 py-2.5 max-w-xs">
                        <span className="block truncate">{row.en}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${getConfidenceBg(row.confidence)}`}
                        >
                          {row.confidence.toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
