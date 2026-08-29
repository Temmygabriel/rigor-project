export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  "0x3e7f4a06265d83563E8Fa23F73df56D6BB6f902D") as `0x${string}`;

export const EXPLORER_BASE = "https://genlayer-explorer.vercel.app";

// Mirrors on-chain constants. Both gates must pass before resolution:
// 1. MIN_WINDOW_ROUNDS elapsed since the critique's commit round.
// 2. MIN_DISTINCT_COMMITTERS distinct addresses committed to OTHER papers
//    since then — same-paper commits are excluded so a hunter cannot
//    manufacture window progress by having allies commit to the same paper.
// Informational for the UI only — the contract is the enforcer.
export const MIN_WINDOW_ROUNDS = 5;
export const MIN_DISTINCT_COMMITTERS = 5;

export const ARXIV_ABS = (id: string) => `https://arxiv.org/abs/${id}`;
