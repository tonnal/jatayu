import type { Metadata } from "next";
import { Hanken_Grotesk, Fraunces } from "next/font/google";
import "./globals.css";

// Refined grotesque for UI/body — characterful but enterprise-clean (not Inter).
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// Editorial serif for display headings — premium, optical-size aware.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  axes: ["opsz", "SOFT"],
});

export const metadata: Metadata = {
  title: "Jatayu — Executive Search Intelligence",
  description: "A guided search workflow: mandate to defensible shortlist.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${hanken.variable} ${fraunces.variable}`}>
      <body className="min-h-screen bg-[var(--color-canvas)] text-[var(--color-ink)] antialiased">{children}</body>
    </html>
  );
}
