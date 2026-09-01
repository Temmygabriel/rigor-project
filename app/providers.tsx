"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  importIdentity as importIdentityFromPk,
  loadOrCreateIdentity,
  resetIdentity,
  type Identity,
} from "@/lib/identity";

interface IdentityCtx {
  identity: Identity | null;
  ready: boolean;
  reset: () => void;
  // Recover a browser identity from a saved/imported private key. Applies the
  // new identity to state on success so every consumer re-signs as the new
  // address. Returns the same { identity } | { error } shape the lib returns.
  importIdentity: (
    pk: string
  ) => { identity: Identity } | { error: string };
}

const Ctx = createContext<IdentityCtx>({
  identity: null,
  ready: false,
  reset: () => {},
  importIdentity: () => ({ error: "Identity not ready yet." }),
});

export function Providers({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [ready, setReady] = useState(false);

  // localStorage + key derivation happen only in the browser, never during SSR.
  useEffect(() => {
    setIdentity(loadOrCreateIdentity());
    setReady(true);
  }, []);

  const reset = () => setIdentity(resetIdentity());

  const importIdentity = (pk: string) => {
    const result = importIdentityFromPk(pk);
    if ("identity" in result) setIdentity(result.identity);
    return result;
  };

  return (
    <Ctx.Provider value={{ identity, ready, reset, importIdentity }}>
      {children}
    </Ctx.Provider>
  );
}

export function useIdentity() {
  return useContext(Ctx);
}
