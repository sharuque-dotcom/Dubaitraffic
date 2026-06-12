#!/usr/bin/env node
/* Verification harness for the simulation core. Run: node test/verify.js
   Asserts, across all scenarios and seeds:
     1. Determinism  — same seed twice gives identical metrics
     2. Conservation — spawned = exited + queued + in source + in transit
     3. Sanity       — no NaN, positive throughput
     4. The claim    — AI max-pressure beats fixed-time on every run,
                       by >= 15% average delay on rush scenarios
   Exits nonzero on any failure; the printed table backs the README numbers. */
"use strict";

const { SCENARIOS } = require("../js/sim/model.js");
const { FixedTimeController, MaxPressureController } = require("../js/sim/controllers.js");
const { Simulation } = require("../js/sim/engine.js");

const SEEDS = [1337, 20260612, 42, 7, 99991];
let failures = 0;

function check(cond, msg) {
  if (!cond) {
    failures++;
    console.error("  FAIL: " + msg);
  }
}

function run(scenario, seed, controllerFactory) {
  const sim = new Simulation({ scenario, seed, controllerFactory });
  while (!sim.done) sim.step();
  return sim;
}

const fixedFactory = () => new FixedTimeController();
const aiFactory = (network, sim) => new MaxPressureController(network, sim);

console.log("Dubai Traffic Intelligence Center — simulation verification");
console.log("scenarios: " + Object.keys(SCENARIOS).join(", ") + " | seeds: " + SEEDS.join(", ") + " | 3600 ticks each\n");

const rows = [];
for (const scenario of Object.values(SCENARIOS)) {
  for (const seed of SEEDS) {
    const fixed = run(scenario, seed, fixedFactory);
    const ai = run(scenario, seed, aiFactory);
    const f = fixed.summary();
    const a = ai.summary();

    // 1. Determinism
    const fixed2 = run(scenario, seed, fixedFactory).summary();
    check(JSON.stringify(f) === JSON.stringify(fixed2),
      `${scenario.key}/${seed}: rerun with same seed produced different metrics`);

    // Identical demand on both sides
    check(f.spawned === a.spawned,
      `${scenario.key}/${seed}: demand differed between controllers (${f.spawned} vs ${a.spawned})`);

    // 2. Conservation
    for (const [name, sim] of [["fixed", fixed], ["ai", ai]]) {
      const audit = sim.audit();
      check(audit.spawned === audit.accounted,
        `${scenario.key}/${seed}/${name}: conservation broken (spawned ${audit.spawned}, accounted ${audit.accounted})`);
    }

    // 3. Sanity
    for (const [name, s] of [["fixed", f], ["ai", a]]) {
      check(Number.isFinite(s.delayPerVehicle) && Number.isFinite(s.avgWaitExited),
        `${scenario.key}/${seed}/${name}: NaN in metrics`);
      check(s.exited > 0, `${scenario.key}/${seed}/${name}: zero throughput`);
    }

    // 4. The claim
    const improvement = (f.delayPerVehicle - a.delayPerVehicle) / f.delayPerVehicle;
    check(improvement > 0,
      `${scenario.key}/${seed}: AI did not beat fixed-time (${(improvement * 100).toFixed(1)}%)`);
    if (scenario.key !== "incident") {
      check(improvement >= 0.15,
        `${scenario.key}/${seed}: improvement ${(improvement * 100).toFixed(1)}% below 15% bar`);
    }

    rows.push({
      scenario: scenario.key,
      seed,
      spawned: f.spawned,
      fixedDelay: f.delayPerVehicle,
      aiDelay: a.delayPerVehicle,
      fixedExited: f.exited,
      aiExited: a.exited,
      improvement,
    });
  }
}

console.log(
  "scenario  seed      veh   fixed delay/veh   AI delay/veh   fixed out   AI out   improvement"
);
for (const r of rows) {
  console.log(
    r.scenario.padEnd(10) +
    String(r.seed).padEnd(10) +
    String(r.spawned).padEnd(6) +
    (r.fixedDelay.toFixed(1) + " s").padEnd(18) +
    (r.aiDelay.toFixed(1) + " s").padEnd(15) +
    String(r.fixedExited).padEnd(12) +
    String(r.aiExited).padEnd(9) +
    (r.improvement * 100).toFixed(1) + "%"
  );
}

for (const key of Object.keys(SCENARIOS)) {
  const sub = rows.filter((r) => r.scenario === key);
  const avg = sub.reduce((s, r) => s + r.improvement, 0) / sub.length;
  console.log(`\n${key}: average delay reduction ${(avg * 100).toFixed(1)}%`);
}

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll checks passed.");
