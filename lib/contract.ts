"use client";

import { CONTRACT_ADDRESS } from "./config";
import { readClient, writeClient, TransactionStatus } from "./genlayer";
import { padId } from "./format";
import type {
  GenAccount,
} from "./identity";
import type { ConfigRecord, CritiqueRecord, PaperRecord } from "./types";

const address = CONTRACT_ADDRESS;

export type OnStep = (msg: string) => void;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- low-level reads --------------------------------------------------------

async function read(functionName: string, args: unknown[] = []): Promise<unknown> {
  return readClient().readContract({ address, functionName, args } as never);
}

async function readJson<T>(functionName: string, args: unknown[] = []): Promise<T | null> {
  try {
    const r = await read(functionName, args);
    if (r === null || r === undefined || r === "") return null;
    const parsed = typeof r === "string" ? JSON.parse(r) : (r as T);
    return parsed as T;
  } catch {
    return null;
  }
}

export async function getPaperCounter(): Promise<number> {
  try {
    return Number(await read("get_paper_counter"));
  } catch {
    return 0;
  }
}

export async function getCritiqueCounter(): Promise<number> {
  try {
    return Number(await read("get_critique_counter"));
  } catch {
    return 0;
  }
}

export async function getRoundCounter(): Promise<number> {
  try {
    return Number(await read("get_round_counter"));
  } catch {
    return 0;
  }
}

// FIX (steward rejection, issue 3): paper_id is now required so the contract
// can exclude same-paper commits from the count. Passing only committedAtRound
// would return an over-counted number that doesn't match what the contract
// actually enforces in resolve_critique / cancel_unrevealed.
export async function getDistinctCommittersSince(
  committedAtRound: number,
  paperId: string
): Promise<number> {
  try {
    return Number(await read("get_distinct_committers_since", [committedAtRound, paperId]));
  } catch {
    return 0;
  }
}

export async function getContractBalanceWei(): Promise<bigint> {
  try {
    return BigInt(String(await read("get_contract_balance")));
  } catch {
    return 0n;
  }
}

export async function getConfig(): Promise<ConfigRecord | null> {
  return readJson<ConfigRecord>("get_config");
}

export async function getPaper(paperId: string): Promise<PaperRecord | null> {
  const rec = await readJson<PaperRecord>("get_paper", [paperId]);
  return rec && rec.paper_id ? rec : null;
}

export async function getCritique(critiqueId: string): Promise<CritiqueRecord | null> {
  const rec = await readJson<CritiqueRecord>("get_critique", [critiqueId]);
  return rec && rec.critique_id ? rec : null;
}

export async function getPaperCritiqueIds(paperId: string): Promise<string[]> {
  const arr = await readJson<string[]>("get_paper_critiques", [paperId]);
  return Array.isArray(arr) ? arr : [];
}

export async function getHunterCritiqueIds(hunter: string): Promise<string[]> {
  const arr = await readJson<string[]>("get_hunter_critiques", [hunter]);
  return Array.isArray(arr) ? arr : [];
}

// --- composite reads --------------------------------------------------------

export async function listPapers(): Promise<PaperRecord[]> {
  const n = await getPaperCounter();
  if (n <= 0) return [];
  const ids = Array.from({ length: n }, (_, i) => padId("PAP", i + 1));
  const papers = await Promise.all(ids.map((id) => getPaper(id)));
  return papers.filter((p): p is PaperRecord => !!p).reverse();
}

export async function listCritiquesForPaper(paperId: string): Promise<CritiqueRecord[]> {
  const ids = await getPaperCritiqueIds(paperId);
  const critiques = await Promise.all(ids.map((id) => getCritique(id)));
  return critiques.filter((c): c is CritiqueRecord => !!c).reverse();
}

// --- low-level writes -------------------------------------------------------

async function sendWrite(
  account: GenAccount,
  functionName: string,
  args: unknown[],
  valueWei?: bigint
): Promise<`0x${string}`> {
  const params: Record<string, unknown> = { address, functionName, args };
  if (valueWei && valueWei > 0n) params.value = valueWei;
  const txHash = await writeClient(account).writeContract(params as never);
  return txHash as `0x${string}`;
}

async function waitReceipt(
  txHash: `0x${string}`,
  retries: number,
  interval: number
): Promise<unknown> {
  return readClient().waitForTransactionReceipt({
    hash: txHash,
    status: TransactionStatus.FINALIZED,
    retries,
    interval,
  } as never);
}

// --- flows ------------------------------------------------------------------

export interface RegisterResult {
  txHash: `0x${string}`;
  paperId: string | null;
}

export async function registerPaper(
  account: GenAccount,
  myAddress: string,
  title: string,
  arxivId: string,
  bountyWei: bigint,
  onStep?: OnStep
): Promise<RegisterResult> {
  const before = await getPaperCounter();
  onStep?.("Submitting registration + bounty…");
  const txHash = await sendWrite(account, "register_paper", [title, arxivId], bountyWei);
  onStep?.("Waiting for the network to finalize…");
  await waitReceipt(txHash, 100, 5000);

  onStep?.("Reading back your new paper…");
  let counter = before;
  for (let i = 0; i < 10 && counter <= before; i++) {
    counter = await getPaperCounter();
    if (counter <= before) await sleep(2500);
  }
  let paperId: string | null = null;
  for (let n = counter; n > before; n--) {
    const cand = padId("PAP", n);
    const rec = await getPaper(cand);
    if (
      rec &&
      rec.sponsor?.toLowerCase() === myAddress.toLowerCase() &&
      rec.arxiv_id === arxivId
    ) {
      paperId = cand;
      break;
    }
  }
  return { txHash, paperId: paperId ?? (counter > before ? padId("PAP", counter) : null) };
}

export async function fundPaper(
  account: GenAccount,
  paperId: string,
  amountWei: bigint,
  onStep?: OnStep
): Promise<`0x${string}`> {
  onStep?.("Submitting top-up…");
  const txHash = await sendWrite(account, "fund_paper", [paperId], amountWei);
  onStep?.("Waiting for the network to finalize…");
  await waitReceipt(txHash, 100, 5000);
  return txHash;
}

export interface CommitResult {
  txHash: `0x${string}`;
  critiqueId: string | null;
}

export async function commitCritique(
  account: GenAccount,
  paperId: string,
  commitHashHex: string,
  stakeWei: bigint,
  onStep?: OnStep
): Promise<CommitResult> {
  onStep?.("Submitting sealed commitment + stake…");
  const txHash = await sendWrite(account, "commit_critique", [paperId, commitHashHex], stakeWei);
  onStep?.("Waiting for the network to finalize…");
  await waitReceipt(txHash, 100, 5000);

  onStep?.("Locating your commitment on-chain…");
  let critiqueId: string | null = null;
  for (let i = 0; i < 8 && !critiqueId; i++) {
    const ids = await getPaperCritiqueIds(paperId);
    for (const id of ids) {
      const rec = await getCritique(id);
      if (rec && rec.commit_hash === commitHashHex) {
        critiqueId = id;
        break;
      }
    }
    if (!critiqueId) await sleep(2500);
  }
  return { txHash, critiqueId };
}

export async function revealCritique(
  account: GenAccount,
  critiqueId: string,
  text: string,
  salt: string,
  onStep?: OnStep
): Promise<`0x${string}`> {
  onStep?.("Revealing critique text…");
  const txHash = await sendWrite(account, "reveal_critique", [critiqueId, text, salt]);
  onStep?.("Waiting for the network to finalize…");
  await waitReceipt(txHash, 100, 5000);
  return txHash;
}

export async function resolveCritique(
  account: GenAccount,
  critiqueId: string,
  onStep?: OnStep
): Promise<`0x${string}`> {
  onStep?.("Requesting validator judgment…");
  const txHash = await sendWrite(account, "resolve_critique", [critiqueId]);
  onStep?.(
    "Validators are independently fetching the paper and judging. This can take several minutes…"
  );
  await waitReceipt(txHash, 150, 5000);
  return txHash;
}

export async function cancelUnrevealed(
  account: GenAccount,
  critiqueId: string,
  onStep?: OnStep
): Promise<`0x${string}`> {
  onStep?.("Cancelling expired commitment…");
  const txHash = await sendWrite(account, "cancel_unrevealed", [critiqueId]);
  onStep?.("Waiting for the network to finalize…");
  await waitReceipt(txHash, 100, 5000);
  return txHash;
}

export { CONTRACT_ADDRESS };
