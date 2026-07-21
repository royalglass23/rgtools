import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import { getThemeBootstrapScript } from "@/components/theme/theme-bootstrap";
import "./globals.css";

const uiFont = Inter({
  subsets: ["latin"],
  variable: "--font-ui-family",
  display: "swap",
});

const displayFont = Manrope({
  subsets: ["latin"],
  variable: "--font-display-family",
  display: "swap",
});

export function generateMetadata(): Metadata {
  // Production (rgtools.co.nz, main) shows the Royal Glass brand;
  // every other environment (Vercel Preview / local dev) keeps the rgtools default.
  const isProduction = process.env.VERCEL_ENV === 'production';

  return {
    title: isProduction ? 'Royal Glass' : 'rgtools',
    description: 'Royal Glass internal tools',
    icons: {
      icon: isProduction ? '/favicon-royalglass.png' : '/favicon-rgtools.ico',
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`h-full antialiased ${uiFont.variable} ${displayFont.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: getThemeBootstrapScript() }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
