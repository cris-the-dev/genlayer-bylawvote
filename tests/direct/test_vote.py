"""Founding with pinned bylaws, proposals and votes, execution checked against the bylaws, and payout settlement."""

import hashlib

import pytest

from tests.direct.conftest import BYLAWS, BYLAWS_URL, CLAUSE, HOUR, PART, chain_balance, found, fund, page, tick, to_hex

OUT = "0x" + "77" * 20

def stranger(vm):
    return vm.sender.__class__(bytes.fromhex("77" * 20))
PURPOSE = "Repair the shop's walk-in fridge compressor."

def propose(vm, c, who, amount=PART, to=OUT, purpose=PURPOSE):
    vm.sender = who
    tick(vm)
    return c.propose(0, to, amount, purpose)

def vote(vm, c, who, yes=True, pid=0):
    vm.sender = who
    tick(vm)
    return c.vote(pid, yes)

def execute(vm, c, who, pid=0, **kw):
    page(vm, **kw)
    vm.sender = who
    tick(vm)
    return c.execute(pid)

@pytest.fixture
def passed(org, direct_vm, direct_alice, direct_bob):
    propose(direct_vm, org, direct_alice)
    vote(direct_vm, org, direct_alice)
    assert vote(direct_vm, org, direct_bob) == "PASSED"  # 2 of 3 is a majority of all members
    return org

def test_found_pins_the_bylaws_hash(org, direct_alice):
    o = org.get_org(0)
    assert o["bylaws_hash"] == hashlib.sha256(BYLAWS.encode()).hexdigest() and o["bylaws"] == BYLAWS_URL
    assert len(o["members"]) == 3 and o["treasury"] == 3 * PART and org.get_accounting()["expected_balance"] == 3 * PART

@pytest.mark.parametrize(
    "kw, msg",
    [
        ({"name": "x"}, "3-80"),
        ({"quorum": 4}, "quorum 1-3"),
        ({"quorum": 0}, "quorum 1-3"),
        ({"hours": 0}, "1-720 hours"),
        ({"url": "http://coop.example/bylaws"}, "https url"),
    ],
)
def test_found_validation(org, direct_vm, direct_alice, direct_bob, direct_charlie, kw, msg):
    with direct_vm.expect_revert(msg):
        found(direct_vm, org, direct_alice, [direct_alice, direct_bob, direct_charlie], **kw)

def test_members_differ_and_are_two_or_more(org, direct_vm, direct_alice, direct_bob):
    with direct_vm.expect_revert("members must differ"):
        found(direct_vm, org, direct_alice, [direct_alice, direct_alice])
    with direct_vm.expect_revert("2-20 member"):
        found(direct_vm, org, direct_alice, [direct_alice])

def test_unreachable_bylaws_are_agreed_and_revert(org, direct_vm, direct_alice, direct_bob):
    page(direct_vm, status=404)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("HTTP 404"):
        org.found("Riverside Food Co-op", [to_hex(direct_alice), to_hex(direct_bob)], 1, 24, BYLAWS_URL)
    assert direct_vm.run_validator(leader_error="[EXTERNAL] page unavailable (HTTP 404)") is True
    assert direct_vm.run_validator(leader_error="[EXTERNAL] page unavailable (HTTP 503)") is False
    assert org.get_orgs(0, 10)["total"] == 1

def test_validators_agree_on_the_hash(org, direct_vm, direct_alice, direct_bob):
    found(direct_vm, org, direct_alice, [direct_alice, direct_bob])
    assert direct_vm.run_validator() is True
    assert direct_vm.run_validator(leader_result="00" * 32) is False

def test_only_members_propose_and_vote(org, direct_vm, direct_alice, direct_bob):
    with direct_vm.expect_revert("not a member"):
        propose(direct_vm, org, stranger(direct_vm))
    propose(direct_vm, org, direct_alice)
    with direct_vm.expect_revert("not a member"):
        vote(direct_vm, org, stranger(direct_vm))

def test_propose_validation(org, direct_vm, direct_alice):
    with direct_vm.expect_revert("10-1000"):
        propose(direct_vm, org, direct_alice, purpose="fridge")
    with direct_vm.expect_revert("at most the treasury"):
        propose(direct_vm, org, direct_alice, amount=3 * PART + 1)

def test_one_vote_per_member(org, direct_vm, direct_alice):
    propose(direct_vm, org, direct_alice)
    vote(direct_vm, org, direct_alice)
    with direct_vm.expect_revert("already voted"):
        vote(direct_vm, org, direct_alice, yes=False)
    assert org.get_vote(0, to_hex(direct_alice)) == "yes"

def test_a_majority_of_no_fails_it(org, direct_vm, direct_alice, direct_bob, direct_charlie):
    propose(direct_vm, org, direct_alice)
    vote(direct_vm, org, direct_bob, yes=False)
    assert vote(direct_vm, org, direct_charlie, yes=False) == "FAILED"
    with direct_vm.expect_revert("voting is closed"):
        vote(direct_vm, org, direct_alice)
    with direct_vm.expect_revert("proposal is FAILED"):
        execute(direct_vm, org, direct_alice)

def test_at_the_end_without_quorum_it_fails(org, direct_vm, direct_alice, direct_bob):
    propose(direct_vm, org, direct_alice)
    vote(direct_vm, org, direct_alice)
    assert org.get_proposal(0)["status"] == "VOTING"
    tick(direct_vm, 24 * HOUR)
    assert org.get_proposal(0)["status"] == "FAILED"  # 1 vote, quorum 2
    direct_vm.sender = direct_bob
    assert org.close(0) == "FAILED"

def test_quorum_with_more_yes_passes_at_the_end(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    direct_vm.warp("2030-01-01T10:00:00Z")
    direct_vm.sender = direct_alice
    c = direct_deploy("contracts/bylaw_vote.py")
    x = stranger(direct_vm)
    found(direct_vm, c, direct_alice, [direct_alice, direct_bob, direct_charlie, x], quorum=2)
    fund(direct_vm, c, direct_alice, PART)
    propose(direct_vm, c, direct_alice)
    vote(direct_vm, c, direct_alice)
    vote(direct_vm, c, direct_bob)
    assert c.get_proposal(0)["status"] == "VOTING"  # 2 of 4 is not a majority of all
    tick(direct_vm, 24 * HOUR)
    direct_vm.sender = direct_charlie
    assert c.close(0) == "PASSED"
    with direct_vm.expect_revert("voting is closed"):
        vote(direct_vm, c, direct_charlie)

def test_allowed_pays_the_recipient(passed, direct_vm, direct_charlie, ledger):
    assert execute(direct_vm, passed, direct_charlie) == "PAID"
    assert ledger.paid_to(OUT) == PART
    o, p = passed.get_org(0), passed.get_proposal(0)
    assert (o["treasury"], o["paid"], p["reason"]) == (2 * PART, PART, "Repairs are allowed spending.")
    with direct_vm.expect_revert("proposal is PAID"):
        execute(direct_vm, passed, direct_charlie)

def test_violates_rejects_with_the_clause(passed, direct_vm, direct_charlie, ledger):
    assert execute(direct_vm, passed, direct_charlie, answer="violates", reason="Over the cap.") == "REJECTED"
    p = passed.get_proposal(0)
    assert (p["clause"], p["status"]) == (CLAUSE, "REJECTED") and ledger.paid_to(OUT) == 0
    assert passed.get_org(0)["treasury"] == 3 * PART

def test_a_changed_bylaws_file_reverts_and_changes_nothing(passed, direct_vm, direct_charlie):
    with direct_vm.expect_revert("bylaws file changed"):
        execute(direct_vm, passed, direct_charlie, body=BYLAWS.replace("2 GEN", "20 GEN"))
    assert passed.get_proposal(0)["status"] == "PASSED"

def test_a_clause_not_in_the_bylaws_is_an_llm_error(passed, direct_vm, direct_charlie):
    with direct_vm.expect_revert("clause is not in the bylaws"):
        execute(direct_vm, passed, direct_charlie, answer="violates", clause="Payments need a two-thirds vote.")

def test_validators_agree_on_the_answer_and_find_the_clause(passed, direct_vm, direct_charlie):
    execute(direct_vm, passed, direct_charlie, answer="violates")
    assert direct_vm.run_validator() is True
    assert direct_vm.run_validator(leader_result={"answer": "allowed", "clause": "", "reason": "x"}) is False
    assert direct_vm.run_validator(leader_result={"answer": "violates", "clause": "Payments need a two-thirds vote.", "reason": "x"}) is False

def test_a_passed_proposal_waits_for_funds(direct_vm, passed, direct_alice, direct_bob, direct_charlie):
    propose(direct_vm, passed, direct_alice, amount=3 * PART)
    vote(direct_vm, passed, direct_alice, pid=1)
    vote(direct_vm, passed, direct_bob, pid=1)
    execute(direct_vm, passed, direct_charlie)  # proposal 0 pays PART
    with direct_vm.expect_revert("fund it first"):
        execute(direct_vm, passed, direct_charlie, pid=1)
    fund(direct_vm, passed, direct_bob, PART)
    chain_balance(direct_vm, 3 * PART)
    assert execute(direct_vm, passed, direct_charlie, pid=1) == "PAID"

def test_a_payout_needs_the_balance(passed, direct_vm, direct_charlie):
    chain_balance(direct_vm, 0)
    with direct_vm.expect_revert("balance below payout"):
        execute(direct_vm, passed, direct_charlie)
    assert passed.get_proposal(0)["status"] == "PASSED"

def test_delivered_payout_settles(passed, direct_vm, direct_charlie, chain):
    execute(direct_vm, passed, direct_charlie)
    tx, fin = chain.pay(passed, 0, "execute", [0])
    assert passed.settle_payout(0, tx, fin) == "DELIVERED"
    with direct_vm.expect_revert("already settled"):
        passed.settle_payout(0, tx, fin)

def test_failed_payout_is_recoverable_by_the_recipient(passed, direct_vm, direct_charlie, chain, ledger):
    execute(direct_vm, passed, direct_charlie)
    tx, fin = chain.pay(passed, 0, "execute", [0], delivered=False)
    assert passed.settle_payout(0, tx, fin) == "FAILED" and passed.get_recoverable(OUT) == PART
    direct_vm.sender = stranger(direct_vm)
    tick(direct_vm)
    assert passed.recover(to_hex(direct_charlie)) == PART and ledger.paid_to(direct_charlie) == PART

@pytest.mark.parametrize("kw", [{"sender": "0x" + "66" * 20}, {"at": 1}, {"status": 5}, {"result": 2}, {"delivered": None}, {"method": "close"}, {"args": [1]}])
def test_settle_rejects_a_transaction_that_is_not_this_payout(kw, passed, direct_vm, direct_charlie, chain):
    execute(direct_vm, passed, direct_charlie)
    method, a = kw.pop("method", "execute"), kw.pop("args", [0])
    tx, fin = chain.pay(passed, 0, method, a, **{"delivered": False, **kw})
    with direct_vm.expect_revert():
        passed.settle_payout(0, tx, fin)
