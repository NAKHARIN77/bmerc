import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "BMERC", template: "%s · BMERC" },
  description: "Repair center management for Bitcoin mining equipment",
  // Browser page translation rewrites the page text behind React's back, which breaks buttons and forms
  // ("This page couldn't load" after Save) and mistranslates labels. The product is English only.
  other: { google: "notranslate" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" translate="no" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
