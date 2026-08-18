// Deployed RigorBounty contract + network references.
//
// NEXT_PUBLIC_CONTRACT_ADDRESS is set in Vercel (and .env.local for dev). It
// falls back to the Studio-deployed contract whose admin key you control, so
// the app still runs if the env var is ever missing.
export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  "0xEB4b74d221dBeba35f26D486112fA06B81076508") as `0x${string}`;

export const EXPLORER_BASE = "https://genlayer-explorer.vercel.app";

// Mirrors the on-chain constant. Resolution requires this many commit-rounds to
// have elapsed since a critique was committed. Informational for the UI only —
// the contract is the enforcer.
export const MIN_WINDOW_ROUNDS = 5;

export const ARXIV_ABS = (id: string) => `https://arxiv.org/abs/${id}`;
