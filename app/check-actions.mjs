// Asserts which BylawVote app controls appear per membership, proposal state and time, and that GEN amounts are exact
// (run: node app/check-actions.mjs app/index.html).
import { readFileSync } from "node:fs";
const html = readFileSync(process.argv[2], "utf8");
const js = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const body = js.slice(js.indexOf("function propActions"), js.indexOf("async function show"));
const gl = readFileSync(new URL("./gl.js", import.meta.url), "utf8");
const pick = (name) => gl.slice(gl.indexOf(`export const ${name} =`), gl.indexOf("\n};\n", gl.indexOf(`export const ${name} =`)) + 3).replace("export ", "");
const { gen, toWei } = new Function(`${pick("gen")}\n${pick("toWei")}\nreturn { gen, toWei };`)();
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const line = (name) => js.match(new RegExp(`const ${name} = .*;`))[0];
const make = new Function("esc", "gen", "B", "short", "EXPLORER", "ctx", `let me = ctx.me; const when = (t) => String(t); ${line("addr")} ${line("cls")} ${body}; return { actions, proposal };`);
const NOW = 1000, P = 10n ** 15n;
const org = { id: 0, members: ["0xA", "0xB", "0xC"], treasury: 5n * P };
const prop = { id: 3, by: "0xA", to: "0xR", amount: P, purpose: "<shelves>", status: "VOTING", yes: 1, no: 0, ends_at: NOW + 10, clause: "", reason: "", at: 1 };
const fns = (me) => make(esc, gen, BigInt, (a) => a, "x", { me });
const pr = (me, p = {}, voted = "", now = NOW, o = {}) => fns(me).proposal({ ...prop, ...p }, { ...org, ...o }, voted, now);
const ac = (me, o = {}, recov = 0) => fns(me).actions({ ...org, ...o }, recov);
const check = (name, ok) => { console.log(ok ? "ok  " : "FAIL", name); if (!ok) process.exitCode = 1; };

check("no wallet: prompt only", ac(null).includes("Connect a wallet") && !ac(null).includes("form") && !pr(null).includes("button"));
check("a member (case-insensitive) who hasn't voted sees both votes", pr("0xa").includes('data-act="vote"') && pr("0xa").includes("Vote no"));
check("no vote for non-members, after voting, or after the period", !pr("0xX").includes("vote\"") && !pr("0xA", {}, "yes").includes('data-act="vote"') && !pr("0xA", {}, "", NOW + 10).includes('data-act="vote"'));
check("your vote is shown", pr("0xA", {}, "yes").includes("you voted yes"));
check("anyone executes a passed proposal the treasury covers", pr("0xX", { status: "PASSED" }).includes("pay 0.001 GEN") && !pr("0xX", { status: "PASSED" }, "", NOW, { treasury: P / 2n }).includes('data-act="execute"') && pr("0xX", { status: "PASSED" }, "", NOW, { treasury: P / 2n }).includes("fund it first"));
check("decided proposals take no button", ["FAILED", "PAID", "REJECTED"].every((s) => !pr("0xA", { status: s }).includes("data-act")));
check("a rejection quotes the clause, escaped", pr("0xX", { status: "REJECTED", clause: "<3.2>" }).includes("&lt;3.2&gt;") && !pr("0xX").includes("<shelves>"));
check("anyone funds; only members propose, and only with a treasury", ac("0xX").includes('data-form="fund"') && !ac("0xX").includes("propose") && ac("0xB").includes('data-form="propose"') && !ac("0xB", { treasury: 0n }).includes("propose"));
check("recover only with a failed transfer", ac("0xX", {}, 5n).includes('data-form="recover"') && !ac("0xX", {}, 0n).includes("recover"));
check("exact amounts", gen(10n ** 14n) === "0.0001" && toWei("0.009007199254740993") === 9007199254740993n);
