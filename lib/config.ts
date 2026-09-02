export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  "0xa12c93B846A8525B00CF7fa812880541A1FA1d3f") as `0x${string}`;

export const EXPLORER_BASE = "https://genlayer-explorer.vercel.app";

// Mirrors on-chain constants. A committer only counts toward the distinct-
// committer gate if it BOTH (a) committed to a DIFFERENT paper than the one
// being resolved, and (b) posted at least the contract's min_quorum_stake
// (fetch the live value via get_config — it's admin-tunable, so don't
// hardcode it here). Both conditions exist together: cross-paper alone was
// free to fake with a throwaway paper + dust stakes; a stake floor alone
// didn't stop same-paper self-dealing. Informational for the UI only — the
// contract is the enforcer in every case.
export const MIN_WINDOW_ROUNDS = 5;
export const MIN_DISTINCT_COMMITTERS = 5;

export const ARXIV_ABS = (id: string) => `https://arxiv.org/abs/${id}`;
