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
Testnet Bradbury Phase 2 (chainId 4221, GenVM v0.3): [`0xDD4b8Ee1D2988221F8175640650Aa32179B88C6d`](https://explorer-bradbury.genlayer.com/address/0xDD4b8Ee1D2988221F8175640650Aa32179B88C6d)

## Bradbury evidence

Run by [`tests/integration/bradbury.mjs`](tests/integration/bradbury.mjs) on Bradbury Phase 2 (all checks passed). Contract `0xDD4b8Ee1D2988221F8175640650Aa32179B88C6d` (deploy [`0x0316097e…`](https://explorer-bradbury.genlayer.com/tx/0x0316097e65b46085b6b7332a6b3ce3e0b037b258dd6a6cee5f7b13c468434875)), code `build/bylaw_vote.py` (sha256 `de6f00c4…`). Organisation #0 is the Riverside Food Co-op: two members, quorum 2, a 1-hour vote, bylaws at [`evidence/bylaws.html`](evidence/bylaws.html) served from `https://bylawvote.cristhedev.com/evidence/bylaws.html`. A third account plays the supplier and pays for nothing. Proposals are #0 (food stock from the supplier), #1 (repairs paid to the member who proposed them) and #2 (a members' party).

| Step | Transaction | Outcome |
|---|---|---|
| found with a duplicate member | [`0xef6cfd17…`](https://explorer-bradbury.genlayer.com/tx/0xef6cfd1770d86b52c30a5cf9c701effd6b1684eff925ac4e07beb1d3f1483c35) | rejected: members must differ |
| found the co-op (2 members, quorum 2, 1 h) | [`0x82fb2b8e…`](https://explorer-bradbury.genlayer.com/tx/0x82fb2b8eec0410a371cd08659424f118c9d77866cdc582ec1ac3bee74d2460a8) | ok: bylaws pinned: 0eb499664ad7e05d… |
| anyone funds the treasury | [`0x18164d82…`](https://explorer-bradbury.genlayer.com/tx/0x18164d82311063852ab17852b0241b9ceaf5be3672c5308696e5f7693d801e41) | ok |
| the supplier proposes | [`0xd2bc1423…`](https://explorer-bradbury.genlayer.com/tx/0xd2bc14233d16af5cd43d3889429209a547cc8f3f1a4acdcc63e7657b6efb7527) | rejected: only members propose |
| propose 6x | [`0x33f731c1…`](https://explorer-bradbury.genlayer.com/tx/0x33f731c1f1edadb5b3ea34a99024402c7298123d06729c7f022108b16c236616) | rejected: a proposal above the treasury is refused |
| propose food stock from the supplier | [`0x95f105ee…`](https://explorer-bradbury.genlayer.com/tx/0x95f105ee3fbc78734708b7feada99647a504a3b84adb00f7eacfaed985ac1d0a) | ok |
| member 0 votes yes | [`0x802a63bb…`](https://explorer-bradbury.genlayer.com/tx/0x802a63bb7f36a6f94d849029cc06b2d29ebb0bc9c53b14b1818098e84aa6874e) | ok |
| member 0 votes again | [`0xc39ad57e…`](https://explorer-bradbury.genlayer.com/tx/0xc39ad57e656ed5782297b224ab4ab08af6dc3b767930978110dfe10e983756cf) | rejected: one vote per member |
| the supplier votes | [`0xbee03098…`](https://explorer-bradbury.genlayer.com/tx/0xbee030984d07e73a39eb266d2af42cb0e69770f15c982e9ee5cfa8c2d78ab4ac) | rejected: only members vote |
| member 1 votes yes | [`0xe53e86f0…`](https://explorer-bradbury.genlayer.com/tx/0xe53e86f073b71217d3d328215e0f7795dd762dc56cacb3fd1274d89a3d0f28ea) | ok: proposal #0 PASSED |
| execute proposal #0 (anyone) | [`0x700e61e1…`](https://explorer-bradbury.genlayer.com/tx/0x700e61e111f3e8361cd821faae9deadc0788c57063891b53b67d5dd5872593ed) | **PAID** within the bylaws: The payment of 0.0002 GEN for food stock is within the 0.002 GEN limit, serves an allowed purpose under Article 3.1, passed with unanimous member approval, and no bylaw violation is evident from the i |
| execute proposal #0 again | [`0xaff9266e…`](https://explorer-bradbury.genlayer.com/tx/0xaff9266eba815e3b2ab6f00f856dc9bc0b6115575e422f57076191318f0ab207) | rejected: a paid proposal pays once |
| member 1 proposes paying themselves | [`0x7bd3b4a7…`](https://explorer-bradbury.genlayer.com/tx/0x7bd3b4a76b14623d44d410a1b62d99ec738da64facd130edf0d0c992ad3458aa) | ok |
| member 0 votes yes | [`0x15564a4a…`](https://explorer-bradbury.genlayer.com/tx/0x15564a4a101f0504783a50343a50641c6be13611559970e26f092a5cc1a1d10f) | ok |
| member 1 votes yes | [`0x5ef7e202…`](https://explorer-bradbury.genlayer.com/tx/0x5ef7e20205ae525a42c50dee11797e5e03ccb70fe0e91e9424e37b1875f37320) | ok: proposal #1 PASSED |
| execute proposal #1 | [`0xbaff6e5e…`](https://explorer-bradbury.genlayer.com/tx/0xbaff6e5e7f81c129b5d99fa0a9cc91f266e05723fdca163873415a6f298a0f65) | no majority (validators disagreed): nothing applied, sent again |
| execute proposal #1 | [`0x47ff9d70…`](https://explorer-bradbury.genlayer.com/tx/0x47ff9d704c897e082a90757ab5373f201ae127fde421b3b07078644c269889d5) | **REJECTED** under clause 3.3 No payment may go to the member who proposed it or to a business that member owns.: The proposal pays the member who proposed it for repair work they did themselves. |
| propose a members' party | [`0xd2a7189e…`](https://explorer-bradbury.genlayer.com/tx/0xd2a7189ec5080a683b4776d0f57a3b04ebb503170283f0aca209d562ee2afb48) | ok |
| member 1 votes no | [`0xde4fde0c…`](https://explorer-bradbury.genlayer.com/tx/0xde4fde0ce1c2f9a06083e058937b5921839cd7347a151ebc91e6cda54a167f5b) | ok: proposal #2 FAILED: yes can no longer win |
| execute proposal #2 | [`0xad10c1f8…`](https://explorer-bradbury.genlayer.com/tx/0xad10c1f8c81423abd2701a1253bf037177f47fc6dd0157c590f5e31bc82bd089) | rejected: a failed proposal cannot be executed |

Every payout was settled from its own transfer once the paying transaction finalized:

| Payout | Kind | Finalized by | `settle_payout` | Result |
|---|---|---|---|---|
| 0 | proposal #0 → the supplier (0.0002 GEN) | [`0x2900035b…`](https://explorer-bradbury.genlayer.com/tx/0x2900035bb2b9c4990ab52395364873d4f80c4d2a3d23ed6cc299a258a9abc4ff) | [`0x770c9ffb…`](https://explorer-bradbury.genlayer.com/tx/0x770c9ffb0ea6adbae26e6756c7c7057caef0c29a465406d8946cd23bf704029f) | DELIVERED |

Settling the same payout again is rejected ([`0xc2bcab8a…`](https://explorer-bradbury.genlayer.com/tx/0xc2bcab8aaca8ac67f13f0356cae1fa0f4372e5d5b7fa23ddc83403832ac2bf6b)). On Bradbury a reverted payable transaction leaves its value in the contract; the contract never recorded it, so no one can withdraw it. The E2E checks the balance equals what the contract expects to hold plus exactly that value (0 GEN here: every reverted call sent no value).

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
