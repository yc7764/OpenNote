import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { Toaster } from 'sonner';
import "./globals.css";
import QueryProvider from '@/providers/QueryProvider';
import { ThemeProvider } from '@/contexts/ThemeContext';
import AuthProviderWrapper from '@/providers/AuthProviderWrapper';
import { ConfirmProvider } from '@/components/common/ConfirmDialog';

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "OpenNote - AI Powered Notes",
  description: "Refactored OpenNote application with Next.js and Django",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        {/* Runtime environment variables injection for Docker deployment */}
        {/* This file is generated at container startup by scripts/env.sh */}
        {/* In development, this file may not exist (uses process.env instead) */}
        {/* Synchronous (no defer): must execute before Next.js bundle scripts */}
        {/* Ensures window.__ENV is set before config.ts module-level constants are evaluated */}
        <script src="/__ENV.js" />
      </head>
      <body
        className={`${poppins.className} bg-gray-50 dark:bg-gray-900`}
      >
        <ThemeProvider>
          <QueryProvider>
            <AuthProviderWrapper>
              <ConfirmProvider>
                {children}
              </ConfirmProvider>
            </AuthProviderWrapper>
          </QueryProvider>
          <Toaster
            position="top-center"
            expand={false}
            visibleToasts={1}
            closeButton={true}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
