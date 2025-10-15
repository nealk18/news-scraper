import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "News Credibility",
  description: "Quick stylistic/bias signals for news articles",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh text-white antialiased">
        {/* subtle animated background defined in globals.css */}
        <div className="ripple" />
        {children}
      </body>
    </html>
  );
}
