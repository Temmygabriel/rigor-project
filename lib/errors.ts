"use client";

// Turn raw SDK/RPC/contract errors into something a person can act on. GenLayer
// surfaces contract revert reasons in the message; we also special-case the
// studionet 0-balance case, which is the most common stumbling block for a
// browser identity attempting a payable action.
export function friendlyError(e: unknown): string {
  const raw =
    (e as { shortMessage?: string })?.shortMessage ||
    (e as { message?: string })?.message ||
    String(e || "Something went wrong.");
  const low = raw.toLowerCase();

  if (low.includes("insufficient") || low.includes("balance") || low.includes("funds")) {
    return "This action stakes native GEN, but this browser identity's studionet balance is too low. Fund the address (studionet has no public faucet) or exercise payable flows on localnet. Reads, reveal, resolve, and cancel need no funds.";
  }
  if (low.includes("invalid parameters") || low.includes("invalid params")) {
    return "The network rejected the transaction parameters. If this was a payable action, the amount must be greater than zero.";
  }
  if (low.includes("user rejected") || low.includes("denied")) {
    return "The transaction was cancelled.";
  }
  if (low.includes("timeout") || low.includes("timed out") || low.includes("retries")) {
    return "Still waiting on the network. On studionet, judgment (web fetch + LLM + consensus) can take several minutes — refresh shortly to see the outcome.";
  }
  // contract reverts come through fairly readably — show them
  return raw.length > 300 ? raw.slice(0, 300) + "…" : raw;
}
