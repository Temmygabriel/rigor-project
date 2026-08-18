"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useIdentity } from "@/app/providers";
import { registerPaper } from "@/lib/contract";
import { extractArxivId, genToWei } from "@/lib/format";
import { ARXIV_ABS } from "@/lib/config";
import { friendlyError } from "@/lib/errors";
import { TxProgress } from "@/components/TxProgress";

export default function RegisterPage() {
  const router = useRouter();
  const { identity, ready } = useIdentity();
  const [title, setTitle] = useState("");
  const [arxiv, setArxiv] = useState("");
  const [bounty, setBounty] = useState("");
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const busy = !!step;

  const previewId = extractArxivId(arxiv);

  async function submit() {
    setError(null);
    setSuccess(null);
    if (!ready || !identity) {
      setError("Identity is still initializing — try again in a moment.");
      return;
    }
    const cleanTitle = title.trim();
    if (cleanTitle.length < 3) {
      setError("Give the paper a title so hunters can recognize it.");
      return;
    }
    const arxivId = extractArxivId(arxiv);
    if (!arxivId) {
      setError("Enter a valid arXiv id (e.g. 2401.12345) or paste an arxiv.org link.");
      return;
    }
    let bountyWei: bigint;
    try {
      bountyWei = genToWei(bounty);
    } catch (e) {
      setError(friendlyError(e));
      return;
    }
    if (bountyWei <= 0n) {
      setError("Seed the bounty with more than zero GEN — it's the reward hunters compete for.");
      return;
    }

    try {
      const { paperId } = await registerPaper(
        identity.account,
        identity.address,
        cleanTitle,
        arxivId,
        bountyWei,
        setStep
      );
      setStep(null);
      if (paperId) {
        setSuccess(`Registered as ${paperId}. Taking you to the paper…`);
        router.push(`/paper/${paperId}`);
      } else {
        setSuccess(
          "Registered — but the new id wasn't readable yet (the indexer may lag). Check the dashboard shortly."
        );
      }
    } catch (e) {
      setStep(null);
      setError(friendlyError(e));
    }
  }

  return (
    <div className="narrow" style={{ margin: "0 auto" }}>
      <div className="crumb">
        <Link href="/">Rigor</Link> / <Link href="/dashboard">bounties</Link> / register
      </div>

      <div className="kicker">Submit for scrutiny</div>
      <h1 style={{ fontSize: "clamp(1.9rem, 4vw, 2.6rem)" }}>Register a paper</h1>
      <p className="lede" style={{ marginBottom: 26 }}>
        Put a bounty on a specific arXiv paper. Your seed becomes the reward pool that hunters
        compete to claim by finding a substantive flaw.
      </p>

      <div className="card">
        <div className="field">
          <label className="label" htmlFor="title">
            Paper title
          </label>
          <input
            id="title"
            className="input"
            placeholder="e.g. Attention Is All You Need"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="arxiv">
            arXiv id or link
          </label>
          <input
            id="arxiv"
            className="input mono"
            placeholder="2401.12345  ·  or  https://arxiv.org/abs/2401.12345"
            value={arxiv}
            onChange={(e) => setArxiv(e.target.value)}
            disabled={busy}
          />
          <div className="hint">
            {previewId ? (
              <>
                Resolves to <span className="mono">arXiv:{previewId}</span> —{" "}
                <a href={ARXIV_ABS(previewId)} target="_blank" rel="noreferrer">
                  view on arxiv.org
                </a>
              </>
            ) : (
              "Validators fetch the live paper from this id at judgment time. A bare id or a full link both work."
            )}
          </div>
        </div>

        <div className="field" style={{ marginBottom: 8 }}>
          <label className="label" htmlFor="bounty">
            Seed bounty
          </label>
          <div className="suffix-row">
            <input
              id="bounty"
              className="input"
              inputMode="decimal"
              placeholder="e.g. 10"
              value={bounty}
              onChange={(e) => setBounty(e.target.value)}
              disabled={busy}
            />
            <span className="suffix">GEN</span>
          </div>
          <div className="hint">
            Held in escrow by the contract. A share is paid to each hunter whose critique is judged
            substantive.
          </div>
        </div>

        <div className="marginnote" style={{ marginBottom: 18 }}>
          <strong>Payable action:</strong> this transfers your seed bounty and is signed by your
          browser identity — it needs a funded studionet balance.
        </div>

        <div className="btn-row">
          <button className="btn btn-red btn-lg" onClick={submit} disabled={busy}>
            {busy ? "Working…" : "Register & fund bounty"}
          </button>
          <Link href="/dashboard" className="btn btn-ghost" aria-disabled={busy}>
            Cancel
          </Link>
        </div>

        <div style={{ marginTop: 16 }}>
          <TxProgress step={step} error={error} success={success} />
        </div>
      </div>
    </div>
  );
}
