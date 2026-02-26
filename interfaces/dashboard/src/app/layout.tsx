import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import { Sidebar } from "@/components/sidebar";

export const metadata: Metadata = {
  title: "Constella AI — Dashboard",
  description:
    "Enterprise AI Operating Platform — Monitor agents, manage workflows, and explore your knowledge base.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased font-sans">
        {/* ── Toast notifications (top-right) ── */}
        <Toaster
          position="top-right"
          richColors
          closeButton
          theme="dark"
          toastOptions={{
            className:
              "bg-zinc-900 border-zinc-800 text-zinc-100 shadow-xl",
          }}
        />

        {/* ── App shell: sidebar + main content ── */}
        <div className="flex h-screen overflow-hidden">
          {/* Sidebar navigation */}
          <Sidebar />

          {/* Main content area */}
          <main className="flex-1 overflow-y-auto">
            {/* Top ambient glow line */}
            <div
              aria-hidden
              className="pointer-events-none fixed top-0 left-64 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent z-50"
            />

            {/* Page content */}
            <div className="relative min-h-full">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
