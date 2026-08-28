"use client";

import { useEffect, useMemo, useState } from "react";
import { useIdentity } from "@/app/providers";
import type { CritiqueRecord } from "@/lib/types";
import {
  cancelUnrevealed,
  getDistinctCommittersSince,
  resolveCritique,
  revealCritique,
} from "@/lib/contract";
import { findDraftForCritique } from "@/lib/storage";
import { MIN_WINDOW_ROUNDS, MIN_DISTINCT_COMMITTERS } from "@/lib/config";
import { shortAddr, STATUS_META, weiToGen } from "@/lib/format";
import { friendlyError } from "@/lib/errors";
import { StatusTag } from "./StatusTag";
import { TxProgress } from "./TxProgress";

const RESOLVED = new Set(["substantive", "frivolous", "duplicate", "inconclusive", "expired"]);

export function CritiqueItem({
  critique,
  roundCounter,
  onRefresh,
}: {
  critique: CritiqueRecord;
  roundCounter: number;
  onRefresh: () => void;
}) {
  const { identity } = useIdentity();
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showReveal, setShowReveal] = useState(false);
  const [revealText, setRevealText] = useState("");
  const [revealSalt, setRevealSalt] = useState("");
  const [fromDraft, setFromDraft] = useState(false);
  const busy = !!step;

  // FIX (steward feedback, issue 3): the real, enforced number, not a guess --
  // read straight from the contract's own get_distinct_committers_since, the
  // same helper resolve_critique/cancel_unrevealed check against internally.
  const [distinctCommitters, setDistinctCommitters] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDistinctCommittersSince(critique.committed_at_round).then((n) => {
      if (!cancelled) setDistinctCommitters(n);
    });
    return () => {
      cancelled = true;
    };
    // Re-check whenever the round counter moves, since that's what changes it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [critique.committed_at_round, roundCounter]);

  const isMine =
    !!identity &&
    identity.address.toLowerCase() === critique.hunter.toLowerCase();

  const roundsElapsed = Math.max(0, roundCounter - critique.committed_at_round);
  const roundsPassed = roundsElapsed >= MIN_WINDOW_ROUNDS;
  const roundsLeft = Math.max(0, MIN_WINDOW_ROUNDS - roundsElapsed);
  const distinctPassed = distinctCommitters !== null && distinctCommitters >= MIN_DISTINCT_COMMITTERS;
  // Only claim the window has passed once we actually know the distinct count --
  // showing "resolvable" based on rounds alone would be misleading now that
  // there's a second real gate.
  const windowPassed = roundsPassed && distinctPassed;

  const meta = STATUS_META[critique.status];
  const isResolved = RESOLVED.has(critique.status);
  const rewardWei = (() => {
    try {
      return BigInt(critique.reward_paid || "0");
    } catch {
      return 0n;
    }
  })();

  // Pull the reveal secret from this browser's saved drafts, if present.
  const draft = useMemo(() => {
    if (!identity) return undefined;
    return findDraftForCritique(
      identity.address,
      critique.paper_id,
      critique.commit_hash
    );
  }, [identity, critique.paper_id, critique.commit_hash]);

  useEffect(() => {
    if (draft && !revealText && !revealSalt) {
      setRevealText(draft.text);
      setRevealSalt(draft.salt);
      setFromDraft(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  async function doReveal() {
    setError(null);
    setSuccess(null);
    if (!identity) return;
    if (!revealText.trim() || !revealSalt.trim()) {
      setError("Both the original critique text and its salt are required to reveal.");
      return;
    }
    try {
      await revealCritique(
        identity.account,
        critique.critique_id,
        revealText,
        revealSalt.trim(),
        setStep
      );
      setStep(null);
      setSuccess("Revealed. It can be judged once the response window elapses.");
      setShowReveal(false);
      onRefresh();
    } catch (e) {
      setStep(null);
      setError(friendlyError(e));
    }
  }

  async function doResolve() {
    setError(null);
    setSuccess(null);
    if (!identity) return;
    try {
      await resolveCritique(identity.account, critique.critique_id, setStep);
      setStep(null);
      setSuccess("Judgment finalized.");
      onRefresh();
    } catch (e) {
      setStep(null);
      // resolve is a long consensus job; a timeout doesn't mean failure
      setError(friendlyError(e));
    }
  }

  async function doCancel() {
    setError(null);
    setSuccess(null);
    if (!identity) return;
    try {
      await cancelUnrevealed(identity.account, critique.critique_id, setStep);
      setStep(null);
      setSuccess("Commitment cancelled — the stake was returned to the hunter.");
      onRefresh();
    } catch (e) {
      setStep(null);
      setError(friendlyError(e));
    }
  }

  return (
    <div className="card inset">
      <div className="crit-head">
        <div className="crit-idrow">
          <span className="mono muted">{critique.critique_id}</span>
          <StatusTag status={critique.status} />
          {isMine && <span className="tag tag-faint">yours</span>}
        </div>
        <div className="stat" style={{ textAlign: "right", flex: "none" }}>
          <span className="n">
            {weiToGen(critique.stake)}
            <span className="unit">GEN</span>
          </span>
          <span className="k">staked</span>
        </div>
      </div>

      <div className="meta" style={{ marginTop: 8 }}>
        <span>hunter {shortAddr(critique.hunter)}</span>
        <span>committed round {critique.committed_at_round}</span>
        {isResolved && critique.resolved_round > 0 && (
          <span>resolved round {critique.resolved_round}</span>
        )}
      </div>

      {/* Revealed / resolved text */}
      {critique.revealed && critique.critique_text && (
        <blockquote className="crit-text">{critique.critique_text}</blockquote>
      )}

      {/* Verdict detail after resolution */}
      {isResolved && (
        <div
          className={`notice notice-${
            meta.tone === "green" ? "green" : meta.tone === "red" ? "red" : "blue"
          }`}
        >
          <strong>{meta.label}.</strong> {meta.note}
          {critique.verdict_detail ? ` — ${critique.verdict_detail}` : ""}
          {rewardWei > 0n && (
            <div style={{ marginTop: 6 }}>
              Reward paid: <strong>{weiToGen(critique.reward_paid)} GEN</strong>
            </div>
          )}
        </div>
      )}

      {/* --- actions ------------------------------------------------------- */}

      {/* Committed, not yet revealed */}
      {critique.status === "committed" && !critique.revealed && (
        <div className="crit-actions">
          {isMine && (
            <>
              {!showReveal ? (
                <div className="btn-row">
                  <button className="btn btn-red" onClick={() => setShowReveal(true)} disabled={busy}>
                    Reveal critique
                  </button>
                  {windowPassed && (
                    <button className="btn btn-ghost" onClick={doCancel} disabled={busy}>
                      Reclaim stake instead
                    </button>
                  )}
                </div>
              ) : (
                <div className="stack">
                  {fromDraft && (
                    <div className="hint">
                      ✓ Loaded the original text and salt saved in this browser at commit time.
                    </div>
                  )}
                  <div className="field" style={{ margin: 0 }}>
                    <label className="label">Original critique text</label>
                    <textarea
                      className="textarea"
                      value={revealText}
                      onChange={(e) => {
                        setRevealText(e.target.value);
                        setFromDraft(false);
                      }}
                      disabled={busy}
                    />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label className="label">Salt</label>
                    <input
                      className="input mono"
                      value={revealSalt}
                      onChange={(e) => {
                        setRevealSalt(e.target.value);
                        setFromDraft(false);
                      }}
                      disabled={busy}
                    />
                    <div className="hint">
                      Must match the text + salt that produced the sealed hash, byte for byte.
                    </div>
                  </div>
                  <div className="btn-row">
                    <button className="btn btn-red" onClick={doReveal} disabled={busy}>
                      {busy ? "Working…" : "Reveal now"}
                    </button>
                    <button className="btn btn-ghost" onClick={() => setShowReveal(false)} disabled={busy}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {!isMine && !windowPassed && (
            <div className="hint">Sealed — awaiting the hunter's reveal.</div>
          )}

          {!isMine && windowPassed && (
            <div className="stack">
              <div className="hint">
                The hunter never revealed within the window. Anyone may return their stake.
              </div>
              <div className="btn-row">
                <button className="btn btn-ghost" onClick={doCancel} disabled={busy}>
                  {busy ? "Working…" : "Return stake (expired)"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Revealed, awaiting/eligible for judgment */}
      {critique.status === "revealed" && (
        <div className="crit-actions">
          {windowPassed ? (
            <div className="stack">
              <div className="hint">
                Response window elapsed. Anyone can trigger validator judgment — validators
                independently fetch the paper and reach consensus.
              </div>
              <div className="btn-row">
                <button className="btn btn-red" onClick={doResolve} disabled={busy}>
                  {busy ? "Judging…" : "Resolve — request judgment"}
                </button>
              </div>
            </div>
          ) : (
            <div className="hint">
              Resolvable once both conditions are met:{" "}
              {roundsPassed ? "✓" : `${roundsLeft} more commit-round${roundsLeft === 1 ? "" : "s"}`}
              {" · "}
              {distinctCommitters === null
                ? "checking distinct committers…"
                : distinctPassed
                ? "✓ enough distinct committers"
                : `${distinctCommitters}/${MIN_DISTINCT_COMMITTERS} distinct hunters committed since`}
              . Each new commitment on any paper advances the clock; only DISTINCT addresses
              count toward the second condition.
            </div>
          )}
        </div>
      )}

      <TxProgress step={step} error={error} success={success} />
    </div>
  );
}
