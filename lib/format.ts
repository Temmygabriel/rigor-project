import type { CritiqueStatus } from "./types";

// --- money (wei <-> GEN) ----------------------------------------------------
// 1 GEN = 10^18 wei. Amounts stay as BigInt/strings end to end; we only format
// to a human decimal at the very edge (display) or parse at the very edge (input).

const WEI = 10n ** 18n;

export function weiToGen(wei: string | bigint, maxDecimals = 4): string {
  let v: bigint;
  try {
    v = typeof wei === "bigint" ? wei : BigInt(wei || "0");
  } catch {
    return "0";
  }
  const whole = v / WEI;
  const frac = v % WEI;
  if (frac === 0n) return whole.toString();
  const fracStr = frac
    .toString()
    .padStart(18, "0")
    .slice(0, maxDecimals)
    .replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

// Parse a user-entered GEN decimal string into wei. Throws on invalid input so
// callers can surface a clear message.
export function genToWei(gen: string): bigint {
  const s = (gen || "").trim();
  if (!s || !/^\d*\.?\d*$/.test(s) || s === ".") {
    throw new Error("Enter a valid amount, e.g. 1 or 0.5");
  }
  const [whole = "", frac = ""] = s.split(".");
  const fracPadded = (frac + "0".repeat(18)).slice(0, 18);
  return BigInt((whole || "0") + fracPadded);
}

// --- identifiers ------------------------------------------------------------

export function padId(prefix: "PAP" | "CRT", n: number): string {
  return `${prefix}${String(n).padStart(6, "0")}`;
}

export function shortAddr(a?: string): string {
  if (!a) return "—";
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

// Accept either a bare arXiv id (2401.12345, 2401.12345v2, math/0211159) or a
// pasted arxiv.org / export.arxiv.org URL, and return the bare id. The contract
// only accepts a bare id (it builds the canonical API URL itself), so we extract
// client-side for a friendlier paste-anything input.
export function extractArxivId(input: string): string | null {
  const s = (input || "").trim();
  if (!s) return null;
  const bare = s.match(/^(\d{4}\.\d{4,5}(v\d+)?|[a-z\-]+\/\d{7}(v\d+)?)$/i);
  if (bare) return s;
  const m = s.match(/(?:id_list=|abs\/|pdf\/)([^\s&?#]+?)(?:\.pdf)?(?:[?#&]|$)/i);
  return m ? m[1] : null;
}

// --- commit-reveal crypto ---------------------------------------------------
// MUST byte-match the contract: sha256((critique_text + salt).encode("utf-8"))
// .hexdigest() -> 64-char lowercase hex, no 0x prefix.

export function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function commitHash(text: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(text + salt);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// --- status presentation ----------------------------------------------------

export const STATUS_META: Record<
  CritiqueStatus,
  { label: string; tone: string; note: string }
> = {
  committed: {
    label: "Committed",
    tone: "neutral",
    note: "Hash sealed on-chain — the critique text is not yet public.",
  },
  revealed: {
    label: "Revealed",
    tone: "blue",
    note: "Text disclosed. Waiting out the response window before it can be judged.",
  },
  substantive: {
    label: "Substantive",
    tone: "green",
    note: "Validator consensus: a real flaw. Stake returned + reward paid.",
  },
  frivolous: {
    label: "Frivolous",
    tone: "red",
    note: "Validator consensus: not substantive. Stake forfeited.",
  },
  inconclusive: {
    label: "Inconclusive",
    tone: "amber",
    note: "Paper could not be fetched. No funds moved; stake returned.",
  },
  expired: {
    label: "Expired",
    tone: "faint",
    note: "Never revealed within the window. Stake returned in full.",
  },
};

export function toneFor(status: string): string {
  return (STATUS_META as Record<string, { tone: string }>)[status]?.tone ?? "neutral";
}

export function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
