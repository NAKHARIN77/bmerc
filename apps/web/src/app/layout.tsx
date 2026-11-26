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

// Some browsers translate anyway (a forced "always translate" setting, translation extensions). They wrap text in
// <font> tags, so when React later removes or inserts next to a node it no longer finds it where it put it and the
// whole page crashes. Make those two DOM calls forgiving so a translated page keeps working.
const TOLERATE_TRANSLATION = `(function(){if(typeof Node!=="function"||!Node.prototype)return;var r=Node.prototype.removeChild;Node.prototype.removeChild=function(c){if(c.parentNode!==this){return c}return r.apply(this,arguments)};var i=Node.prototype.insertBefore;Node.prototype.insertBefore=function(n,ref){if(ref&&ref.parentNode!==this){return i.call(this,n,null)}return i.apply(this,arguments)}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" translate="no" className={`${inter.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TOLERATE_TRANSLATION }} />
      </head>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
