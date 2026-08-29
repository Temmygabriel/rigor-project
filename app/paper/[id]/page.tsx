"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useIdentity } from "@/app/providers";
import {
  fundPaper,
  getPaper,
  getRoundCounter,
  listCritiquesForPaper,
} from "@/lib/contract";
import type { CritiqueRecord, PaperRecord } from "@/lib/types";
import { ARXIV_ABS, MIN_WINDOW_ROUNDS, MIN_DISTINCT_COMMITTERS } from "@/lib/config";
import { genToWei, shortAddr, weiToGen } from "@/lib/format";
import { friendlyError } from "@/lib/errors";
import { CommitForm } from "@/components/CommitForm";
import { CritiqueItem } from "@/components/CritiqueItem";
import { TxProgress } from "@/components/TxProgress";

export default function PaperDetailPage({ params }: { params: { id: string } }) {
  const paperId = params.id;
  const { identity, ready } = useIdentity();

  const [paper, setPaper] = useState<PaperRecord | null>(null);
  const [critiques, setCritiques] = useState<CritiqueRecord[]>([]);
  const [roundCounter, setRoundCounter] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [fundAmt, setFundAmt] = useState("");
  const [fundStep, setFundStep] = useState<string | null>(null);
  const [fundError, setFundError] = useState<string | null>(null);
  const [fundSuccess, setFundSuccess] = useState<string | null>(null);
  const funding = !!fundStep;

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [p, cs, rc] = await Promise.all([
        getPaper(paperId),
        listCritiquesForPaper(paperId),
        getRoundCounter(),
      ]);
      setPaper(p);
      setCritiques(cs);
      setRoundCounter(rc);
    } catch (e) {
      setLoadError("Couldn't load this paper — studionet may be rate-limited. Try refreshing.");
    } finally {
      setLoading(false);
    }
  }, [paperId]);

  useEffect(() => {
    load();
  }, [load]);

  async function doFund() {
    setFundError(null);
    setFundSuccess(null);
    if (!ready || !identity) {
      setFundError("Identity is still initializing — try again in a moment.");
      return;
    }
    let amountWei: bigint;
    try {
      amountWei = genToWei(fundAmt);
    } catch (e) {
      setFundError(friendlyError(e));
      return;
    }
    if (amountWei <= 0n) {
      setFundError("Enter an amount greater than zero.");
      return;
    }
    try {
      await fundPaper(identity.account, paperId, amountWei, setFundStep);
      setFundStep(null);
      setFundSuccess("Bounty topped up.");
      setFundAmt("");
      load();
    } catch (e) {
      setFundStep(null);
      setFundError(friendlyError(e));
    }
  }

  if (loading) {
    return (
      <div>
        <div className="crumb">
          <Link href="/">Rigor</Link> / <Link href="/dashboard">bounties</Link> / {paperId}
        </div>
        <div className="progress">
          <span className="spinner" />
          <span>Loading {paperId} from studionet…</span>
        </div>
      </div>
    );
  }

  if (!paper) {
    return (
      <div>
        <div className="crumb">
          <Link href="/">Rigor</Link> / <Link href="/dashboard">bounties</Link> / {paperId}
        </div>
        <div className="empty">
          <p style={{ marginBottom: 14 }}>
            {loadError ?? `No paper found for ${paperId}.`}
          </p>
          <Link href="/dashboard" className="btn">
            Back to bounties
          </Link>
        </div>
      </div>
    );
  }

  const arxivId = paper.arxiv_id;

  return (
    <div>
      <div className="crumb">
        <Link href="/">Rigor</Link> / <Link href="/dashboard">bounties</Link> /{" "}
        <span className="mono">{paper.paper_id}</span>
      </div>

      {/* --- paper header --- */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, flex: "1 1 320px" }}>
            <div className="kicker" style={{ marginBottom: 10 }}>
              Under scrutiny
              <span className="tag tag-green" style={{ marginLeft: 4 }}>
                <span className="dotc" />
                {paper.status || "active"}
              </span>
            </div>
            <h1 style={{ fontSize: "clamp(1.7rem, 3.4vw, 2.4rem)" }}>{paper.title}</h1>
            <p className="mono muted" style={{ margin: "0 0 4px" }}>
              arXiv:{arxivId} ·{" "}
              <a href={ARXIV_ABS(arxivId)} target="_blank" rel="noreferrer">
                read the paper ↗
              </a>
            </p>
            <p className="mono muted micro" style={{ margin: 0 }}>
              sponsor {shortAddr(paper.sponsor)} · registered round {paper.created_round}
            </p>
          </div>
          <div className="stat" style={{ textAlign: "right", flex: "none" }}>
            <span className="n" style={{ fontSize: "2.2rem" }}>
              {weiToGen(paper.bounty_pool)}
              <span className="unit">GEN</span>
            </span>
            <span className="k">reward pool</span>
          </div>
        </div>

        <hr className="hr" />

        {/* fund control */}
        <div className="field" style={{ margin: 0 }}>
          <label className="label" htmlFor="fund">
            Add to the bounty
          </label>
          <div className="suffix-row">
            <input
              id="fund"
              className="input"
              inputMode="decimal"
              placeholder="e.g. 5"
              value={fundAmt}
              onChange={(e) => setFundAmt(e.target.value)}
              disabled={funding}
            />
            <span className="suffix">GEN</span>
            <button className="btn" onClick={doFund} disabled={funding}>
              {funding ? "Working…" : "Top up"}
            </button>
          </div>
          <div className="hint">Anyone can grow the pool. Payable — signed by your browser identity.</div>
          <div style={{ marginTop: 12 }}>
            <TxProgress step={fundStep} error={fundError} success={fundSuccess} />
          </div>
        </div>
      </div>

      {/* --- submit a critique --- */}
      <div style={{ marginTop: 28 }}>
        <div className="kicker">Bounty-hunt</div>
        <h2 style={{ marginBottom: 6 }}>Submit a sealed critique</h2>
        <p className="muted" style={{ marginBottom: 16, maxWidth: 640 }}>
          Stake a bond and commit the hash of your critique. You'll reveal the text after the
          response window, and validators will judge it against the live paper — checking both
          whether it's substantive and whether it repeats a critique already rewarded here.
        </p>
        <div className="card">
          <CommitForm paperId={paper.paper_id} paperTitle={paper.title} onDone={load} />
        </div>
      </div>

      {/* --- critiques --- */}
      <div style={{ marginTop: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
          <div>
            <div className="kicker">The record</div>
            <h2 style={{ marginBottom: 0 }}>
              Critiques{critiques.length > 0 ? ` · ${critiques.length}` : ""}
            </h2>
          </div>
          <button className="btn btn-ghost" onClick={load}>
            Refresh
          </button>
        </div>

        {/* Both gates enforced on-chain: elapsed rounds, AND enough distinct
            addresses that (a) committed to a DIFFERENT paper since this
            critique's own commit, and (b) posted a meaningful stake to do so —
            a dust-stake commit on a throwaway paper does not count. */}
        <p className="micro muted" style={{ margin: "6px 0 16px" }}>
          Current commit-round: {roundCounter}. A critique becomes resolvable once at least{" "}
          {MIN_WINDOW_ROUNDS} rounds have elapsed since its commit AND at least{" "}
          {MIN_DISTINCT_COMMITTERS} distinct addresses have committed a meaningfully-staked
          critique to a <em>different</em> paper since then — this keeps one address (or a
          throwaway second paper) from rushing its own window with dust-stake commits.
        </p>

        {loadError && <div className="notice notice-red" style={{ marginBottom: 14 }}>{loadError}</div>}

        {critiques.length === 0 ? (
          <div className="empty">No critiques yet. Be the first to stake one.</div>
        ) : (
          <div className="crit-list">
            {critiques.map((c) => (
              <CritiqueItem
                key={c.critique_id}
                critique={c}
                roundCounter={roundCounter}
                onRefresh={load}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
