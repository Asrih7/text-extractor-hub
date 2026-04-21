import { Link, useLocation } from "@tanstack/react-router";
import { LayoutDashboard, Upload, History, FileSpreadsheet, Menu } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/history", label: "History", icon: History },
];

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const pathname = location.pathname;
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col w-64 bg-sidebar border-r border-sidebar-border transition-transform duration-200 lg:relative lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-sidebar-primary">
            <FileSpreadsheet className="w-4 h-4 text-sidebar-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-sidebar-accent-foreground tracking-tight">
              OCR Extractor
            </h1>
            <p className="text-xs text-sidebar-foreground">UI to Excel</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                to={href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="px-6 py-4 border-t border-sidebar-border">
          <p className="text-xs text-sidebar-foreground">Powered by Tesseract.js + XLSX</p>
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-background">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            <span className="font-semibold text-sm">OCR Extractor</span>
          </div>
        </header>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
