import type { Metadata } from "next";
import { Cinzel, Work_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { NavBar } from "@/components/NavBar";

const display = Cinzel({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

const body = Work_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Delve",
  description:
    "An onchain dungeon crawl. Every turn is narrated by AI and settled by GenLayer validator consensus before it's written onchain.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        <div className="min-h-screen">
          <NavBar />
          <main className="mx-auto max-w-4xl px-4 pb-24 pt-8 sm:px-6">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
