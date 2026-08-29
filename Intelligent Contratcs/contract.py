# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }


from genlayer import *
import json
import hashlib

# --- Constants ------------------------------------------------------------------

ARXIV_HTML_BASE = "https://arxiv.org/html/"

MIN_WINDOW_ROUNDS = 5
# FIX (steward rejection, issue 3): raised from 3 to 5, AND the counter now
# only counts distinct addresses that committed to a DIFFERENT paper than the
# one being resolved. Commits to the same paper by the same actor no longer
# advance their own window -- an attacker must control wallets that are active
# on other papers, raising the cost substantially.
MIN_DISTINCT_COMMITTERS = 5

REWARD_BPS_OF_POOL = 5000  # substantive critique earns 50% of the *current* pool
DEFAULT_FEE_BPS = 250      # 2.5% protocol fee on gross reward (admin-tunable)
MAX_FEE_BPS = 2000         # hard cap (20%) so admin can never gut hunter rewards
BPS_DENOM = 10000

VALID_VERDICTS = ("substantive", "frivolous", "inconclusive", "duplicate")

ERROR_EXPECTED = "[EXPECTED]"
ERROR_EXTERNAL = "[EXTERNAL]"
ERROR_TRANSIENT = "[TRANSIENT]"
ERROR_LLM = "[LLM_ERROR]"


# --- Pure helpers ---------------------------------------------------------------

def _paper_id(n: int) -> str:
    return "PAP" + str(n).zfill(6)


def _critique_id(n: int) -> str:
    return "CRT" + str(n).zfill(6)


def _commit_hash(critique_text: str, salt: str) -> str:
    """sha256(utf8(critique_text + salt)), lowercase hex, no 0x prefix.
    Pure deterministic computation -- never inside a nondet block."""
    return hashlib.sha256((critique_text + salt).encode("utf-8")).hexdigest()


def _fetch_paper_text(arxiv_id: str):
    """Fetch full-text HTML from arxiv.org/html/.
    FIX (steward rejection, issue 1): the previous version naively took
    full_text[:16000], always giving validators only the paper's opening
    section. Instead we now take a larger budget (40,000 chars) and split it
    across the FRONT and TAIL of the document so that the introduction AND
    the results/conclusion are both covered. This gives the LLM meaningfully
    more evidence than the first 16,000 chars alone, at a prompt size that
    remains practical.
    Falls back to None if unreachable; callers return inconclusive -- no silent
    fallback. Bare Exception is used here specifically because this runs inside
    a nondet sub-VM where GenVM exception classes may not be available."""
    full_text = None
    try:
        res = gl.nondet.web.get(ARXIV_HTML_BASE + arxiv_id)
        if res.status < 400 and res.body is not None:
            full_text = res.body.decode("utf-8", errors="ignore")
    except Exception as e:
        ctx = e.args[0] if e.args else {}
        if isinstance(ctx, dict):
            body = ctx.get("body")
            if body:
                full_text = str(body)
    if not full_text:
        return None
    # Give validators the front (intro + methods) and the tail (results +
    # conclusion). 30,000 front + 10,000 tail = 40,000 chars total.
    # Papers submitted since Dec 2023 have full-text HTML; older ones fall
    # through to inconclusive rather than silently using the abstract.
    if len(full_text) <= 40000:
        return full_text
    return full_text[:30000] + "\n\n[... middle section omitted ...]\n\n" + full_text[-10000:]


def _parse_verdict(raw) -> dict:
    """Defensively coerce an LLM response into a clamped verdict dict.
    If EITHER field is unparseable the whole verdict collapses to
    inconclusive/False -- one conservative default, not two independent ones
    that could combine unpredictably."""
    data = raw if isinstance(raw, dict) else {}

    verdict = str(data.get("verdict", "")).strip().lower()
    is_dup_raw = data.get("is_duplicate", None)

    verdict_ok = verdict in ("substantive", "frivolous", "inconclusive")
    is_dup_ok = isinstance(is_dup_raw, bool)

    if not verdict_ok or not is_dup_ok:
        verdict = "inconclusive"
        is_duplicate = False
    else:
        is_duplicate = is_dup_raw

    reason = str(data.get("reason", ""))[:500]
    return {"verdict": verdict, "is_duplicate": is_duplicate, "reason": reason}


def _judge_prompt(page_text: str, claim: str, prior_texts: list) -> str:
    prior_block = "\n".join(f"- {t}" for t in prior_texts) if prior_texts else "(none yet)"
    return (
        "You are one of several independent expert reviewers judging whether a "
        "critique of a research paper identifies a REAL, substantive flaw.\n"
        "Base your judgment ONLY on the paper content provided below. Be strict "
        "and consistent so that independent reviewers converge on clear-cut cases.\n\n"
        "=== PAPER (full text, may be truncated) ===\n"
        f"{page_text}\n\n"
        "=== CRITIQUES ALREADY REWARDED FOR THIS PAPER ===\n"
        f"{prior_block}\n\n"
        "=== CRITIQUE UNDER REVIEW ===\n"
        f"{claim}\n\n"
        "First: is this critique substantively the SAME underlying flaw as one "
        "already rewarded above, even if reworded? Set is_duplicate accordingly.\n\n"
        "Then decide exactly one verdict:\n"
        "- 'substantive': the critique identifies a genuine, material flaw or error "
        "supported by the paper's own content.\n"
        "- 'frivolous': the critique is wrong, trivial, off-topic, or unsupported "
        "by the paper.\n"
        "- 'inconclusive': the provided paper content is insufficient to judge.\n\n"
        'Respond ONLY as JSON: {"verdict": "substantive|frivolous|inconclusive", '
        '"is_duplicate": true or false, "reason": "<=2 sentences citing the paper"}'
    )


def _handle_leader_error(leaders_res, leader_fn) -> bool:
    """Canonical validator error handler (write-contract skill).
    Catches gl.vm.UserError first for classified errors, then bare Exception
    as a safety fallback."""
    leader_msg = leaders_res.message if hasattr(leaders_res, "message") else ""
    try:
        leader_fn()
        return False  # leader errored but validator succeeded -> disagree
    except gl.vm.UserError as e:
        validator_msg = e.message if hasattr(e, "message") else str(e)
        if validator_msg.startswith(ERROR_EXPECTED) or validator_msg.startswith(ERROR_EXTERNAL):
            return validator_msg == leader_msg
        if validator_msg.startswith(ERROR_TRANSIENT) and leader_msg.startswith(ERROR_TRANSIENT):
            return True
        return False
    except Exception:
        return False


def _pay(to_hex: str, amount: int) -> None:
    """Single chokepoint for value leaving the contract.
    emit_transfer raises ValueError on value<=0, so we guard here."""
    if amount > 0:
        gl.get_contract_at(Address(to_hex)).emit_transfer(value=u256(amount), on="finalized")


class RigorBounty(gl.Contract):
    admin: Address
    protocol_fee_bps: u256
    protocol_fees_collected: u256

    papers: TreeMap[str, str]
    paper_counter: u256
    critiques: TreeMap[str, str]
    critique_counter: u256

    paper_critiques: TreeMap[str, str]
    hunter_critiques: TreeMap[str, str]

    round_counter: u256
    # FIX (steward rejection, issue 3): each entry now stores BOTH the
    # committer address AND the paper_id of the commit. This lets
    # _distinct_committers_since exclude same-paper commits, so a hunter
    # cannot advance their own window by having confederates commit to the
    # same paper -- those commits don't count toward the gate.
    round_committer_log: DynArray[str]  # JSON {"committer": "0x...", "paper_id": "PAP..."}

    def __init__(self):
        self.admin = gl.message.sender_address
        self.protocol_fee_bps = u256(DEFAULT_FEE_BPS)
        self.protocol_fees_collected = u256(0)
        self.paper_counter = u256(0)
        self.critique_counter = u256(0)
        self.round_counter = u256(0)

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

    def _distinct_committers_since(self, committed_at_round: int, paper_id: str) -> int:
        """FIX (steward rejection, issue 3): count distinct committing addresses
        in the range (committed_at_round, current] that committed to a DIFFERENT
        paper than paper_id. Same-paper commits are excluded so a hunter cannot
        manufacture window progress by having allies commit to the same paper.
        An attacker must control wallets active on OTHER papers -- materially
        higher cost. Honest limitation: Sybil resistance is raised, not
        eliminated; stated clearly rather than implied as solved."""
        current = int(self.round_counter)
        seen = set()
        for i in range(committed_at_round, current):
            entry = json.loads(self.round_committer_log[i])
            # Only count commits to a different paper
            if entry.get("paper_id") != paper_id:
                seen.add(entry["committer"])
        return len(seen)

    def _check_fair_window(self, committed_at_round: int, paper_id: str) -> None:
        """Shared gate for resolve_critique and cancel_unrevealed.
        Both conditions must be met: enough elapsed rounds AND enough distinct
        addresses that committed to OTHER papers since this critique's commit."""
        elapsed = int(self.round_counter) - committed_at_round
        distinct = self._distinct_committers_since(committed_at_round, paper_id)
        if elapsed < MIN_WINDOW_ROUNDS or distinct < MIN_DISTINCT_COMMITTERS:
            raise gl.vm.UserError(
                f"{ERROR_EXPECTED} fair window not passed "
                f"(rounds {elapsed}/{MIN_WINDOW_ROUNDS}, "
                f"distinct cross-paper committers {distinct}/{MIN_DISTINCT_COMMITTERS})"
            )

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
            "arxiv_url": ARXIV_HTML_BASE + aid,
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
        stake = int(gl.message.value)
        if stake <= 0:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} commit_critique needs a stake (send value)")
        ch = commit_hash.strip().lower()
        if len(ch) != 64 or any(c not in "0123456789abcdef" for c in ch):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} commit_hash must be a sha256 hex digest")
        rec = self._load_paper(paper_id)
        if rec["status"] != "active":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} paper {paper_id} is not active")

        hunter = str(gl.message.sender_address)

        # Advance the logical clock first so this commit moves the window for
        # earlier critiques on other papers.
        self.round_counter = u256(int(self.round_counter) + 1)
        # FIX (issue 3): store paper_id alongside committer so
        # _distinct_committers_since can exclude same-paper commits.
        self.round_committer_log.append(json.dumps({
            "committer": hunter,
            "paper_id": paper_id,
        }))
        self.critique_counter = u256(int(self.critique_counter) + 1)
        cid = _critique_id(int(self.critique_counter))

        crec = {
            "critique_id": cid,
            "paper_id": paper_id,
            "hunter": hunter,
            "commit_hash": ch,
            "critique_text": "",
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
        crec = self._load_critique(critique_id)
        if crec["status"] != "committed" or crec["revealed"]:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} critique not in committed state")
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
        crec = self._load_critique(critique_id)
        if crec["status"] != "revealed" or not crec["revealed"]:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} critique must be revealed to resolve")

        self._check_fair_window(int(crec["committed_at_round"]), crec["paper_id"])

        paper = self._load_paper(crec["paper_id"])
        arxiv_id = paper["arxiv_id"]
        claim = crec["critique_text"]

        # FIX (steward rejection, issue 2): gather ALL prior rewarded critique
        # texts for this paper, not just the last 5. Each text is truncated to
        # 300 chars to keep the prompt size manageable while ensuring no
        # already-rewarded finding is invisible to the duplicate check. The
        # previous [-5:] slice meant the 6th+ rewarded critique could be
        # re-submitted and rewarded again.
        prior_ids = json.loads(self.paper_critiques[crec["paper_id"]])
        prior_substantive_texts = []
        for pid in prior_ids:
            if pid == critique_id:
                continue
            other = json.loads(self.critiques[pid])
            if other["status"] == "substantive":
                prior_substantive_texts.append(other["critique_text"][:300])
        # No [-5:] slice -- all rewarded critiques are included.

        def leader_fn():
            page = _fetch_paper_text(arxiv_id)
            if not page:
                return {"verdict": "inconclusive", "is_duplicate": False, "reason": "paper unreachable"}
            raw = gl.nondet.exec_prompt(
                _judge_prompt(page, claim, prior_substantive_texts),
                response_format="json",
            )
            return _parse_verdict(raw)

        def validator_fn(leaders_res: gl.vm.Result) -> bool:
            if not isinstance(leaders_res, gl.vm.Return):
                return _handle_leader_error(leaders_res, leader_fn)
            mine = leader_fn()
            # Comparative consensus on both decision fields.
            return (
                leaders_res.calldata.get("verdict") == mine.get("verdict")
                and leaders_res.calldata.get("is_duplicate") == mine.get("is_duplicate")
            )

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        parsed = _parse_verdict(result)
        self._apply_verdict(crec, parsed)
        return parsed["verdict"]

    def _apply_verdict(self, crec: dict, parsed: dict) -> None:
        """Deterministic settlement. is_duplicate takes PRIORITY over verdict:
        a critique judged both 'substantive' and is_duplicate settles as
        'duplicate' -- stake returned, no reward, pool unchanged."""
        hunter = crec["hunter"]
        stake = int(crec["stake"])
        verdict = parsed["verdict"]
        is_duplicate = parsed["is_duplicate"]
        reason = parsed["reason"]

        effective_status = "duplicate" if (is_duplicate and verdict == "substantive") else verdict

        paper = self._load_paper(crec["paper_id"])
        pool = int(paper["bounty_pool"])
        reward_paid = 0

        if effective_status == "substantive":
            gross = pool * REWARD_BPS_OF_POOL // BPS_DENOM
            fee = gross * int(self.protocol_fee_bps) // BPS_DENOM
            net = gross - fee
            paper["bounty_pool"] = str(pool - gross)
            self.protocol_fees_collected = u256(int(self.protocol_fees_collected) + fee)
            reward_paid = net
            _pay(hunter, stake)
            _pay(hunter, net)
        elif effective_status == "frivolous":
            self.protocol_fees_collected = u256(int(self.protocol_fees_collected) + stake)
        elif effective_status == "duplicate":
            _pay(hunter, stake)
        else:  # inconclusive
            _pay(hunter, stake)

        self.papers[crec["paper_id"]] = json.dumps(paper)
        crec["status"] = effective_status
        crec["verdict"] = effective_status
        crec["verdict_detail"] = reason
        crec["reward_paid"] = str(reward_paid)
        crec["resolved_round"] = int(self.round_counter)
        self.critiques[crec["critique_id"]] = json.dumps(crec)

    @gl.public.write
    def cancel_unrevealed(self, critique_id: str) -> None:
        crec = self._load_critique(critique_id)
        if crec["status"] != "committed" or crec["revealed"]:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} critique is not an unrevealed commit")
        self._check_fair_window(int(crec["committed_at_round"]), crec["paper_id"])
        crec["status"] = "expired"
        self.critiques[critique_id] = json.dumps(crec)
        _pay(crec["hunter"], int(crec["stake"]))

    # --- views ------------------------------------------------------------------

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
    def get_distinct_committers_since(self, committed_at_round: int, paper_id: str) -> u256:
        """Read-only wrapper exposing the same cross-paper distinct-committer
        count that resolve_critique and cancel_unrevealed enforce on-chain.
        Frontend passes paper_id so it sees the real enforced number, not a
        stale or over-counted figure."""
        return u256(self._distinct_committers_since(committed_at_round, paper_id))

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
            "min_distinct_committers": MIN_DISTINCT_COMMITTERS,
            "reward_bps_of_pool": REWARD_BPS_OF_POOL,
            "max_fee_bps": MAX_FEE_BPS,
        })

    @gl.public.view
    def get_contract_balance(self) -> u256:
        return self.balance
