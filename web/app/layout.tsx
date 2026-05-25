import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jatayu — AI Executive Search",
  description: "Mandate-driven sourcing, ranking, and outreach.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-50 text-zinc-900 antialiased">{children}</body>
    </html>
  );
}
