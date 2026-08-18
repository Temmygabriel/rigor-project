"use client";

import type { CommitDraft } from "./types";

// Commit drafts live in localStorage, namespaced by hunter address. They hold
// the critique text + salt a hunter needs to reveal later. Losing them means the
// stake can only be recovered via cancel_unrevealed after the window.

function key(address: string) {
  return `rigor.drafts.${address.toLowerCase()}`;
}

export function loadDrafts(address: string): CommitDraft[] {
  if (typeof window === "undefined" || !address) return [];
  try {
    const raw = window.localStorage.getItem(key(address));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveDraft(address: string, draft: CommitDraft): void {
  if (typeof window === "undefined" || !address) return;
  const drafts = loadDrafts(address);
  // de-dupe by commitHash; newest wins
  const next = [draft, ...drafts.filter((d) => d.commitHash !== draft.commitHash)];
  window.localStorage.setItem(key(address), JSON.stringify(next));
}

export function updateDraft(
  address: string,
  commitHash: string,
  patch: Partial<CommitDraft>
): void {
  if (typeof window === "undefined" || !address) return;
  const drafts = loadDrafts(address).map((d) =>
    d.commitHash === commitHash ? { ...d, ...patch } : d
  );
  window.localStorage.setItem(key(address), JSON.stringify(drafts));
}

export function findDraftForCritique(
  address: string,
  paperId: string,
  commitHash: string
): CommitDraft | undefined {
  return loadDrafts(address).find(
    (d) => d.paperId === paperId && d.commitHash === commitHash
  );
}
