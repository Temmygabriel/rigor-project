"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { loadOrCreateIdentity, resetIdentity, type Identity } from "@/lib/identity";

interface IdentityCtx {
  identity: Identity | null;
  ready: boolean;
  reset: () => void;
}

const Ctx = createContext<IdentityCtx>({
  identity: null,
  ready: false,
  reset: () => {},
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

  return <Ctx.Provider value={{ identity, ready, reset }}>{children}</Ctx.Provider>;
}

export function useIdentity() {
  return useContext(Ctx);
}
