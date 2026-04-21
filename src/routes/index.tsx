import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { FileText, Layers, BarChart3, Clock, ArrowRight, TrendingUp } from "lucide-react";
import { getConfidenceBg, TYPE_COLORS, type TextType, type OcrResult } from "@/lib/types";
import { getHistory } from "@/lib/historyService";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function StatCard({
  label,
  value,
  icon: Icon,
  sub,
  color = "text-primary",
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {label}
          </p>
          <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        <div className="p-2.5 bg-accent rounded-lg">
          <Icon className="w-5 h-5 text-accent-foreground" />
        </div>
      </div>
    </div>
  );
}

function Dashboard() {
  const [history, setHistory] = useState<OcrResult[]>([]);

  useEffect(() => {
    setHistory(getHistory());
  }, []);

  const totalRows = history.reduce((sum, r) => sum + r.rows.length, 0);
  const avgConf =
    history.length > 0
      ? Math.round(
          (history.reduce((sum, r) => sum + r.averageConfidence, 0) / history.length) * 10,
        ) / 10
      : 0;

  const typeBreakdown: Record<string, number> = {};
  for (const result of history) {
    for (const row of result.rows) {
      typeBreakdown[row.type] = (typeBreakdown[row.type] || 0) + 1;
    }
  }

  const recent = history.slice(0, 5);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Overview of your OCR processing activity
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Processed"
          value={history.length}
          icon={FileText}
          sub="images processed"
        />
        <StatCard
          label="Total Rows"
          value={totalRows}
          icon={Layers}
          sub="text rows extracted"
          color="text-chart-2"
        />
        <StatCard
          label="Avg Confidence"
          value={`${avgConf}%`}
          icon={TrendingUp}
          sub="OCR accuracy"
          color={
            avgConf >= 80
              ? "text-emerald-600"
              : avgConf >= 60
                ? "text-amber-600"
                : "text-red-500"
          }
        />
        <StatCard
          label="In History"
          value={history.length}
          icon={Clock}
          sub="stored locally"
          color="text-chart-4"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Type Breakdown</h3>
          </div>
          {Object.keys(typeBreakdown).length > 0 ? (
            <div className="space-y-2.5">
              {Object.entries(typeBreakdown)
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => {
                  const total = Object.values(typeBreakdown).reduce((a, b) => a + b, 0);
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                  return (
                    <div key={type} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span
                          className={`px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[type as TextType] || TYPE_COLORS.Other}`}
                        >
                          {type}
                        </span>
                        <span className="text-muted-foreground">
                          {count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No data yet</p>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 bg-card border border-card-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold">Recent Activity</h3>
            </div>
            <Link
              to="/history"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {recent.length > 0 ? (
            <div className="space-y-2">
              {recent.map((item) => (
                <Link
                  key={item.id}
                  to="/history/$id"
                  params={{ id: item.id }}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors group"
                >
                  <div className="flex items-center justify-center w-8 h-8 bg-accent rounded-lg shrink-0">
                    <FileText className="w-4 h-4 text-accent-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                      {item.fileName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.rows.length} rows · {item.componentName}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${getConfidenceBg(item.averageConfidence)}`}
                    >
                      {item.averageConfidence}%
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(item.processedAt), { addSuffix: true })}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">No files processed yet</p>
              <p className="text-xs mt-1 mb-4">Upload a UI screenshot to get started</p>
              <Link
                to="/upload"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
              >
                Go to Upload <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
