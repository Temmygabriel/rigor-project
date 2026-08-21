# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }


from genlayer import *
import json
import hashlib

# --- Constants ------------------------------------------------------------------

# arXiv's structured Atom/XML API -- reliable across independent validator fetches,
# unlike the JS-flavored abs/ HTML page. We build this URL from an arXiv id
# ourselves rather than trusting a caller-supplied URL (keeps every fetch pointed
# at the real arXiv API and normalizes the endpoint across validators).
ARXIV_API = "https://export.arxiv.org/api/query?id_list="

MIN_WINDOW_ROUNDS = 5      # resolve requires round_counter - committed_at_round >= this
REWARD_BPS_OF_POOL = 5000  # a substantive critique earns 50% of the *current* pool
DEFAULT_FEE_BPS = 250      # 2.5% protocol fee on gross reward (admin-tunable)
MAX_FEE_BPS = 2000         # hard cap (20%) so the admin can never gut hunter rewards
BPS_DENOM = 10000

VALID_VERDICTS = ("substantive", "frivolous", "inconclusive")

# Error classification prefixes so validators can compare failure paths correctly
# (see write-contract skill): deterministic errors must match exactly; transient
# ones agree if both are transient; anything else disagrees and forces rotation.
ERROR_EXPECTED = "[EXPECTED]"    # business logic (deterministic)
ERROR_EXTERNAL = "[EXTERNAL]"    # external 4xx (deterministic)
ERROR_TRANSIENT = "[TRANSIENT]"  # network / 5xx (non-deterministic)
ERROR_LLM = "[LLM_ERROR]"        # LLM misbehavior


# --- Pure helpers (deterministic; safe to call anywhere) ------------------------

def _paper_id(n: int) -> str:
    return "PAP" + str(n).zfill(6)


def _critique_id(n: int) -> str:
    return "CRT" + str(n).zfill(6)


def _commit_hash(critique_text: str, salt: str) -> str:
    """Canonical commitment preimage. The frontend MUST compute the identical
    value: sha256( utf8(critique_text + salt) ), lowercase hex, no 0x prefix.
    hashlib.sha256 is pure, deterministic computation -- no non-determinism, so it
    runs directly in the method body, never inside a nondet block."""
    return hashlib.sha256((critique_text + salt).encode("utf-8")).hexdigest()


def _slice_between(text: str, start_tag: str, end_tag: str, from_pos: int = 0) -> str:
    """Return the text between the first start_tag/end_tag after from_pos, or ""."""
    i = text.find(start_tag, from_pos)
    if i == -1:
        return ""
    i += len(start_tag)
    j = text.find(end_tag, i)
    if j == -1:
        return ""
    return text[i:j].strip()


def _fetch_paper_text(url: str):
    """Fetch the arXiv entry and return a trimmed text blob, or None if unreachable.
    Bare Exception only -- never import GenVM exception classes here, their
    availability can differ across validators and split consensus. Returning None
    (not raising) lets the caller apply the evidence-bound `inconclusive` rule."""
    page_text = None
    try:
        res = gl.nondet.web.get(url)
        if res.status < 400 and res.body is not None:
            page_text = res.body.decode("utf-8", errors="ignore")
    except Exception as e:
        ctx = e.args[0] if e.args else {}
        if isinstance(ctx, dict):
            body = ctx.get("body")
            if body:
                page_text = str(body)
    if not page_text:
        return None
    # Narrow to the first <entry> so the judgment focuses on the paper metadata.
    entry_pos = page_text.find("<entry>")
    if entry_pos != -1:
        page_text = page_text[entry_pos:]
    return page_text[:6000]


def _parse_verdict(raw) -> dict:
    """Defensively coerce an LLM response into a clamped verdict dict. Safe default
    is 'inconclusive' -- never let malformed / surprising output move money."""
    data = raw if isinstance(raw, dict) else {}
    verdict = str(data.get("verdict", "")).strip().lower()
    if verdict not in VALID_VERDICTS:
        verdict = "inconclusive"
    reason = str(data.get("reason", ""))[:500]
    return {"verdict": verdict, "reason": reason}


def _judge_prompt(page_text: str, claim: str) -> str:
    return (
        "You are one of several independent expert reviewers judging whether a "
        "critique of a research paper identifies a REAL, substantive flaw.\n"
        "Base your judgment ONLY on the paper content provided below. Be strict "
        "and consistent so that independent reviewers converge on clear-cut cases.\n\n"
        "=== PAPER (arXiv entry, may be truncated) ===\n"
        f"{page_text}\n\n"
        "=== CRITIQUE UNDER REVIEW ===\n"
        f"{claim}\n\n"
        "Decide exactly one verdict:\n"
        "- 'substantive': the critique identifies a genuine, material flaw or error "
        "supported by the paper's own content.\n"
        "- 'frivolous': the critique is wrong, trivial, off-topic, or unsupported "
        "by the paper.\n"
        "- 'inconclusive': the provided paper content is insufficient to judge.\n\n"
        'Respond ONLY as JSON: {"verdict": "substantive|frivolous|inconclusive", '
        '"reason": "<=2 sentences citing the paper"}'
    )


def _handle_leader_error(leaders_res, leader_fn) -> bool:
    """Canonical validator error handler (write-contract skill). Compares the
    leader's failure against the validator's own attempt by error class."""
    leader_msg = leaders_res.message if hasattr(leaders_res, "message") else ""
    try:
        leader_fn()
        return False  # leader errored but validator succeeded -> disagree
    except Exception as e:
        validator_msg = getattr(e, "message", str(e))
        if validator_msg.startswith(ERROR_EXPECTED) or validator_msg.startswith(ERROR_EXTERNAL):
            return validator_msg == leader_msg
        if validator_msg.startswith(ERROR_TRANSIENT) and leader_msg.startswith(ERROR_TRANSIENT):
            return True
        return False


def _pay(to_hex: str, amount: int) -> None:
    """The single chokepoint for value LEAVING the contract (stake refunds and
    rewards). Verified against the SDK: send value to any address via
    gl.get_contract_at(Address(..)).emit_transfer(value=.., on='finalized').
    emit_transfer raises ValueError on value<=0, so we guard here and every payout
    of a computed amount is safe to route through this helper.
    NOTE: value is deducted from the contract on finalization and is NOT
    auto-refunded if the child transfer fails -- so we only ever pay amounts we
    have already reserved (stake <= held stake, reward <= current pool)."""
    if amount > 0:
        gl.get_contract_at(Address(to_hex)).emit_transfer(value=u256(amount), on="finalized")


class RigorBounty(gl.Contract):
    # Storage fields -- class-level annotations declare on-chain slots.
    # Money amounts inside the JSON records are decimal STRINGS (wei-scale exceeds
    # JS's safe-integer range; the frontend reads them as strings -- consistent
    # with the architecture doc's "amounts as strings" frontend rule).
    admin: Address
    protocol_fee_bps: u256
    protocol_fees_collected: u256

    papers: TreeMap[str, str]            # paper_id     -> JSON record
    paper_counter: u256
    critiques: TreeMap[str, str]         # critique_id  -> JSON record
    critique_counter: u256

    paper_critiques: TreeMap[str, str]   # paper_id     -> JSON list[critique_id]
    hunter_critiques: TreeMap[str, str]  # hunter hex   -> JSON list[critique_id]

    round_counter: u256                  # monotonic logical clock (see module header)

    def __init__(self):
        self.admin = gl.message.sender_address
        self.protocol_fee_bps = u256(DEFAULT_FEE_BPS)
        self.protocol_fees_collected = u256(0)
        self.paper_counter = u256(0)
        self.critique_counter = u256(0)
        self.round_counter = u256(0)
        # TreeMap fields start empty; no initialization needed.

    # --- internal guards / loaders ---------------------------------------------

    def _require_admin(self) -> None:
        if gl.message.sender_address != self.admin:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} admin only")

    def _load_paper(self, paper_id: str) -> dict:
        if paper_id not in self.papers:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} unknown paper {paper_id}")
        return json.loads(self.papers[paper_id])

    def _load_critique(self, critique_id: str) -> dict:
        if critique_id not in self.critiques:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} unknown critique {critique_id}")
        return json.loads(self.critiques[critique_id])

    # --- admin ------------------------------------------------------------------

    @gl.public.write
    def configure(self, protocol_fee_bps: int) -> None:
        self._require_admin()
        fee = int(protocol_fee_bps)
        if fee < 0 or fee > MAX_FEE_BPS:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} fee bps must be 0..{MAX_FEE_BPS}")
        self.protocol_fee_bps = u256(fee)

    @gl.public.write
    def withdraw_fees(self, amount: int) -> None:
        """Admin withdraws collected protocol fees (slashed frivolous stakes +
        reward fees). Bounded by protocol_fees_collected so it can never touch
        held stakes or live bounty pools."""
        self._require_admin()
        amt = int(amount)
        collected = int(self.protocol_fees_collected)
        if amt <= 0:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} amount must be > 0")
        if amt > collected:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} amount exceeds collected fees")
        self.protocol_fees_collected = u256(collected - amt)
        _pay(str(self.admin), amt)

    # --- sponsor: fund bounties -------------------------------------------------

    @gl.public.write.payable
    def register_paper(self, title: str, arxiv_id: str) -> str:
        """Register a paper and seed its bounty pool with the attached value.
        `arxiv_id` is the bare arXiv identifier (e.g. '2401.12345' or '2401.12345v2');
        we build the canonical export.arxiv.org API URL ourselves."""
        value = int(gl.message.value)
        if value <= 0:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} register_paper needs a bounty (send value)")
        aid = arxiv_id.strip()
        if not aid or len(aid) > 64:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} invalid arxiv_id")

        self.paper_counter = u256(int(self.paper_counter) + 1)
        pid = _paper_id(int(self.paper_counter))
        rec = {
            "paper_id": pid,
            "sponsor": str(gl.message.sender_address),
            "title": title[:300],
            "arxiv_id": aid,
            "arxiv_url": ARXIV_API + aid,
            "bounty_pool": str(value),
            "status": "active",
            "critique_count": 0,
            "created_round": str(int(self.round_counter)),
        }
        self.papers[pid] = json.dumps(rec)
        self.paper_critiques[pid] = json.dumps([])
        return pid

    @gl.public.write.payable
    def fund_paper(self, paper_id: str) -> None:
        """Top up an existing paper's bounty pool."""
        value = int(gl.message.value)
        if value <= 0:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} fund_paper needs value")
        rec = self._load_paper(paper_id)
        if rec["status"] != "active":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} paper {paper_id} is not active")
        rec["bounty_pool"] = str(int(rec["bounty_pool"]) + value)
        self.papers[paper_id] = json.dumps(rec)

    # --- hunter: commit / reveal ------------------------------------------------

    @gl.public.write.payable
    def commit_critique(self, paper_id: str, commit_hash: str) -> str:
        """Commit to a critique WITHOUT revealing it. The attached value is the
        hunter's stake (bond), at risk if the critique is frivolous or never
        revealed in time. Increments the logical round counter -- this is the ONLY
        action that advances the fair-window clock."""
        stake = int(gl.message.value)
        if stake <= 0:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} commit_critique needs a stake (send value)")
        ch = commit_hash.strip().lower()
        # sha256 hex is 64 lowercase hex chars, no 0x prefix.
        if len(ch) != 64 or any(c not in "0123456789abcdef" for c in ch):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} commit_hash must be a sha256 hex digest")
        rec = self._load_paper(paper_id)
        if rec["status"] != "active":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} paper {paper_id} is not active")

        # Advance the logical clock FIRST so this commit also moves the window for
        # earlier critiques (activity-based ordering, not wall-clock duration).
        self.round_counter = u256(int(self.round_counter) + 1)
        self.critique_counter = u256(int(self.critique_counter) + 1)
        cid = _critique_id(int(self.critique_counter))

        hunter = str(gl.message.sender_address)
        crec = {
            "critique_id": cid,
            "paper_id": paper_id,
            "hunter": hunter,
            "commit_hash": ch,
            "critique_text": "",           # empty until reveal -- nothing leaks on-chain
            "committed_at_round": int(self.round_counter),
            "revealed": False,
            "stake": str(stake),
            "status": "committed",
            "verdict": "",
            "verdict_detail": "",
            "reward_paid": "0",
            "resolved_round": 0,
        }
        self.critiques[cid] = json.dumps(crec)

        # Indexes for the frontend feed (avoid O(n) scans over all critiques).
        plist = json.loads(self.paper_critiques[paper_id])
        plist.append(cid)
        self.paper_critiques[paper_id] = json.dumps(plist)

        hlist = json.loads(self.hunter_critiques.get(hunter, "[]"))
        hlist.append(cid)
        self.hunter_critiques[hunter] = json.dumps(hlist)

        rec["critique_count"] = int(rec["critique_count"]) + 1
        self.papers[paper_id] = json.dumps(rec)
        return cid

    @gl.public.write
    def reveal_critique(self, critique_id: str, critique_text: str, salt: str) -> None:
        """Reveal the critique text + salt. We recompute the commitment and compare;
        pure deterministic hashing, NOT inside a nondet block (it needs none)."""
        crec = self._load_critique(critique_id)
        if crec["status"] != "committed" or crec["revealed"]:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} critique not in committed state")
        # Only the original hunter can reveal (the text is theirs to disclose).
        if gl.message.sender_address != Address(crec["hunter"]):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} only the hunter can reveal")
        text = critique_text.strip()
        if not text:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} critique_text is empty")
        if _commit_hash(critique_text, salt) != crec["commit_hash"]:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} revealed text does not match the commitment")

        crec["critique_text"] = text[:4000]
        crec["revealed"] = True
        crec["status"] = "revealed"
        self.critiques[critique_id] = json.dumps(crec)

    # --- settlement -------------------------------------------------------------

    @gl.public.write
    def resolve_critique(self, critique_id: str) -> str:
        """Fetch the live paper + judge the critique under CONSENSUS, then settle.
        The verdict is decided INSIDE the nondet block and validated comparatively
        (every validator re-fetches and re-judges) -- consensus is on the verdict
        field itself, not just the shape of the leader's answer."""
        crec = self._load_critique(critique_id)
        if crec["status"] != "revealed" or not crec["revealed"]:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} critique must be revealed to resolve")

        # Fair-window gate (logical rounds, not time). Honest limitation: this is
        # an ordering guarantee ("at least N commits happened since"), not a
        # precise duration -- documented trade-off, see module header + sec.5.
        elapsed = int(self.round_counter) - int(crec["committed_at_round"])
        if elapsed < MIN_WINDOW_ROUNDS:
            raise gl.vm.UserError(
                f"{ERROR_EXPECTED} fair window not passed "
                f"({elapsed}/{MIN_WINDOW_ROUNDS} rounds)"
            )

        # Pull everything the nondet closures need into LOCALS. The leader/validator
        # functions are serialized and run in sub-VMs; they must not touch `self`.
        url = self._load_paper(crec["paper_id"])["arxiv_url"]
        claim = crec["critique_text"]

        def leader_fn():
            page = _fetch_paper_text(url)
            if not page:
                # Evidence-bound: unreachable => inconclusive, never a default pass/fail.
                return {"verdict": "inconclusive", "reason": "paper unreachable"}
            raw = gl.nondet.exec_prompt(_judge_prompt(page, claim), response_format="json")
            return _parse_verdict(raw)

        def validator_fn(leaders_res: gl.vm.Result) -> bool:
            # If the leader errored, compare failure classes rather than answers.
            if not isinstance(leaders_res, gl.vm.Return):
                return _handle_leader_error(leaders_res, leader_fn)
            mine = leader_fn()
            # Comparative consensus: agree only if the decisive field matches.
            return leaders_res.calldata.get("verdict") == mine.get("verdict")

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        parsed = _parse_verdict(result)
        self._apply_verdict(crec, parsed["verdict"], parsed["reason"])
        return parsed["verdict"]

    def _apply_verdict(self, crec: dict, verdict: str, reason: str) -> None:
        """Deterministic settlement on the consensus verdict. Runs in the normal
        method body (post-consensus), so it may move money and write storage.
        Invariant: contract balance == sum(held stakes) + sum(bounty pools) +
        protocol_fees_collected. We only ever pay stake<=held and reward<=pool, so
        the balance is always sufficient and pools can never be double-spent."""
        hunter = crec["hunter"]
        stake = int(crec["stake"])
        paper = self._load_paper(crec["paper_id"])
        pool = int(paper["bounty_pool"])
        reward_paid = 0

        if verdict == "substantive":
            # Reward = share of the CURRENT pool (early strong critiques earn more;
            # never over-drains). Protocol fee taken from the gross reward.
            gross = pool * REWARD_BPS_OF_POOL // BPS_DENOM
            fee = gross * int(self.protocol_fee_bps) // BPS_DENOM
            net = gross - fee
            paper["bounty_pool"] = str(pool - gross)
            self.protocol_fees_collected = u256(int(self.protocol_fees_collected) + fee)
            reward_paid = net
            _pay(hunter, stake)   # return the bond
            _pay(hunter, net)     # pay the reward
        elif verdict == "frivolous":
            # Stake is forfeited to the protocol; the pool is untouched.
            self.protocol_fees_collected = u256(int(self.protocol_fees_collected) + stake)
        else:  # inconclusive
            # No judgeable evidence -> return the stake in full, move nothing else.
            _pay(hunter, stake)

        self.papers[crec["paper_id"]] = json.dumps(paper)
        crec["status"] = verdict
        crec["verdict"] = verdict
        crec["verdict_detail"] = reason
        crec["reward_paid"] = str(reward_paid)
        crec["resolved_round"] = int(self.round_counter)
        self.critiques[crec["critique_id"]] = json.dumps(crec)

    @gl.public.write
    def cancel_unrevealed(self, critique_id: str) -> None:
        """Once the fair window has passed with no reveal, anyone can unblock the
        critique. The stake is returned IN FULL -- a timeout is not proof of bad
        faith, and punishing it would deter honest hunters who hit a real snag."""
        crec = self._load_critique(critique_id)
        if crec["status"] != "committed" or crec["revealed"]:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} critique is not an unrevealed commit")
        elapsed = int(self.round_counter) - int(crec["committed_at_round"])
        if elapsed < MIN_WINDOW_ROUNDS:
            raise gl.vm.UserError(
                f"{ERROR_EXPECTED} window not passed ({elapsed}/{MIN_WINDOW_ROUNDS})"
            )
        crec["status"] = "expired"
        self.critiques[critique_id] = json.dumps(crec)
        _pay(crec["hunter"], int(crec["stake"]))

    # --- views (read-only feed for the frontend) --------------------------------

    @gl.public.view
    def get_paper_counter(self) -> u256:
        return self.paper_counter

    @gl.public.view
    def get_critique_counter(self) -> u256:
        return self.critique_counter

    @gl.public.view
    def get_round_counter(self) -> u256:
        return self.round_counter

    @gl.public.view
    def get_paper(self, paper_id: str) -> str:
        return self.papers[paper_id] if paper_id in self.papers else "{}"

    @gl.public.view
    def get_critique(self, critique_id: str) -> str:
        return self.critiques[critique_id] if critique_id in self.critiques else "{}"

    @gl.public.view
    def get_paper_critiques(self, paper_id: str) -> str:
        return self.paper_critiques.get(paper_id, "[]")

    @gl.public.view
    def get_hunter_critiques(self, hunter: str) -> str:
        return self.hunter_critiques.get(hunter, "[]")

    @gl.public.view
    def get_config(self) -> str:
        return json.dumps({
            "admin": str(self.admin),
            "protocol_fee_bps": int(self.protocol_fee_bps),
            "protocol_fees_collected": str(int(self.protocol_fees_collected)),
            "round_counter": int(self.round_counter),
            "min_window_rounds": MIN_WINDOW_ROUNDS,
            "reward_bps_of_pool": REWARD_BPS_OF_POOL,
            "max_fee_bps": MAX_FEE_BPS,
        })

    @gl.public.view
    def get_contract_balance(self) -> u256:
        return self.balance
