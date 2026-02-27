import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import { Sidebar } from "@/components/sidebar";
import { ThemeProvider } from "@/components/theme-provider";

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
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-bg-primary text-text-primary antialiased font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {/* ── Toast notifications (top-right) ── */}
          <Toaster
            position="top-right"
            richColors
            closeButton
            theme="system"
            toastOptions={{
              className:
                "bg-bg-secondary border-border text-text-primary shadow-xl",
            }}
          />

          {/* ── App shell: sidebar + main content ── */}
          <div className="flex h-screen overflow-hidden">
            {/* Sidebar navigation */}
            <Sidebar />

            {/* Main content area */}
            <main className="flex-1 overflow-y-auto relative bg-bg-primary">
              {/* Premium Grid Background */}
              <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080801a_1px,transparent_1px),linear-gradient(to_bottom,#8080801a_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
              </div>

              {/* Top ambient glow line */}
              <div
                aria-hidden
                className="pointer-events-none sticky top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand/40 to-transparent z-50"
              />

              {/* Top-level Command Bar Placeholder */}
              <div className="sticky top-0 z-40 flex items-center justify-between px-8 py-4 backdrop-blur-xl bg-bg-primary/60 border-b border-border/40">
                <div className="flex items-center text-sm text-text-secondary">
                  <span className="font-medium mr-2">War Room Overview</span>
                </div>
                <div className="flex items-center flex-1 max-w-lg ml-auto">
                  <div className="relative w-full group">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                      <svg className="w-4 h-4 text-text-tertiary group-focus-within:text-brand transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>
                    <input type="text" className="w-full pl-9 pr-12 py-1.5 bg-bg-secondary/40 backdrop-blur-sm border border-border/50 rounded-lg text-sm text-text-primary focus:outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/20 transition-all font-mono placeholder:text-text-tertiary/70" placeholder="Ask Constella or execute command..." />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                      <kbd className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-sans font-medium text-text-tertiary bg-bg-primary border border-border/50 rounded shadow-sm opacity-70">⌘K</kbd>
                    </div>
                  </div>
                </div>
              </div>

              {/* Page content */}
              <div className="relative z-10 min-h-full">
                {children}
              </div>
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
