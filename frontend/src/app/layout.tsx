import type { Metadata } from "next"
import "./globals.css"
import { Sidebar } from "@/components/sidebar"
import { ThemeProvider } from "@/components/theme-provider"
import { PrivacyProvider } from "@/lib/privacy-context"

export const metadata: Metadata = {
  title: "Local Finance",
  description: "ANZ bank statement analyser",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background antialiased flex flex-col md:flex-row">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <PrivacyProvider>
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
              <main className="flex-1 min-w-0">{children}</main>
            </div>
          </PrivacyProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
