/* Network model, demand generation and scenarios for the Dubai signal simulation.
   Discrete-time queueing: 1 tick = 1 second. */
(function () {
  "use strict";
  const isNode = typeof module !== "undefined" && module.exports;
  const { mulberry32 } = isNode ? require("./rng.js") : globalThis.TrafficSim;

  // Compass sides, indexed clockwise. An approach's side is where its traffic
  // comes FROM: approach N holds southbound vehicles.
  const SIDES = ["N", "E", "S", "W"];
  const DELTAS = [[-1, 0], [0, 1], [1, 0], [0, -1]]; // row/col delta per heading N,E,S,W
  const PHASE_SIDES = [[0, 2], [1, 3]];              // phase 0 = NS green, phase 1 = EW green
  const TURN_STRAIGHT = 0, TURN_LEFT = 1, TURN_RIGHT = 2;
  const TURN_PROBS = { straight: 0.8, left: 0.1, right: 0.1 };

  const CONST = {
    SAT_FLOW: 0.5,      // veh/s discharge on green = 1800 veh/h/lane (standard value)
    LINK_TRAVEL: 12,    // seconds to traverse a link between intersections
    QUEUE_CAP: 20,      // jam capacity per approach; beyond this, spillback blocks upstream
    MIN_GREEN: 8,       // seconds
    MAX_GREEN: 60,      // seconds
    LOST_TIME: 3,       // all-red seconds paid on every phase switch (both controllers)
    MAX_HOPS: 16,       // pre-drawn turns per vehicle; beyond this, go straight
    LANE_LOOKAHEAD: 4,  // vehicles that can pass a blocked leader (turn lanes)
  };

  function headingFromSide(side) { return (side + 2) % 4; }

  function buildNetwork(rows, cols) {
    const intersections = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        intersections.push({
          id: r * cols + c,
          row: r,
          col: c,
          approaches: SIDES.map((_, side) => ({
            side,
            queue: [],
            credit: 0,
            pendingIn: 0, // discharged upstream, still in transit toward this approach
          })),
          signal: { phase: 0, timeInPhase: 0, lost: 0, pending: -1 },
        });
      }
    }

    // Boundary entry points: each is an approach on the grid edge fed from outside.
    const entries = [];
    for (let c = 0; c < cols; c++) entries.push({ ix: c, side: 0 });                    // from north
    for (let c = 0; c < cols; c++) entries.push({ ix: (rows - 1) * cols + c, side: 2 }); // from south
    for (let r = 0; r < rows; r++) entries.push({ ix: r * cols, side: 3 });             // from west
    for (let r = 0; r < rows; r++) entries.push({ ix: r * cols + cols - 1, side: 1 });  // from east

    // dest(ix, side, turn) -> {ix, side} downstream approach, or null = exits the grid
    function dest(ixId, side, turn) {
      const h = headingFromSide(side);
      const out = turn === TURN_LEFT ? (h + 3) % 4 : turn === TURN_RIGHT ? (h + 1) % 4 : h;
      const i = intersections[ixId];
      const r = i.row + DELTAS[out][0];
      const c = i.col + DELTAS[out][1];
      if (r < 0 || r >= rows || c < 0 || c >= cols) return null;
      return { ix: r * cols + c, side: (out + 2) % 4, heading: out };
    }

    return { rows, cols, intersections, entries, dest };
  }

  /* Demand is a pure function of (seed, tick): one RNG draw per entry per tick,
     plus a fixed 16 draws per spawned vehicle for its full turn sequence.
     It never reads controller or queue state, so two simulations built with the
     same seed receive byte-identical vehicles regardless of signal decisions.
     This is the linchpin of the fixed-vs-adaptive comparison. */
  class DemandGenerator {
    constructor(scenario, seed) {
      this.scenario = scenario;
      this.rng = mulberry32(seed);
      this.nextId = 0;
    }
    spawn(tick, network) {
      const out = [];
      for (const e of network.entries) {
        const lambda = this.scenario.rate(SIDES[e.side], tick);
        if (this.rng() < lambda) {
          const turns = [];
          for (let i = 0; i < CONST.MAX_HOPS; i++) {
            const r = this.rng();
            turns.push(r < TURN_PROBS.straight ? TURN_STRAIGHT
              : r < TURN_PROBS.straight + TURN_PROBS.left ? TURN_LEFT : TURN_RIGHT);
          }
          out.push({ entry: e, vehicle: { id: this.nextId++, turns, hops: 0, wait: 0, spawnTick: tick } });
        }
      }
      return out;
    }
  }

  // 0 before a, ramps to 1 over [a,b], holds, ramps back to 0 over [c,d]
  function trapezoid(t, a, b, c, d) {
    if (t <= a || t >= d) return 0;
    if (t < b) return (t - a) / (b - a);
    if (t <= c) return 1;
    return (d - t) / (d - c);
  }

  const SCENARIOS = {
    morning: {
      key: "morning",
      label: "Morning Rush",
      description: "Heavy north–south commuter inflow; cross traffic stays light.",
      duration: 3600,
      rate(side, t) {
        const f = trapezoid(t, 200, 800, 2300, 3100);
        const peak = side === "N" || side === "S" ? 0.20 : 0.07;
        return 0.04 + (peak - 0.04) * f;
      },
    },
    evening: {
      key: "evening",
      label: "Evening Rush",
      description: "Reversed peak: heavy east–west outflow, sharper and later.",
      duration: 3600,
      rate(side, t) {
        const f = trapezoid(t, 200, 900, 2500, 3300);
        const peak = side === "E" || side === "W" ? 0.21 : 0.08;
        return 0.04 + (peak - 0.04) * f;
      },
    },
    incident: {
      key: "incident",
      label: "Incident Surge",
      description: "Steady demand; a crash halves capacity at the central interchange.",
      duration: 3600,
      rate() { return 0.13; },
      // Capacity-side disruption: affects both simulations identically.
      incident: { from: 600, to: 2400, ix: 4, sides: [1, 3], factor: 0.5 },
    },
  };

  const api = { SIDES, PHASE_SIDES, CONST, TURN_PROBS, headingFromSide, buildNetwork, DemandGenerator, SCENARIOS, trapezoid };
  if (isNode) {
    module.exports = api;
  } else {
    globalThis.TrafficSim = Object.assign(globalThis.TrafficSim || {}, api);
  }
})();
