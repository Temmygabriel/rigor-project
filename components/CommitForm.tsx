"use client";

import { useState } from "react";
import { useIdentity } from "@/app/providers";
import { commitCritique } from "@/lib/contract";
import { commitHash, genToWei, randomSalt } from "@/lib/format";
import { saveDraft, updateDraft } from "@/lib/storage";
import { friendlyError } from "@/lib/errors";
import { TxProgress } from "./TxProgress";

export function CommitForm({
  paperId,
  paperTitle,
  onDone,
}: {
  paperId: string;
  paperTitle: string;
  onDone: () => void;
}) {
  const { identity, ready } = useIdentity();
  const [text, setText] = useState("");
  const [stake, setStake] = useState("");
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const busy = !!step;

  async function submit() {
    setError(null);
    setSuccess(null);
    if (!ready || !identity) {
      setError("Identity is still initializing — try again in a moment.");
      return;
    }
    const body = text.trim();
    if (body.length < 12) {
      setError("Write a substantive critique first — at least a full sentence describing the flaw.");
      return;
    }
    let stakeWei: bigint;
    try {
      stakeWei = genToWei(stake);
    } catch (e) {
      setError(friendlyError(e));
      return;
    }
    if (stakeWei <= 0n) {
      setError("Your stake must be greater than zero — it's the bond you risk if the critique is frivolous.");
      return;
    }

    try {
      const salt = randomSalt();
      const hash = await commitHash(body, salt);
      // Persist the reveal secret BEFORE sending the tx, so it can never be lost
      // between commit and reveal.
      saveDraft(identity.address, {
        paperId,
        paperTitle,
        critiqueId: null,
        text: body,
        salt,
        commitHash: hash,
        stakeWei: stakeWei.toString(),
        createdAt: Date.now(),
      });
      setStep("Sealing your critique…");
      const { critiqueId } = await commitCritique(
        identity.account,
        paperId,
        hash,
        stakeWei,
        setStep
      );
      if (critiqueId) updateDraft(identity.address, hash, { critiqueId });
      setStep(null);
      setSuccess(
        `Committed${critiqueId ? ` as ${critiqueId}` : ""}. Only the hash is public — your text stays sealed in this browser until you reveal it after the response window opens.`
      );
      setText("");
      setStake("");
      onDone();
    } catch (e) {
      setStep(null);
      setError(friendlyError(e));
    }
  }

  return (
    <div className="stack">
      <div className="field" style={{ margin: 0 }}>
        <label className="label" htmlFor="critique">
          Your critique
        </label>
        <textarea
          id="critique"
          className="textarea"
          placeholder="Name the specific flaw — a broken assumption, a proof gap, an experiment that doesn't support the claim. Point to sections. This text is hashed now and revealed later."
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
        />
        <div className="hint">
          Committed as <span className="mono">sha256(text + secret salt)</span>. The salt is
          generated and stored locally for you — nothing about the text is on-chain until you reveal.
        </div>
      </div>

      <div className="field" style={{ margin: 0 }}>
        <label className="label" htmlFor="stake">
          Your stake
        </label>
        <div className="suffix-row">
          <input
            id="stake"
            className="input"
            inputMode="decimal"
            placeholder="e.g. 1"
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            disabled={busy}
          />
          <span className="suffix">GEN</span>
        </div>
        <div className="hint">
          Returned in full if your critique is judged substantive or inconclusive; forfeited if
          judged frivolous.
        </div>
      </div>

      <div className="marginnote">
        <strong>Heads up:</strong> committing stakes native GEN, signed by your browser identity. On
        studionet that address needs a funded balance. Revealing, resolving, and cancelling never
        cost a stake.
      </div>

      <div className="btn-row">
        <button className="btn btn-red" onClick={submit} disabled={busy}>
          {busy ? "Working…" : "Seal & commit critique"}
        </button>
      </div>

      <TxProgress step={step} error={error} success={success} />
    </div>
  );
}
