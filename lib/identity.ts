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
//
// WALLET RECOVERY: the private key shown in the wallet menu is the only way to
// move an identity between browsers/devices. importIdentity(rawPk) lets a user
// paste a key they saved (or one exported from another GenLayer tool / the CLI's
// `genlayer account import`) and turn it back into the SAME address. The signer
// client in lib/genlayer.ts is keyed by address, so switching identity re-binds
// automatically.

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

// Normalize a user-pasted private key: trim whitespace, tolerate a missing or
// mixed-case 0x prefix. Returns a canonical lowercase 0x + 64-hex key, or null
// if it isn't a valid private key string.
export function normalizePk(raw: string): `0x${string}` | null {
  const pk = raw.trim();
  const body = /^0x/i.test(pk) ? pk.slice(2) : pk;
  if (!/^[0-9a-fA-F]{64}$/.test(body)) return null;
  return `0x${body.toLowerCase()}`;
}

// Derive the address a private key maps to WITHOUT persisting anything. Used by
// the wallet menu to preview the recovered address before the user commits.
export function deriveAddressFromPk(rawPk: string): string | null {
  const pk = normalizePk(rawPk);
  if (!pk) return null;
  try {
    return createAccount(pk).address as string;
  } catch {
    return null; // valid hex but not a usable curve scalar
  }
}

// Recover a browser identity from a saved/imported private key. Validates the
// format, derives the account, persists the key, and returns the new Identity.
// Does NOT touch state/context here — the caller wires it into the provider.
export function importIdentity(
  rawPk: string
): { identity: Identity } | { error: string } {
  const pk = normalizePk(rawPk);
  if (!pk) {
    return {
      error: "Invalid private key — expected 64 hex characters, optionally 0x-prefixed.",
    };
  }
  let account: GenAccount;
  try {
    account = createAccount(pk);
  } catch {
    return { error: "That key is valid hex but not a usable private key." };
  }
  if (typeof window !== "undefined") window.localStorage.setItem(PK_KEY, pk);
  return { identity: { privateKey: pk, address: account.address as `0x${string}`, account } };
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
