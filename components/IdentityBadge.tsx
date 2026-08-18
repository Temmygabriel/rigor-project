"use client";

import { useIdentity } from "@/app/providers";
import { shortAddr } from "@/lib/format";

export function IdentityBadge() {
  const { identity, ready, reset } = useIdentity();

  if (!ready || !identity) {
    return (
      <span className="idchip">
        <span className="seal" />
        <span className="mono muted">connecting…</span>
      </span>
    );
  }

  return (
    <span
      className="idchip"
      title="Your browser identity: a genlayer-js keypair stored locally in this browser. It signs studionet transactions. It is not a real wallet and holds no mainnet value."
    >
      <span className="seal" />
      <span className="addr">{shortAddr(identity.address)}</span>
      <button
        onClick={() => {
          if (
            window.confirm(
              "Generate a new browser identity? Papers and critiques made under your current address stay on-chain, but this browser will act as a different address."
            )
          ) {
            reset();
          }
        }}
      >
        new
      </button>
    </span>
  );
}
