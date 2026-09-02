# Rigor — Frontend

The web client for **Rigor**, a GenLayer intelligent contract that turns academic scrutiny into a market: fund a bounty on a real arXiv paper, stake a bond to bounty-hunt its flaws, and let GenLayer validators independently fetch the paper and reach consensus on whether a critique is substantive.

Built with **Next.js 14** (App Router), **React 18**, **TypeScript**, and **genlayer-js**. It talks directly to the deployed contract on GenLayer **studionet** — there is no backend of its own.

---

## Quick start

```bash
cd frontend
npm install
cp .env.local.example .env.local   # optional — a sensible default is baked in
npm run dev
```

Open http://localhost:3000.

> `crypto.subtle` (used for the commit hash) requires a secure context. `localhost` counts as secure, so dev works out of the box; in production you must serve over HTTPS (Vercel does).

---

## Configuration

One environment variable, read at build time:

| Variable | Purpose | Default |
| --- | --- | --- |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | Address of the deployed `RigorBounty` contract on studionet | `0x4d00fDBaA7b0f54A79b1ac7c40bF68c2d886528a` |

The default points at the live Studio-deployed contract, so the app runs even if the variable is unset. Override it to point at your own deployment (see the contract deploy steps in the repo root).

The network (studionet) and RPC are supplied by `genlayer-js/chains` — nothing to configure.

---

## Deploy to Vercel

1. Push the repo to GitHub.
2. In Vercel: **New Project → import the repo**, and set the **Root Directory** to `frontend`.
3. Framework preset auto-detects **Next.js**. Leave build/output settings at their defaults.
4. Under **Settings → Environment Variables**, add:
   - `NEXT_PUBLIC_CONTRACT_ADDRESS` = your contract address (or the default above).
5. Deploy.

`next.config.mjs` already sets `transpilePackages: ["genlayer-js"]` and relaxes type/eslint blocking so a first deploy doesn't fail on a stray type mismatch in the SDK.

---

## How the app works

| Screen | Route | What it does |
| --- | --- | --- |
| Landing | `/` | Explains the commit → reveal → judge → settle mechanism and the honest browser-identity caveat. |
| Bounties | `/dashboard` | Lists every registered paper (newest first) with its pool and critique count. |
| Register | `/register` | Register a paper by arXiv id/link and seed its bounty. |
| Paper detail | `/paper/[id]` | Top up the bounty, commit a sealed critique, then reveal / resolve / reclaim per critique. |

### Browser identity (read this)

On first load the app generates a **genlayer-js keypair in your browser** and stores the private key in `localStorage`. That keypair is your identity here — it signs studionet transactions.

- It is **not** a real wallet. The key never leaves your device and isn't backed up. Clearing site data or hitting **"new"** in the header creates a different address.
- **Reads are free.** Payable actions (register, fund, commit) are signed by this identity and need a **funded studionet balance**. Reveal, resolve, and cancel cost no stake.

Why not MetaMask? GenLayer transactions are signed by a genlayer-js account, not an EVM injected provider — so a locally-held keypair is the honest, working choice for a demo. This is labeled everywhere it matters in the UI.

### The commit secret

When you commit a critique, the app hashes `sha256(text + salt)` (Web Crypto) and sends **only the hash** on-chain. It saves the original text + salt in `localStorage`, keyed by your address, so **Reveal** can auto-fill later. If you lose that (different browser, cleared storage), you can still reclaim your stake with **cancel** once the window elapses — but you can't reveal without the exact original text and salt.

---

## Project layout

```
frontend/
├── app/
│   ├── layout.tsx            root layout, fonts, header/footer
│   ├── providers.tsx         IdentityContext (browser keypair)
│   ├── globals.css           the manuscript / red-pen design system
│   ├── page.tsx              landing
│   ├── dashboard/page.tsx    bounty list
│   ├── register/page.tsx     register + fund a paper
│   └── paper/[id]/page.tsx   paper detail (fund / commit / reveal / resolve)
├── components/               Header, IdentityBadge, PaperCard, StatusTag,
│                             CommitForm, CritiqueItem, TxProgress
└── lib/
    ├── config.ts             contract address, explorer, constants
    ├── genlayer.ts           genlayer-js read/write clients
    ├── identity.ts           persistent browser keypair (the viem PK trap)
    ├── contract.ts           typed read/write flows against the ABI
    ├── storage.ts            localStorage commit drafts
    ├── format.ts             wei⇄GEN, arXiv id parsing, commit hashing, status meta
    ├── errors.ts             human-readable error messages
    └── types.ts              on-chain record shapes
```

---

## Notes for the next developer

A few things this client does deliberately, learned while building against studionet:

- **Never sends `value: 0`** on a payable write — the RPC rejects it. `sendWrite` only attaches `value` when it's `> 0n`.
- **Does not simulate payable writes.** New ids (paper/critique) are derived by reading the counter/feed back *after* the tx finalizes, not from a return value.
- **Polls patiently.** `resolve_critique` runs a live web fetch + LLM judgment + validator consensus; on studionet that legitimately takes several minutes. The resolve flow waits up to ~12 minutes and says so.
- **Money stays as strings/BigInt** end to end (wei is > `Number.MAX_SAFE_INTEGER`); it's only formatted to a decimal at display and parsed at input.
- **localStorage/`crypto` only run in the browser** (inside `useEffect`), and `<html>`/`<body>` carry `suppressHydrationWarning`.
