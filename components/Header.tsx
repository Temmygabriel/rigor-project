"use client";

import Link from "next/link";
import { IdentityBadge } from "./IdentityBadge";

export function Header() {
  return (
    <header className="site-header">
      <div className="inner">
        <Link href="/" className="wordmark" aria-label="Rigor home">
          Rigor<span className="dot">.</span>
          <span className="sub">peer review, settled by consensus</span>
        </Link>
        <nav className="nav">
          <Link href="/dashboard">Papers</Link>
          <Link href="/register">Register</Link>
          <IdentityBadge />
        </nav>
      </div>
    </header>
  );
}
