"use client";

import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import type { GenAccount } from "./identity";

export { TransactionStatus };

// A single read-only client is enough for all view calls (no account needed).
let _readClient: ReturnType<typeof createClient> | null = null;

export function readClient() {
  if (!_readClient) {
    _readClient = createClient({ chain: studionet });
  }
  return _readClient;
}

// Write clients are bound to the signing account. We key a tiny cache by address
// so switching identity (reset) produces a fresh client.
let _writeCache: { address: string; client: ReturnType<typeof createClient> } | null = null;

export function writeClient(account: GenAccount) {
  const addr = (account as { address?: string }).address ?? "";
  if (!_writeCache || _writeCache.address !== addr) {
    _writeCache = { address: addr, client: createClient({ chain: studionet, account }) };
  }
  return _writeCache.client;
}
