// On-chain record shapes. View methods return JSON *strings* that we JSON.parse;
// money fields are decimal strings at wei-scale (10^18), which exceed JS's safe
// integer range, so they stay strings and are converted with BigInt at the edges.

export interface PaperRecord {
  paper_id: string;
  sponsor: string;
  title: string;
  arxiv_id: string;
  arxiv_url: string;
  bounty_pool: string; // wei decimal string
  status: string; // "active"
  critique_count: number;
  created_round: number;
}

export type CritiqueStatus =
  | "committed"
  | "revealed"
  | "substantive"
  | "frivolous"
  | "inconclusive"
  | "expired";

export interface CritiqueRecord {
  critique_id: string;
  paper_id: string;
  hunter: string;
  commit_hash: string;
  critique_text: string; // "" until revealed
  committed_at_round: number;
  revealed: boolean;
  stake: string; // wei decimal string
  status: CritiqueStatus;
  verdict: string;
  verdict_detail: string;
  reward_paid: string; // wei decimal string
  resolved_round: number;
}

export interface ConfigRecord {
  admin: string;
  protocol_fee_bps: number;
  protocol_fees_collected: string; // wei decimal string
  round_counter: number;
  min_window_rounds: number;
  reward_bps_of_pool: number;
  max_fee_bps: number;
}

// A locally-stored commit draft. The hunter MUST keep critique_text + salt to
// reveal later; if lost, the stake can only be recovered via cancel after the
// window. We persist it in localStorage keyed by the hunter address.
export interface CommitDraft {
  paperId: string;
  paperTitle: string;
  critiqueId: string | null; // filled once we resolve it from chain
  text: string;
  salt: string;
  commitHash: string;
  stakeWei: string;
  createdAt: number;
}
