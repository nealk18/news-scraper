import { Html } from "next/document";
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "News Credibility",
  description: "Quick stylistic/bias signals for news articels",
};

export default function RootLayout({ children } : { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
