/* SimView: canvas renderer for one Simulation instance. Purely a function of
   sim state — queued vehicles stack along their approach, in-transit vehicles
   interpolate along links, signals show live phase. Instantiated twice. */
(function () {
  "use strict";
  const ROAD_NAMES_H = ["SHEIKH ZAYED RD", "AL KHAIL RD", "EMIRATES RD"];
  const ROAD_NAMES_V = ["UMM SUQEIM ST", "FINANCIAL CENTRE RD", "HESSA ST"];

  const SIZE = 560;
  const MARGIN = 95;
  const ROAD_W = 24;
  // Perpendicular lane offset per approach side (right-hand traffic):
  // N/S approaches shift in x, E/W in y.
  const OFFSETS = { 0: [-6, 0], 2: [6, 0], 1: [0, -6], 3: [0, 6] };
  // Outward unit vector from intersection toward each side.
  const OUT = { 0: [0, -1], 1: [1, 0], 2: [0, 1], 3: [-1, 0] };

  function congestionColor(n) {
    if (n >= 16) return "#ef4444";
    if (n >= 9) return "#f59e0b";
    return "#22c55e";
  }

  class SimView {
    constructor(canvas, sim, accent) {
      this.canvas = canvas;
      this.sim = sim;
      this.accent = accent;
      this.ctx = canvas.getContext("2d");
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = SIZE * dpr;
      canvas.height = SIZE * dpr;
      this.ctx.scale(dpr, dpr);
      const n = sim.network.cols;
      this.coords = [];
      for (let i = 0; i < n; i++) {
        this.coords.push(MARGIN + (i * (SIZE - 2 * MARGIN)) / (n - 1));
      }
    }

    pos(ixId) {
      const ix = this.sim.network.intersections[ixId];
      return [this.coords[ix.col], this.coords[ix.row]];
    }

    draw() {
      const ctx = this.ctx;
      const sim = this.sim;
      const net = sim.network;
      ctx.clearRect(0, 0, SIZE, SIZE);

      // Roads
      ctx.fillStyle = "#161d2e";
      for (const c of this.coords) {
        ctx.fillRect(c - ROAD_W / 2, 0, ROAD_W, SIZE);
        ctx.fillRect(0, c - ROAD_W / 2, SIZE, ROAD_W);
      }
      // Centre lines
      ctx.strokeStyle = "rgba(212,175,55,0.18)";
      ctx.setLineDash([6, 8]);
      ctx.lineWidth = 1;
      for (const c of this.coords) {
        ctx.beginPath(); ctx.moveTo(c, 0); ctx.lineTo(c, SIZE); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, c); ctx.lineTo(SIZE, c); ctx.stroke();
      }
      ctx.setLineDash([]);

      // Road labels
      ctx.fillStyle = "rgba(212,175,55,0.75)";
      ctx.font = "600 10px Rajdhani, sans-serif";
      ctx.textAlign = "left";
      this.coords.forEach((y, r) => ctx.fillText(ROAD_NAMES_H[r], 6, y - ROAD_W / 2 - 5));
      this.coords.forEach((x, c) => {
        ctx.save();
        ctx.translate(x + ROAD_W / 2 + 11, SIZE - 6);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(ROAD_NAMES_V[c], 0, 0);
        ctx.restore();
      });

      // In-transit vehicles
      const tick = sim.tick;
      ctx.fillStyle = this.accent;
      for (const t of sim.transit) {
        const [fx, fy] = this.pos(t.fromIx);
        const [tx, ty] = this.pos(t.destIx);
        const p = Math.min(1, (tick - t.depart) / (t.arrive - t.depart));
        const [ox, oy] = OFFSETS[(t.heading + 2) % 4];
        const x = fx + (tx - fx) * p + ox;
        const y = fy + (ty - fy) * p + oy;
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }

      // Queues + signals per intersection
      for (const ix of net.intersections) {
        const [cx, cy] = this.pos(ix.id);

        for (let side = 0; side < 4; side++) {
          const ap = ix.approaches[side];
          if (ap.queue.length === 0) continue;
          const [ux, uy] = OUT[side];
          const [ox, oy] = OFFSETS[side];
          ctx.fillStyle = congestionColor(ap.queue.length);
          for (let j = 0; j < ap.queue.length; j++) {
            const d = 20 + j * 6.2;
            ctx.beginPath();
            ctx.arc(cx + ux * d + ox, cy + uy * d + oy, 2.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Intersection box
        ctx.fillStyle = "#0b1020";
        ctx.strokeStyle = "rgba(255,255,255,0.18)";
        ctx.lineWidth = 1;
        ctx.fillRect(cx - ROAD_W / 2, cy - ROAD_W / 2, ROAD_W, ROAD_W);
        ctx.strokeRect(cx - ROAD_W / 2, cy - ROAD_W / 2, ROAD_W, ROAD_W);

        // Signal heads: bars on the served axis
        const sg = ix.signal;
        const h = ROAD_W / 2;
        if (sg.lost > 0) {
          ctx.fillStyle = "#f59e0b";
          ctx.fillRect(cx - h, cy - h, ROAD_W, 3);
          ctx.fillRect(cx - h, cy + h - 3, ROAD_W, 3);
          ctx.fillRect(cx - h, cy - h, 3, ROAD_W);
          ctx.fillRect(cx + h - 3, cy - h, 3, ROAD_W);
        } else if (sg.phase === 0) {
          ctx.fillStyle = "#22c55e";
          ctx.fillRect(cx - h, cy - h, ROAD_W, 3);
          ctx.fillRect(cx - h, cy + h - 3, ROAD_W, 3);
          ctx.fillStyle = "#7a1f1f";
          ctx.fillRect(cx - h, cy - h, 3, ROAD_W);
          ctx.fillRect(cx + h - 3, cy - h, 3, ROAD_W);
        } else {
          ctx.fillStyle = "#22c55e";
          ctx.fillRect(cx - h, cy - h, 3, ROAD_W);
          ctx.fillRect(cx + h - 3, cy - h, 3, ROAD_W);
          ctx.fillStyle = "#7a1f1f";
          ctx.fillRect(cx - h, cy - h, ROAD_W, 3);
          ctx.fillRect(cx - h, cy + h - 3, ROAD_W, 3);
        }

        // Incident marker
        const inc = sim.scenario.incident;
        if (inc && tick >= inc.from && tick < inc.to && ix.id === inc.ix) {
          const pulse = 12 + 4 * Math.sin(tick / 3);
          ctx.strokeStyle = "rgba(239,68,68,0.9)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy, pulse + 8, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = "#ef4444";
          ctx.font = "700 13px Inter, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("⚠ INCIDENT", cx, cy - pulse - 14);
          ctx.textAlign = "left";
        }
      }

      // Source-buffer badges: demand stacked outside the network edge
      ctx.font = "700 11px Rajdhani, sans-serif";
      net.entries.forEach((e, i) => {
        const n = sim.sources[i].length;
        if (n === 0) return;
        const [cx, cy] = this.pos(e.ix);
        const [ux, uy] = OUT[e.side];
        const [ox, oy] = OFFSETS[e.side];
        const x = cx + ux * (MARGIN - 32) + ox * 3;
        const y = cy + uy * (MARGIN - 32) + oy * 3;
        ctx.fillStyle = n > 30 ? "#ef4444" : "#f59e0b";
        ctx.textAlign = "center";
        ctx.fillText("+" + n, x, y + 4);
      });
      ctx.textAlign = "left";
    }
  }

  globalThis.TrafficSim = Object.assign(globalThis.TrafficSim || {}, { SimView });
})();
