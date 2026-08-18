import Link from "next/link";
import type { PaperRecord } from "@/lib/types";
import { shortAddr, weiToGen } from "@/lib/format";

export function PaperCard({ paper }: { paper: PaperRecord }) {
  return (
    <Link href={`/paper/${paper.paper_id}`} className="papercard">
      <div className="top">
        <div style={{ minWidth: 0 }}>
          <h3>{paper.title || "Untitled paper"}</h3>
          <div className="mono muted" style={{ fontSize: 13 }}>
            arXiv:{paper.arxiv_id}
          </div>
        </div>
        <div className="stat" style={{ textAlign: "right", flex: "none" }}>
          <span className="n">
            {weiToGen(paper.bounty_pool)}
            <span className="unit">GEN</span>
          </span>
          <span className="k">bounty pool</span>
        </div>
      </div>
      <div className="meta">
        <span>{paper.paper_id}</span>
        <span>
          {paper.critique_count} critique{paper.critique_count === 1 ? "" : "s"}
        </span>
        <span>sponsor {shortAddr(paper.sponsor)}</span>
      </div>
    </Link>
  );
}
