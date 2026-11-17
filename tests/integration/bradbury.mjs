// End-to-end on Testnet Bradbury (Phase 2), on the packed code that is deployed:
//
//   python deploy/shrink.py contracts/bylaw_vote.py build/bylaw_vote.py --pack
//   npm i genlayer-js@2.0.0-rc.2   # plus the estimateTransactionFees patch in app/README.md
//   GL_PK0=0x... GL_PK1=0x... GL_PK2=0x... node tests/integration/bradbury.mjs build/bylaw_vote.py [contract]
//
// GL_PK0 and GL_PK1 are the two members of a co-op whose bylaws are served from evidence/ (EVIDENCE);
// GL_PK2 is the supplier, not a member. Validators pin the bylaws' hash at founding. Proposal 1 (flour
// and rice from the supplier) passes and, checked against the bylaws, is paid. Proposal 2 pays the
// member who proposed it: it passes the vote but validators reject it under clause 3.3. Proposal 3 is
// voted down and cannot be executed. Duplicate members, a non-member's proposal and vote, a second
// vote and a proposal above the treasury are refused. The payout settles from its own transfer.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createAccount, createClient, MessageType, encodeExternalMessageFeeParams } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

const PRICE = 10n ** 14n;
const ARGS = [];
const EVIDENCE = process.env.EVIDENCE ?? "https://bylawvote.cristhedev.com/evidence/";
const BYLAWS = EVIDENCE + "bylaws.html";
const CONSENSUS_MAIN = "0x2e2766cbc3e5e61ce93bbcdcbb3eacb82082a019";
const T_FINALIZED = "0x24196ec40f90671b7144e716978686b4f3c7d6b00b23da3971ef2b52af27d87f";
const PAYOUT_GAS = 100000n, PAYOUT_GAS_PRICE = 1000000000n;
// rpc.testnet-chain.genlayer.com (the chain default) does not serve gen_call; this one serves the same chain.
const endpoint = "https://rpc-bradbury.genlayer.com";
const a0 = createAccount(process.env.GL_PK0);
const a1 = createAccount(process.env.GL_PK1);
const a2 = createAccount(process.env.GL_PK2);
const c0 = createClient({ chain: testnetBradbury, endpoint, account: a0 });
const c1 = createClient({ chain: testnetBradbury, endpoint, account: a1 });
const c2 = createClient({ chain: testnetBradbury, endpoint, account: a2 });
const sha = (t) => createHash("sha256").update(t).digest("hex");
const page = async (url) => sha(Buffer.from(await (await fetch(url)).arrayBuffer()));
const fees = async (c, payee) => {
  const messageAllocations = payee && [{
    messageType: MessageType.External, onAcceptance: false, recipient: payee, budget: PAYOUT_GAS * PAYOUT_GAS_PRICE,
    callKey: "0x" + "00".repeat(32), feeParams: encodeExternalMessageFeeParams({ gasLimit: PAYOUT_GAS, maxGasPrice: PAYOUT_GAS_PRICE }),
  }];
  // A read, so retrying a dropped connection is safe.
  let e;
  for (let i = 0; !e; i++) {
    try { e = await c.estimateTransactionFees(payee ? { messageAllocations } : {}); }
    catch (err) { if (i >= 5 || !/fetch failed|ECONNRESET|timed out|socket/i.test(String(err?.details ?? err?.message))) throw err; await new Promise((r) => setTimeout(r, 10000)); }
  }
  return { distribution: e.distribution, feeValue: e.feeValue, ...(payee && { messageAllocations: e.messageAllocations }) };
};
// The public RPC drops connections now and then; retry the wait, never the write.
async function wait(c, hash, waitUntil = "decided") {
  for (let i = 0; ; i++) {
    try {
      return await c.waitForTransactionReceipt({ hash, waitUntil, interval: 10000, retries: 360 });
    } catch (e) {
      if (i >= 5 || !/fetch failed|ECONNRESET|timed out|socket/i.test(String(e?.details ?? e?.message))) throw e;
      await new Promise((r) => setTimeout(r, 10000));
    }
  }
}
const check = (ok, what) => {
  console.log(ok ? "  ok  " : "  FAIL", what);
  if (!ok) process.exit(1);
};
// A finalized leader timeout (NOT_VOTED) or vote without a majority (NO_MAJORITY) applied nothing, so sending the call again is safe. Bradbury still
// moves the value of such a transaction, and of a reverted one, into the contract, where
// get_accounting shows it as unaccounted.
// A dropped connection while sending: send again only if the account's nonce did not move (nothing went out).
async function send(c, req) {
  for (let i = 0; ; i++) {
    const n = await rpc("eth_getTransactionCount", [c.account.address, "pending"]);
    try { return await c.writeContract(req); }
    catch (e) {
      if (i >= 5 || !/fetch failed|ECONNRESET|timed out|socket/i.test(String(e?.details ?? e?.message))) throw e;
      await new Promise((r) => setTimeout(r, 15000));
      if ((await rpc("eth_getTransactionCount", [c.account.address, "pending"])) !== n) throw e;
    }
  }
}
let stray = 0n;
const NONE = new Set(["NO_MAJORITY", "MAJORITY_DISAGREE"]);
async function tx(c, label, functionName, args, { value = 0n, payee } = {}) {
  for (let i = 0; ; i++) {
    const hash = await send(c, { address, functionName, args, value, fees: await fees(c, payee) });
    let r = await wait(c, hash);
    // NOT_VOTED / NO_MAJORITY can be an intermediate round (one such buy later finalized and ran on
    // Bradbury): wait for finality and retry only if it still applied nothing.
    if (r.txExecutionResultName === "NOT_VOTED" || NONE.has(r.resultName)) r = await wait(c, hash, "finalized");
    // NO_MAJORITY / MAJORITY_DISAGREE (e.g. the leader's LLM quoted text not on the page, which no
    // validator accepts): nothing was applied, whatever the leader returned.
    const res = NONE.has(r.resultName) ? r.resultName : r.txExecutionResultName;
    console.log(`${label}: ${hash} ${res}`);
    if (res !== "FINISHED_WITH_RETURN") stray += value;
    if ((res !== "NOT_VOTED" && !NONE.has(res)) || i >= 5) return { ...r, txExecutionResultName: res, hash };
  }
}
const ok = async (...a) => { const r = await tx(...a); check(r.txExecutionResultName === "FINISHED_WITH_RETURN", `${a[1]} succeeds`); return r; };
// A rejection is a transaction that ran and reverted, never one that was not voted on.
const fails = async (what, ...a) => check((await tx(...a)).txExecutionResultName === "FINISHED_WITH_ERROR", what);
const read = async (functionName, args = []) => {
  const v = await c0.readContract({ address, functionName, args });
  const plain = (x) => (x instanceof Map ? Object.fromEntries([...x].map(([k, y]) => [k, plain(y)])) : Array.isArray(x) ? x.map(plain) : x);
  return plain(v);
};
// RPC nodes behind the edge can lag the one that reported the receipt: re-read until `ok` holds (or give up).
async function settled(fn, args, ok) {
  for (let i = 0; ; i++) {
    const v = await read(fn, args);
    if (ok(v) || i >= 12) return v;
    await new Promise((r) => setTimeout(r, 10000));
  }
}
// Reads only, so retrying a dropped connection is safe.
const rpc = async (method, params) => {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", "user-agent": "bylawvote-e2e" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      return (await r.json()).result;
    } catch (e) { if (i >= 5) throw e; await new Promise((r) => setTimeout(r, 10000)); }
  }
};
// The consensus-layer transaction that finalized `hash`: it emits TransactionFinalized(txId).
async function finalizeTx(hash, fromBlock) {
  for (;;) {
    const to = BigInt(await rpc("eth_blockNumber", []));
    for (let b = fromBlock; b <= to; b += 1000n) {
      const end = b + 999n > to ? to : b + 999n;
      const logs = await rpc("eth_getLogs", [{ address: CONSENSUS_MAIN, topics: [T_FINALIZED, hash], fromBlock: "0x" + b.toString(16), toBlock: "0x" + end.toString(16) }]);
      if (logs?.length) return logs[0].transactionHash;
    }
    await new Promise((r) => setTimeout(r, 30000));
  }
}
async function settle(id, paid, fromBlock) {
  await wait(c0, paid.hash, "finalized");
  const fin = await finalizeTx(paid.hash, fromBlock);
  console.log(`finalized by ${fin}`);
  await ok(c2, `settle payout ${id}`, "settle_payout", [id, paid.hash, fin]);
  check((await settled("get_payout", [id], (x) => x.status === "DELIVERED")).status === "DELIVERED", `payout ${id} DELIVERED`);
  await fails("a payout settles once", c2, "settle again", "settle_payout", [id, paid.hash, fin]);
}

let address = process.argv[3];
if (!address) {
  const hash = await c0.deployContract({ code: readFileSync(process.argv[2], "utf8"), args: ARGS, fees: await fees(c0) });
  const r = await wait(c0, hash);
  address = r.txDataDecoded?.contractAddress;
  console.log(`deploy: ${hash} ${r.txExecutionResultName} -> ${address}`);
  check(r.txExecutionResultName === "FINISHED_WITH_RETURN", "deployed");
}
const fromBlock = BigInt(await rpc("eth_blockNumber", []));
stray = BigInt((await read("get_accounting")).unaccounted);
const pid = Number((await read("get_accounting")).payout_count), low = (x) => x?.toLowerCase();
const now = () => Math.floor(Date.now() / 1000), sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
const m0 = a0.address, m1 = a1.address, sup = a2.address;
const oid = Number((await read("get_orgs", [0, 1])).total);
await fails("members must differ", c0, "found with a duplicate member", "found", ["Riverside Food Co-op", [m0, m0.toLowerCase()], 1, 1, BYLAWS]);
await ok(c0, "found the co-op (2 members, quorum 2, 1 h)", "found", ["Riverside Food Co-op", [m0, m1], 2, 1, BYLAWS]);
const o = await settled("get_org", [oid], (x) => !!x?.bylaws_hash);
check(o.bylaws_hash.length === 64 && o.members.length === 2, `bylaws pinned: ${o.bylaws_hash.slice(0, 16)}…`);
await ok(c2, "anyone funds the treasury", "fund", [oid], { value: 5n * PRICE });
await fails("only members propose", c2, "the supplier proposes", "propose", [oid, sup, PRICE, "Pay me for the flour I delivered last week"]);
await fails("a proposal above the treasury is refused", c0, "propose 6x", "propose", [oid, sup, 6n * PRICE, "Food stock: a year of flour and rice for the shop"]);
const pr = Number((await read("get_proposals", [oid, 0, 1])).total);

// Proposal 1: food stock from the supplier.
await ok(c0, "propose food stock from the supplier", "propose", [oid, sup, 2n * PRICE, "Food stock: 40 kg of flour and rice for the shop from the Mill Lane wholesaler"]);
await ok(c0, "member 0 votes yes", "vote", [pr, true]);
await fails("one vote per member", c0, "member 0 votes again", "vote", [pr, true]);
await fails("only members vote", c2, "the supplier votes", "vote", [pr, true]);
await ok(c1, "member 1 votes yes", "vote", [pr, true]);
check((await settled("get_proposal", [pr], (x) => x.status !== "VOTING")).status === "PASSED", "proposal 1 PASSED");
const p1 = await ok(c2, "execute proposal 1 (anyone)", "execute", [pr], { payee: sup });
let p = await settled("get_proposal", [pr], (x) => x.status !== "PASSED");
check(p.status === "PAID", `PAID within the bylaws: ${p.reason}`);
await fails("a paid proposal pays once", c2, "execute proposal 1 again", "execute", [pr], { payee: sup });

// Proposal 2: a payment to the member who proposed it.
await ok(c1, "member 1 proposes paying themselves", "propose", [oid, m1, PRICE, "Repairs to the shop freezer, which I fixed myself last weekend"]);
await ok(c0, "member 0 votes yes", "vote", [pr + 1, true]);
await ok(c1, "member 1 votes yes", "vote", [pr + 1, true]);
await ok(c2, "execute proposal 2", "execute", [pr + 1], { payee: m1 });
p = await settled("get_proposal", [pr + 1], (x) => x.status !== "PASSED");
check(p.status === "REJECTED" && p.clause.includes("3.3"), `REJECTED under clause ${p.clause}: ${p.reason}`);

// Proposal 3: voted down.
await ok(c0, "propose a members' party", "propose", [oid, sup, PRICE, "Catering for the members' summer party in the shop"]);
await ok(c1, "member 1 votes no", "vote", [pr + 2, false]);
check((await settled("get_proposal", [pr + 2], (x) => x.status !== "VOTING")).status === "FAILED", "proposal 3 FAILED: yes can no longer win");
await fails("a failed proposal cannot be executed", c2, "execute proposal 3", "execute", [pr + 2], { payee: sup });
check(BigInt((await read("get_org", [oid])).treasury) === 3n * PRICE, "treasury holds the rest");

const ps = await settled("get_payout", [pid], (x) => !!x?.kind);
check(ps.kind === "proposal" && BigInt(ps.amount) === 2n * PRICE && low(ps.to) === low(sup), `payout ${pid}: proposal ${2n * PRICE} to ${sup.slice(0, 8)}`);
await settle(pid, p1, fromBlock);
check(BigInt((await read("get_accounting")).unaccounted) === stray, `balance matches what the contract expects to hold (+${stray} from unexecuted or reverted txs)`);
console.log("contract", address, "org", oid, "proposals", pr, pr + 1, pr + 2);
