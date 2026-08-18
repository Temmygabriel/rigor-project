import Link from "next/link";

export default function LandingPage() {
  return (
    <div>
      <section className="hero">
        <div className="kicker">Adversarial peer review, settled on-chain</div>
        <h1>
          Put a bounty on being <span className="pen">wrong</span>.
        </h1>
        <p className="lede">
          Rigor turns scrutiny into a market. Anyone can fund a bounty on a real arXiv paper.
          Hunters stake a bond and submit a sealed critique. GenLayer validators independently
          fetch the live paper and reach consensus on whether the flaw is substantive — then the
          contract pays out or slashes accordingly. No editor, no committee, no trusted referee.
        </p>
        <div className="btn-row">
          <Link href="/dashboard" className="btn btn-red btn-lg">
            Browse open bounties
          </Link>
          <Link href="/register" className="btn btn-lg">
            Register a paper
          </Link>
        </div>
      </section>

      <hr className="hr" style={{ margin: "40px 0 28px" }} />

      <div className="kicker">The mechanism</div>
      <h2 style={{ marginBottom: 18 }}>How a critique gets settled</h2>
      <ol className="steps">
        <li>
          <h3>Fund a bounty</h3>
          <p>
            A sponsor registers an arXiv paper and seeds a reward pool in GEN. The pool is the
            prize for finding a genuine flaw — anyone can top it up.
          </p>
        </li>
        <li>
          <h3>Commit a sealed critique</h3>
          <p>
            A hunter stakes a bond and submits only a hash of their critique —{" "}
            <span className="mono">sha256(text + salt)</span>. The claim is timestamped on-chain
            without revealing it, so no one can front-run or plagiarize it.
          </p>
        </li>
        <li>
          <h3>Reveal after the window</h3>
          <p>
            Once the response window elapses, the hunter reveals the original text and salt. The
            contract checks it matches the sealed hash byte-for-byte.
          </p>
        </li>
        <li>
          <h3>Validators judge the evidence</h3>
          <p>
            Anyone can trigger resolution. GenLayer validators <em>independently</em> fetch the live
            paper and evaluate the critique against it, reaching consensus on a verdict — no single
            party decides.
          </p>
        </li>
        <li>
          <h3>Settlement is automatic</h3>
          <p>
            <strong>Substantive</strong> → stake returned and reward paid from the pool.{" "}
            <strong>Frivolous</strong> → stake forfeited. <strong>Inconclusive</strong> (paper
            unreachable) → stake returned, no reward. Never revealed → stake reclaimable.
          </p>
        </li>
      </ol>

      <div className="marginnote" style={{ marginTop: 28 }}>
        <strong>Why GenLayer:</strong> the verdict hinges on reading an external document and making
        a judgment that must be reproducible enough for independent validators to agree — exactly
        the subjective-but-verifiable settlement a normal smart contract can't do alone.
      </div>

      <div className="card" style={{ marginTop: 28 }}>
        <div className="kicker" style={{ marginBottom: 8 }}>Before you try it</div>
        <p style={{ marginBottom: 8 }}>
          This is a live demo on GenLayer <strong>studionet</strong>. When you first load the app it
          generates a local keypair in your browser — that's your identity here. It is{" "}
          <strong>not</strong> a real wallet: the key never leaves this device and isn't backed up.
        </p>
        <p style={{ margin: 0 }}>
          Reading is free. Payable actions (registering, funding, staking a critique) are signed by
          that browser identity and need a funded studionet balance. Revealing, resolving, and
          reclaiming a stake cost nothing.
        </p>
      </div>
    </div>
  );
}
