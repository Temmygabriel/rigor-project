import Link from "next/link";

export default function LandingPage() {
  return (
    <div>
      <div className="hero">
        <div className="kicker">Adversarial peer review</div>
        <h1>
          Vote with your <span className="pen">reputation</span>. Judged by consensus.
        </h1>
        <p className="lede">
          Fund a bounty on a real arXiv paper. Stake a bond to bounty-hunt its flaws.
          GenLayer validators independently fetch the live paper and reach consensus on
          whether a critique is substantive — no single reviewer, and no single AI call,
          decides.
        </p>
        <div className="btn-row">
          <Link href="/dashboard" className="btn btn-red btn-lg">
            Browse open bounties
          </Link>
          <Link href="/register" className="btn btn-ghost btn-lg">
            Register a paper
          </Link>
        </div>
      </div>

      <ol className="steps" style={{ marginTop: 34 }}>
        <li>
          <h3>Seal</h3>
          <p>
            Pick your critique privately. Only <span className="mono">sha256(text + salt)</span> is
            written on-chain — the text and the random salt stay in your browser until you
            choose to reveal.
          </p>
        </li>
        <li>
          <h3>Prove it belongs</h3>
          <p>
            Validators independently fetch the paper's full text at judgment time and read
            your revealed critique against it — not an abstract, not a summary.
          </p>
        </li>
        <li>
          <h3>Judge</h3>
          <p>
            Every validator judges whether the critique is substantive, and whether it
            repeats a finding already rewarded for this paper. Consensus, not a leader's
            unchecked claim, decides both.
          </p>
        </li>
        <li>
          <h3>Settle</h3>
          <p>
            A substantive critique earns a share of the bounty pool. Frivolous forfeits the
            stake. Duplicate or inconclusive returns it in full.
          </p>
        </li>
      </ol>

      <div className="marginnote" style={{ marginTop: 30, maxWidth: 640 }}>
        <strong>Honest note on identity:</strong> this demo signs transactions with a
        keypair generated and stored in your browser, not a real wallet. MetaMask can't
        sign for this chain — if you connect it, it's for display only. See the wallet
        menu in the header for details.
      </div>
    </div>
  );
}
