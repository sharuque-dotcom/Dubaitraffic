/* Signal controllers. Both implement decide(intersection, tick) -> desired phase
   index, called by the engine only after MIN_GREEN has elapsed. The engine
   enforces min/max green and charges LOST_TIME on every switch, so the two
   controllers are compared on equal terms. */
(function () {
  "use strict";
  const isNode = typeof module !== "undefined" && module.exports;
  const M = isNode ? require("./model.js") : globalThis.TrafficSim;
  const { PHASE_SIDES, TURN_PROBS, CONST } = M;

  /* Conventional fixed-time plan: rigid 60 s cycle, half to each axis,
     blind to actual demand. This is the baseline most signals in the world run. */
  class FixedTimeController {
    constructor() {
      this.name = "Fixed-time";
      this.cycle = 60;
      this.split = 30;
    }
    decide(ix, tick) {
      return tick % this.cycle < this.split ? 0 : 1;
    }
  }

  /* Max-pressure control (Varaiya 2013): serve the phase whose movements have
     the greatest upstream-minus-downstream queue differential. Provably
     throughput-optimal for networks of signalized intersections, and it
     naturally avoids feeding saturated downstream links — which is exactly
     what matters during spillback and incidents. */
  class MaxPressureController {
    constructor(network, sim) {
      this.name = "AI max-pressure";
      this.network = network;
      this.sim = sim;        // for upstream-detector view of boundary demand
      this.hysteresis = 2;   // veh of pressure required to justify paying LOST_TIME
    }
    /* Capacity-aware movement pressure: each movement contributes its queued
       vehicle count weighted by the fraction of jam capacity still free
       downstream. A movement facing a full downstream link contributes zero,
       so green is never held for traffic that physically cannot discharge. */
    pressureOf(ix, phase) {
      const turnProbs = [TURN_PROBS.straight, TURN_PROBS.left, TURN_PROBS.right];
      let total = 0;
      for (const side of PHASE_SIDES[phase]) {
        const ap = ix.approaches[side];
        const cnt = [0, 0, 0];
        for (const v of ap.queue) cnt[v.hops < v.turns.length ? v.turns[v.hops] : 0]++;
        // Upstream detector: at boundary entries the controller also sees
        // vehicles queued outside the network (capped, like real detector range).
        const src = this.sim.sourceFor(ix.id, side);
        if (src) {
          const extra = Math.min(src.length, 15);
          for (let t = 0; t < 3; t++) cnt[t] += extra * turnProbs[t];
        }
        for (let turn = 0; turn < 3; turn++) {
          if (cnt[turn] === 0) continue;
          const d = this.network.dest(ix.id, side, turn);
          let room = 1; // exits always have room
          if (d) {
            const dap = this.network.intersections[d.ix].approaches[d.side];
            const free = Math.max(0, 1 - (dap.queue.length + dap.pendingIn) / CONST.QUEUE_CAP);
            // Floor the discount: even fully blocked corridors keep building
            // pressure, otherwise they would be starved forever.
            room = 0.3 + 0.7 * free;
          }
          total += cnt[turn] * room;
        }
      }
      return total;
    }
    decide(ix, tick) {
      const cur = ix.signal.phase;
      const other = 1 - cur;
      return this.pressureOf(ix, other) > this.pressureOf(ix, cur) + this.hysteresis ? other : cur;
    }
  }

  const api = { FixedTimeController, MaxPressureController };
  if (isNode) {
    module.exports = api;
  } else {
    globalThis.TrafficSim = Object.assign(globalThis.TrafficSim || {}, api);
  }
})();
