"use client";

import { createAccount, generatePrivateKey } from "genlayer-js";

// Rigor uses a browser-stored identity, not a real wallet. GenLayer studionet
// transactions are signed by a genlayer-js account (an in-browser keypair) —
// MetaMask cannot sign them directly. This is honest and clearly labeled in the
// UI as a display/demo identity.
//
// THE VIEM PRIVATE-KEY TRAP (earned the hard way, see architecture §7):
// createAccount() returns a viem account created via privateKeyToAccount(). That
// object does NOT expose `.privateKey`. If you try to persist `account.privateKey`
// you store the string "undefined" and a brand-new address regenerates on every
// reload. The fix: WE generate the key with generatePrivateKey(), persist OUR
// copy, and restore the account by passing that key back into createAccount(key).

const PK_KEY = "rigor.identity.pk.v1";

export type GenAccount = ReturnType<typeof createAccount>;

export interface Identity {
  privateKey: `0x${string}`;
  address: `0x${string}`;
  account: GenAccount;
}

function isValidPk(pk: string | null): pk is `0x${string}` {
  return !!pk && /^0x[0-9a-fA-F]{64}$/.test(pk);
}

// Call only from the browser (inside useEffect) — never during render/SSR.
export function loadOrCreateIdentity(): Identity {
  const stored = typeof window !== "undefined" ? window.localStorage.getItem(PK_KEY) : null;
  let pk: `0x${string}`;
  if (isValidPk(stored)) {
    pk = stored;
  } else {
    pk = generatePrivateKey();
    if (typeof window !== "undefined") window.localStorage.setItem(PK_KEY, pk);
  }
  const account = createAccount(pk);
  return { privateKey: pk, address: account.address as `0x${string}`, account };
}

export function resetIdentity(): Identity {
  const pk = generatePrivateKey();
  if (typeof window !== "undefined") window.localStorage.setItem(PK_KEY, pk);
  const account = createAccount(pk);
  return { privateKey: pk, address: account.address as `0x${string}`, account };
}
