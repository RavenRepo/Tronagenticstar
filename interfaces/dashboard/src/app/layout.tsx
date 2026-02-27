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
            <main className="flex-1 overflow-y-auto">
              {/* Top ambient glow line */}
              <div
                aria-hidden
                className="pointer-events-none fixed top-0 left-64 right-0 h-px bg-gradient-to-r from-transparent via-brand/40 to-transparent z-50"
              />

              {/* Page content */}
              <div className="relative min-h-full">
                {children}
              </div>
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
