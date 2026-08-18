import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "@/components/Header";
import { CONTRACT_ADDRESS, EXPLORER_BASE } from "@/lib/config";

export const metadata: Metadata = {
  title: "Rigor — adversarial peer review, settled by consensus",
  description:
    "Fund a bounty on a real arXiv paper. Bounty-hunt its flaws. GenLayer validators independently fetch the paper and judge together — no single reviewer, and no single AI call, decides.",
};

const FONTS =
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,900&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=IBM+Plex+Mono:wght@400;500&display=swap";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href={FONTS} rel="stylesheet" />
      </head>
      <body suppressHydrationWarning>
        <Providers>
          <div className="bg-field" aria-hidden />
          <Header />
          <main className="page">{children}</main>
          <footer className="footer">
            <span>
              Rigor · a GenLayer intelligent contract on studionet · gasless testnet
            </span>
            <span>
              <a
                href={`${EXPLORER_BASE}/contracts/${CONTRACT_ADDRESS}`}
                target="_blank"
                rel="noreferrer"
              >
                contract {CONTRACT_ADDRESS.slice(0, 6)}…{CONTRACT_ADDRESS.slice(-4)}
              </a>
            </span>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
