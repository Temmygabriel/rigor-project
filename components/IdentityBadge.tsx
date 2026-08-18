"use client";

import { useEffect, useRef, useState } from "react";
import { useIdentity } from "@/app/providers";
import { shortAddr } from "@/lib/format";

export function IdentityBadge() {
  const { identity, ready, reset } = useIdentity();
  const [open, setOpen] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [mmAddress, setMmAddress] = useState<string | null>(null);
  const [mmError, setMmError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Reset ephemeral state every time the menu closes
  useEffect(() => {
    if (!open) {
      setShowKey(false);
      setCopiedAddr(false);
      setCopiedKey(false);
      setMmError(null);
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function connectMetaMask() {
    setMmError(null);
    const eth = (window as { ethereum?: { request: (a: { method: string }) => Promise<string[]> } }).ethereum;
    if (!eth) {
      setMmError("MetaMask isn't installed. Add the extension and try again.");
      return;
    }
    try {
      const accounts = await eth.request({ method: "eth_requestAccounts" });
      setMmAddress(accounts[0] ?? null);
    } catch (err: unknown) {
      if ((err as { code?: number }).code === 4001) {
        setMmError("Connection cancelled.");
      } else {
        setMmError("MetaMask connection failed.");
      }
    }
  }

  function copyText(text: string, setter: (v: boolean) => void) {
    navigator.clipboard.writeText(text).then(() => {
      setter(true);
      setTimeout(() => setter(false), 1800);
    });
  }

  if (!ready || !identity) {
    return (
      <span className="idchip">
        <span className="seal" />
        <span className="mono muted">connecting…</span>
      </span>
    );
  }

  const displayAddress = mmAddress ?? identity.address;
  const displayLabel = mmAddress ? "MetaMask (display only)" : "Browser identity";

  return (
    <div ref={menuRef} style={{ position: "relative" }}>
      {/* --- chip trigger --- */}
      <button
        className="idchip"
        onClick={() => setOpen((v) => !v)}
        title="Open wallet menu"
        style={{ cursor: "pointer", border: "none" }}
      >
        <span className="seal" />
        <span className="addr">{shortAddr(identity.address)}</span>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--ink-faint)",
          paddingLeft: 6,
          borderLeft: "1px solid var(--rule)",
          marginLeft: 2,
        }}>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {/* --- dropdown menu --- */}
      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          right: 0,
          width: 320,
          background: "linear-gradient(180deg, var(--paper-raised), var(--paper))",
          border: "1px solid var(--rule-strong)",
          borderRadius: "var(--radius)",
          boxShadow: "var(--shadow-card)",
          zIndex: 100,
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
        }}>

          {/* address row */}
          <div>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--ink-faint)",
              marginBottom: 6,
            }}>
              {displayLabel}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                color: "var(--ink)",
                background: "var(--well)",
                border: "1px solid var(--rule)",
                borderRadius: 4,
                padding: "4px 8px",
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {displayAddress}
              </span>
              <button
                className="btn btn-ghost"
                style={{ padding: "4px 10px", fontSize: 12 }}
                onClick={() => copyText(displayAddress, setCopiedAddr)}
              >
                {copiedAddr ? "Copied" : "Copy"}
              </button>
            </div>
            {mmAddress && (
              <div style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--ink-faint)",
                marginTop: 5,
              }}>
                Signer (actual): {shortAddr(identity.address)}
              </div>
            )}
          </div>

          <hr className="hr" style={{ margin: 0 }} />

          {/* honest signing notice */}
          <div className="marginnote" style={{ fontSize: "0.88rem", padding: "9px 12px" }}>
            Every transaction is signed by your browser-stored identity, not MetaMask.
            MetaMask can't sign for this chain. If you connected it above, it's shown for reference only.
          </div>

          <hr className="hr" style={{ margin: 0 }} />

          {/* private key section */}
          <div>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--ink-faint)",
              marginBottom: 8,
            }}>
              Private key
            </div>
            {!showKey ? (
              <button
                className="btn btn-ghost"
                style={{ fontSize: 12, width: "100%" }}
                onClick={() => setShowKey(true)}
              >
                Show private key
              </button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  background: "var(--well)",
                  border: "1px solid var(--rule-strong)",
                  borderRadius: 4,
                  padding: "8px 10px",
                  wordBreak: "break-all",
                  userSelect: "all",
                  color: "var(--ink-soft)",
                }}>
                  {identity.privateKey}
                </div>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12 }}
                  onClick={() => copyText(identity.privateKey, setCopiedKey)}
                >
                  {copiedKey ? "Copied" : "Copy private key"}
                </button>
                <div style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--ink-faint)",
                }}>
                  Stored only in this browser. Clearing site data or switching devices loses it permanently — save it somewhere if you have a funded balance.
                </div>
              </div>
            )}
          </div>

          <hr className="hr" style={{ margin: 0 }} />

          {/* MetaMask section */}
          <div>
            {!mmAddress ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button
                  className="btn"
                  style={{ fontSize: 12, width: "100%" }}
                  onClick={connectMetaMask}
                >
                  Connect MetaMask (display only)
                </button>
                {mmError && (
                  <div style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--red)",
                  }}>
                    {mmError}
                  </div>
                )}
              </div>
            ) : (
              <button
                className="btn btn-ghost"
                style={{ fontSize: 12, width: "100%" }}
                onClick={() => setMmAddress(null)}
              >
                Hide MetaMask address
              </button>
            )}
          </div>

          <hr className="hr" style={{ margin: 0 }} />

          {/* new identity */}
          <button
            className="btn btn-ghost"
            style={{ fontSize: 12, color: "var(--red)", width: "100%" }}
            onClick={() => {
              if (window.confirm(
                "Generate a new browser identity? Your current address stays on-chain, but this browser will act as a different address going forward."
              )) {
                reset();
                setOpen(false);
              }
            }}
          >
            Generate new identity
          </button>
        </div>
      )}
    </div>
  );
}
