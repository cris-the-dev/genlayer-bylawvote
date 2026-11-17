# BylawVote — a members' treasury that pays only what passed and the bylaws allow

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Co-ops, clubs and small DAOs write bylaws, then spend by majority vote and hope
nobody notices when a vote breaks them. **BylawVote** holds the treasury and
pays a passed proposal only after GenLayer validators read the bylaws, pinned
by hash when the organisation was founded, and agree the payment breaks no
rule. If it does, the proposal is rejected with the clause quoted.

```
founder ── found(name, members, quorum, voting_hours, bylaws_url) ─▶ BylawVote
           validators read the bylaws and agree on their SHA-256: pinned
anyone  ── fund(org) + GEN                                  treasury
member  ── propose(org, to, amount, purpose)                amount ≤ treasury
member  ── vote(proposal, yes)                              once each
           > half yes ─▶ PASSED   ≥ half no ─▶ FAILED   at the end: quorum and yes > no ─▶ PASSED
anyone  ── execute(proposal): bylaws re-read, hash checked; allowed | violates (+ clause)
           allowed ─▶ PAID, amount to the recipient    violates ─▶ REJECTED, clause on record
anyone  ── close(proposal) · settle_payout(payout, tx, finalize_tx) / payee ── recover(to)
```

## Live deployment

App: https://bylawvote.cristhedev.com (organisations, members, proposals with votes and rulings; source in [`app/`](app/))  
Testnet Bradbury Phase 2 (chainId 4221, GenVM v0.3): `__ADDR__`

## Bradbury evidence

Run by [`tests/integration/bradbury.mjs`](tests/integration/bradbury.mjs) once deployed; the table of transactions goes here.

## How a proposal is judged

1. **Pinned bylaws.** At founding, validators fetch the bylaws and agree on
   the SHA-256 of the file. At execution each validator fetches them again; a
   different hash reverts ("the bylaws file changed since it was pinned").
2. **Whole text.** Over 30,000 characters is refused, never cut.
3. **One narrow question.** The LLM sees the organisation, the proposal
   (recipient, amount, treasury, purpose, votes) and the bylaws, fenced as
   data: does this payment break any rule?
4. **Quoted, then checked by text.** `violates` must copy the clause; the
   contract checks it is in the bylaws.
5. **Consensus on the answer.** Each validator reads the bylaws itself and
   accepts the leader's result only with the same answer and, for violates,
   the clause in its own copy.

## Where the money goes

- Treasury money arrives by `fund` and leaves only as **proposal** payments to
  a passed and allowed proposal's recipient.
- A passed proposal larger than the treasury waits until someone funds it.

## Payments and settlement

Every transfer is a recorded payout (sender and creation time). `settle_payout(payout_id, tx_hash, finalize_tx)`
has validators read the paying transaction (this contract's paying method for that proposal, by the recorded
sender at the recorded time, finalized with a successful result) and its finalization, and check the
transfer was executed: `DELIVERED`, or `FAILED` and recoverable by the payee with `recover(to)`.
`get_accounting` is informational only.

## Limits

- Validators judge the proposal's own text against the bylaws; they do not
  check facts outside it (who the recipient really is).
- The bylaws cannot be amended; found a new organisation with the new text.

## The app

https://bylawvote.cristhedev.com ([`app/`](app/)) reads finalized state and treats a write as done only when it is `FINALIZED` with `FINISHED_WITH_RETURN`
and reading the contract back shows the change. GEN amounts use BigInt only. Vote buttons appear only for members who have not voted while voting is open; execute only for a passed
proposal the treasury covers; propose only for members. `node app/check-actions.mjs app/index.html` (CI) asserts the controls per membership, proposal state and time.

## API

| Method | Who | Notes |
|---|---|---|
| `found(name, members, quorum, voting_hours, bylaws)` | anyone | 2–20 distinct members, quorum 1–N, voting 1–720 h, https bylaws; pins the hash |
| `fund(org_id)` payable | anyone | |
| `propose(org_id, to, amount, purpose)` | member | 0 < amount ≤ treasury; purpose 10–1,000 chars |
| `vote(proposal_id, yes)` | member | once, while voting |
| `execute(proposal_id)` | anyone | PASSED only; reads the bylaws; pays or rejects |
| `close(proposal_id)` | anyone | records the result after the period |
| `settle_payout(payout_id, tx_hash, finalize_tx)` / `recover(to)` | anyone / payee | |
| `get_org`, `get_orgs`, `get_proposal`, `get_proposals(org_id or -1, start, limit)`, `get_vote(proposal_id, member)`, `get_payout`, `get_payouts`, `get_accounting`, `get_recoverable` | view | |

## Run

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
genvm-lint check contracts/bylaw_vote.py
pytest tests/direct -v                         # 31 tests
python deploy/shrink.py contracts/bylaw_vote.py build/bylaw_vote.py --pack
node tests/integration/bradbury.mjs build/bylaw_vote.py
```

Bradbury rejects deploys above ~20 KB; deploy the packed build (31.3 KB → 8.9 KB). CI re-runs the direct tests on it. The E2E bylaws page is in [`evidence/`](evidence/).

## Tests (31 direct)

- **Founding** — the bylaws hash is pinned; field validation; members distinct, at least two; unreachable bylaws agreed and revert; validators agree on the hash.
- **Voting** — only members propose and vote; one vote each; a majority of no fails it; quorum rules at the end.
- **Execution** — allowed pays the recipient; violates rejects with the clause; a changed bylaws file reverts; a clause not in the bylaws is an LLM error; validators agree and find the clause; a passed proposal waits for funds.
- **Settlement** — delivered and failed payouts, recovery by the recipient, a transaction that is not this payout is rejected.

## License

MIT
