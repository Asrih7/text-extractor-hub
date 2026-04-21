import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { FileText, Download, Trash2, Eye, Search, CheckCircle, Trash } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { getConfidenceBg, type OcrResult } from "@/lib/types";
import { getHistory, deleteFromHistory, clearHistory } from "@/lib/historyService";
import { generateExcelBuffer } from "@/lib/excelService";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "History — OCR Extractor" },
      { name: "description", content: "All previously processed files, stored locally." },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const [history, setHistory] = useState<OcrResult[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setHistory(getHistory());
  }, []);

  const refresh = () => setHistory(getHistory());

  const handleDelete = (id: string) => {
    if (!confirm("Delete this record?")) return;
    deleteFromHistory(id);
    refresh();
  };

  const handleClearAll = () => {
    if (!confirm("Clear all history? This cannot be undone.")) return;
    clearHistory();
    refresh();
  };

  const handleDownload = (item: OcrResult) => {
    generateExcelBuffer(item.rows, item.fileName);
  };

  const filtered = history.filter(
    (item) =>
      item.fileName.toLowerCase().includes(search.toLowerCase()) ||
      item.componentName.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold">History</h2>
          <p className="text-sm text-muted-foreground mt-1">
            All previously processed files, stored locally in your browser
          </p>
        </div>
        {history.length > 0 && (
          <button
            onClick={handleClearAll}
            className="flex items-center gap-1.5 px-3 py-2 text-xs border border-destructive/30 text-destructive rounded-lg hover:bg-destructive/10 transition-colors shrink-0"
          >
            <Trash className="w-3.5 h-3.5" />
            Clear all
          </button>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search files..."
          className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="bg-card border border-card-border rounded-xl overflow-hidden shadow-sm">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">
              {search ? "No results found" : "No files processed yet"}
            </p>
            {!search && (
              <Link
                to="/upload"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium mt-3"
              >
                Go to Upload
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    File
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Component
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Rows
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Confidence
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Date
                  </th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 bg-accent rounded-lg shrink-0">
                          <CheckCircle className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate max-w-[180px]">{item.fileName}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(item.processedAt), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-muted-foreground">
                        {item.componentName}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium">{item.rows.length}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${getConfidenceBg(item.averageConfidence)}`}
                      >
                        {item.averageConfidence.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(item.processedAt), "MMM d, yyyy")}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          to="/history/$id"
                          params={{ id: item.id }}
                          className="p-2 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          title="View details"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => handleDownload(item)}
                          className="p-2 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                          title="Download Excel"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="p-2 rounded-md hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing {filtered.length} of {history.length} records · stored in browser localStorage
        </p>
      )}
    </div>
  );
}
