"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Activity,
  Database,
  Settings,
  Terminal,
  Workflow,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";

const NAV_ITEMS = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Agents", href: "/agents", icon: Activity },
  { name: "Workflows", href: "/workflows", icon: Workflow },
  { name: "Knowledge Base", href: "/knowledge", icon: Database },
  { name: "Security", href: "/security", icon: ShieldAlert },
  { name: "Logs", href: "/logs", icon: Terminal },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Update main content margin when sidebar collapses
  useEffect(() => {
    if (!mounted) return;
    const main = document.querySelector("main");
    if (main) {
      main.classList.add("main-content");
      if (isCollapsed) {
        main.classList.add("sidebar-is-collapsed");
      } else {
        main.classList.remove("sidebar-is-collapsed");
      }
    }
  }, [isCollapsed, mounted]);

  return (
    <aside className={`sidebar ${isCollapsed ? "sidebar-collapsed" : ""}`}>
      {/* Logo area */}
      <div className="flex h-14 items-center justify-between px-4 border-b border-white/[0.06]">
        {!isCollapsed && (
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-violet-600">
              <Workflow className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold tracking-tight text-white truncate">
              Constella
            </span>
          </div>
        )}
        {isCollapsed && (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 mx-auto">
            <Workflow className="h-4 w-4 text-white" />
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`sidebar-nav-item ${isActive ? "active" : ""}`}
              title={isCollapsed ? item.name : undefined}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!isCollapsed && <span className="truncate">{item.name}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer / Collapse toggle */}
      <div className="p-3 border-t border-white/[0.06]">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="sidebar-nav-item w-full justify-center sm:justify-start"
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? (
            <ChevronRight className="h-5 w-5 shrink-0 mx-auto" />
          ) : (
            <>
              <ChevronLeft className="h-5 w-5 shrink-0" />
              <span className="truncate">Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
