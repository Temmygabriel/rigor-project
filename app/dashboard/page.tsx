"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { listPapers, getContractBalanceWei } from "@/lib/contract";
import type { PaperRecord } from "@/lib/types";
import { weiToGen } from "@/lib/format";
import { PaperCard } from "@/components/PaperCard";

export default function DashboardPage() {
  const [papers, setPapers] = useState<PaperRecord[] | null>(null);
  const [tvl, setTvl] = useState<bigint>(0n);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, balance] = await Promise.all([listPapers(), getContractBalanceWei()]);
      setPapers(list);
      setTvl(balance);
    } catch (e) {
      setPapers([]);
      setError("Couldn't reach the contract. The studionet RPC may be rate-limited — try again shortly.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="crumb">
        <Link href="/">Rigor</Link> / open bounties
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div className="kicker">The docket</div>
          <h1 style={{ fontSize: "clamp(1.9rem, 4vw, 2.6rem)" }}>Open bounties</h1>
        </div>
        <div className="statrow">
          <div className="stat">
            <span className="n">
              {papers ? papers.length : "—"}
            </span>
            <span className="k">papers</span>
          </div>
          <div className="stat">
            <span className="n">
              {weiToGen(tvl)}
              <span className="unit">GEN</span>
            </span>
            <span className="k">in escrow</span>
          </div>
          <Link href="/register" className="btn btn-red" style={{ alignSelf: "center" }}>
            Register a paper
          </Link>
        </div>
      </div>

      <hr className="hr" />

      {error && <div className="notice notice-red" style={{ marginBottom: 16 }}>{error}</div>}

      {papers === null && (
        <div className="progress">
          <span className="spinner" />
          <span>Reading the docket from studionet…</span>
        </div>
      )}

      {papers !== null && papers.length === 0 && !error && (
        <div className="empty">
          <p style={{ marginBottom: 14 }}>No papers under scrutiny yet.</p>
          <Link href="/register" className="btn btn-red">
            Be the first to register one
          </Link>
        </div>
      )}

      {papers !== null && papers.length > 0 && (
        <div className="paperlist">
          {papers.map((p) => (
            <PaperCard key={p.paper_id} paper={p} />
          ))}
        </div>
      )}
    </div>
  );
}
