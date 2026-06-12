/* Simulation engine: discrete 1 s ticks over the network from model.js.
   Order per tick: arrivals -> spawn/feed -> signal control -> discharge ->
   wait accounting -> metrics sample. */
(function () {
  "use strict";
  const isNode = typeof module !== "undefined" && module.exports;
  const M = isNode ? require("./model.js") : globalThis.TrafficSim;
  const { CONST, PHASE_SIDES, buildNetwork, DemandGenerator } = M;

  class Simulation {
    constructor({ scenario, seed, controllerFactory, rows = 3, cols = 3 }) {
      this.scenario = scenario;
      this.seed = seed;
      this.network = buildNetwork(rows, cols);
      this.demand = new DemandGenerator(scenario, seed);
      this.controller = controllerFactory(this.network, this);
      this.tick = 0;
      this.transit = []; // {vehicle, depart, arrive, destIx, destSide, fromIx, fromSide, heading}
      // Unbounded virtual queue outside each entry: vehicles that cannot enter
      // a full boundary approach wait here (and accrue delay), so nothing is
      // ever dropped and conservation holds exactly.
      this.sources = this.network.entries.map(() => []);
      this.sourceIndex = new Map(this.network.entries.map((e, i) => [e.ix + ":" + e.side, i]));
      this.metrics = { spawned: 0, exited: 0, totalWaitTicks: 0, exitedWaitSum: 0, series: [] };
    }

    sourceFor(ixId, side) {
      const i = this.sourceIndex.get(ixId + ":" + side);
      return i === undefined ? null : this.sources[i];
    }

    satFlowFor(ixId, side, tick) {
      const inc = this.scenario.incident;
      if (inc && tick >= inc.from && tick < inc.to && ixId === inc.ix && inc.sides.includes(side)) {
        return CONST.SAT_FLOW * inc.factor;
      }
      return CONST.SAT_FLOW;
    }

    occupancy(ixId, side) {
      const ap = this.network.intersections[ixId].approaches[side];
      return ap.queue.length + ap.pendingIn;
    }

    step() {
      const tick = this.tick;
      const net = this.network;
      const mt = this.metrics;

      // 1. Arrivals: transit vehicles whose travel time elapsed join their
      // downstream queue; if it is jammed they wait at the link end.
      this.transit = this.transit.filter((t) => {
        if (t.arrive > tick) return true;
        const ap = net.intersections[t.destIx].approaches[t.destSide];
        if (ap.queue.length >= CONST.QUEUE_CAP) return true; // deferred, retries next tick
        ap.queue.push(t.vehicle);
        ap.pendingIn--;
        return false;
      });

      // 2. Spawn new demand into source buffers, then feed boundary approaches.
      for (const s of this.demand.spawn(tick, net)) {
        this.sources[this.sourceIndex.get(s.entry.ix + ":" + s.entry.side)].push(s.vehicle);
        mt.spawned++;
      }
      for (let i = 0; i < this.sources.length; i++) {
        const e = net.entries[i];
        const ap = net.intersections[e.ix].approaches[e.side];
        while (this.sources[i].length > 0 && ap.queue.length + ap.pendingIn < CONST.QUEUE_CAP) {
          ap.queue.push(this.sources[i].shift());
        }
      }

      // 3. Signal control: lost-time countdown, then min/max-green-bounded decisions.
      for (const ix of net.intersections) {
        const sg = ix.signal;
        if (sg.lost > 0) {
          sg.lost--;
          if (sg.lost === 0) {
            sg.phase = sg.pending;
            sg.pending = -1;
            sg.timeInPhase = 0;
          }
          continue;
        }
        sg.timeInPhase++;
        if (sg.timeInPhase >= CONST.MIN_GREEN) {
          let desired = this.controller.decide(ix, tick);
          if (sg.timeInPhase >= CONST.MAX_GREEN) desired = 1 - sg.phase;
          if (desired !== sg.phase) {
            sg.lost = CONST.LOST_TIME;
            sg.pending = desired;
            for (const ap of ix.approaches) ap.credit = 0;
          }
        }
      }

      // 4. Discharge on green at saturation flow. Spillback: a movement is
      // blocked when its downstream approach is at jam capacity. Lane
      // filtering: the front few vehicles can pass a blocked leader (models
      // multi-lane approaches with turn lanes); if none of them can move,
      // the approach is blocked this tick.
      for (const ix of net.intersections) {
        const sg = ix.signal;
        if (sg.lost > 0) continue;
        for (const side of PHASE_SIDES[sg.phase]) {
          const ap = ix.approaches[side];
          ap.credit = Math.min(ap.credit + this.satFlowFor(ix.id, side, tick), 2);
          while (ap.credit >= 1 && ap.queue.length > 0) {
            let pick = -1;
            let d = null;
            const look = Math.min(ap.queue.length, CONST.LANE_LOOKAHEAD);
            for (let k = 0; k < look; k++) {
              const v = ap.queue[k];
              const turn = v.hops < v.turns.length ? v.turns[v.hops] : 0;
              const cand = net.dest(ix.id, side, turn);
              if (!cand || this.occupancy(cand.ix, cand.side) < CONST.QUEUE_CAP) {
                pick = k;
                d = cand;
                break;
              }
            }
            if (pick === -1) break; // spillback: nothing in reach can move
            const veh = ap.queue.splice(pick, 1)[0];
            ap.credit -= 1;
            veh.hops++;
            if (!d) {
              mt.exited++;
              mt.exitedWaitSum += veh.wait;
            } else {
              net.intersections[d.ix].approaches[d.side].pendingIn++;
              this.transit.push({
                vehicle: veh,
                depart: tick,
                arrive: tick + CONST.LINK_TRAVEL,
                destIx: d.ix,
                destSide: d.side,
                fromIx: ix.id,
                fromSide: side,
                heading: d.heading,
              });
            }
          }
        }
      }

      // 5. Wait accounting: every vehicle held in a queue, a source buffer or
      // stuck at a jammed link end accrues one second of delay.
      let queuedNow = 0;
      for (const ix of net.intersections) {
        for (const ap of ix.approaches) {
          for (const v of ap.queue) v.wait++;
          queuedNow += ap.queue.length;
        }
      }
      for (const src of this.sources) {
        for (const v of src) v.wait++;
        queuedNow += src.length;
      }
      for (const t of this.transit) {
        if (t.arrive <= tick) {
          t.vehicle.wait++;
          queuedNow++;
        }
      }
      mt.totalWaitTicks += queuedNow;

      // 6. Periodic sample for charts.
      if (tick % 15 === 0) {
        mt.series.push({
          t: tick,
          delayPerVeh: mt.spawned ? mt.totalWaitTicks / mt.spawned : 0,
          queued: queuedNow,
          exited: mt.exited,
        });
      }

      this.tick++;
    }

    get done() {
      return this.tick >= this.scenario.duration;
    }

    // Conservation invariant: every spawned vehicle is exactly one of
    // exited / queued / in source buffer / in transit.
    audit() {
      let inQueues = 0;
      for (const ix of this.network.intersections) {
        for (const ap of ix.approaches) inQueues += ap.queue.length;
      }
      let inSources = 0;
      for (const src of this.sources) inSources += src.length;
      return {
        spawned: this.metrics.spawned,
        accounted: this.metrics.exited + inQueues + inSources + this.transit.length,
        inQueues,
        inSources,
        inTransit: this.transit.length,
      };
    }

    summary() {
      const m = this.metrics;
      return {
        spawned: m.spawned,
        exited: m.exited,
        delayPerVehicle: m.spawned ? m.totalWaitTicks / m.spawned : 0,
        avgWaitExited: m.exited ? m.exitedWaitSum / m.exited : 0,
      };
    }
  }

  const api = { Simulation };
  if (isNode) {
    module.exports = api;
  } else {
    globalThis.TrafficSim = Object.assign(globalThis.TrafficSim || {}, api);
  }
})();
