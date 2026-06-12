/* Dashboard widgets: canvas line charts and the stylized Dubai corridor
   heatmap with its 24-hour clock. No chart libraries — everything is drawn. */
(function () {
  "use strict";

  /* ---------- line chart ---------- */
  class LineChart {
    constructor(canvas, series) {
      this.canvas = canvas;
      this.series = series; // [{label, color}]
      this.ctx = canvas.getContext("2d");
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = canvas.width;
      this.h = canvas.height;
      canvas.width = this.w * dpr;
      canvas.height = this.h * dpr;
      this.ctx.scale(dpr, dpr);
    }

    // data: array per series of [{x, y}]
    draw(data, xMax) {
      const ctx = this.ctx;
      const W = this.w, H = this.h;
      const padL = 44, padR = 12, padT = 14, padB = 24;
      ctx.clearRect(0, 0, W, H);

      let yMax = 10;
      for (const s of data) for (const p of s) yMax = Math.max(yMax, p.y);
      yMax *= 1.15;

      const X = (x) => padL + ((W - padL - padR) * x) / xMax;
      const Y = (y) => H - padB - ((H - padT - padB) * y) / yMax;

      // gridlines
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.fillStyle = "rgba(230,233,240,0.45)";
      ctx.font = "10px Inter, sans-serif";
      ctx.lineWidth = 1;
      ctx.textAlign = "right";
      for (let i = 0; i <= 4; i++) {
        const v = (yMax * i) / 4;
        ctx.beginPath();
        ctx.moveTo(padL, Y(v));
        ctx.lineTo(W - padR, Y(v));
        ctx.stroke();
        ctx.fillText(v >= 100 ? Math.round(v) : v.toFixed(0), padL - 6, Y(v) + 3);
      }
      ctx.textAlign = "center";
      for (let m = 0; m <= xMax / 60; m += 10) {
        ctx.fillText(m + "m", X(m * 60), H - 8);
      }

      // series
      data.forEach((pts, i) => {
        if (pts.length < 2) return;
        ctx.strokeStyle = this.series[i].color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        pts.forEach((p, j) => (j === 0 ? ctx.moveTo(X(p.x), Y(p.y)) : ctx.lineTo(X(p.x), Y(p.y))));
        ctx.stroke();
      });

      // legend
      ctx.textAlign = "left";
      let lx = padL + 8;
      this.series.forEach((s, i) => {
        ctx.fillStyle = s.color;
        ctx.fillRect(lx, padT, 14, 3);
        ctx.fillStyle = "rgba(230,233,240,0.8)";
        ctx.font = "11px Inter, sans-serif";
        ctx.fillText(s.label, lx + 19, padT + 5);
        lx += 19 + ctx.measureText(s.label).width + 22;
      });
    }
  }

  /* ---------- Dubai corridor heatmap ---------- */
  const CORRIDORS = [
    {
      name: "Sheikh Zayed Rd (E11)",
      pts: [[30, 430], [180, 372], [330, 314], [480, 256], [630, 198], [780, 140], [880, 102]],
      base: 0.25, am: 0.50, pm: 0.55,
    },
    {
      name: "Al Khail Rd (E44)",
      pts: [[60, 498], [220, 440], [380, 386], [540, 332], [700, 274], [870, 215]],
      base: 0.20, am: 0.42, pm: 0.48,
    },
    {
      name: "Sheikh Mohammed bin Zayed Rd (E311)",
      pts: [[120, 552], [290, 498], [450, 448], [610, 398], [770, 348], [880, 312]],
      base: 0.15, am: 0.35, pm: 0.42,
    },
    {
      name: "Umm Suqeim St",
      pts: [[252, 332], [310, 402], [368, 472], [415, 538]],
      base: 0.15, am: 0.38, pm: 0.40,
    },
    {
      name: "Financial Centre Rd",
      pts: [[540, 232], [580, 300], [625, 368], [662, 430]],
      base: 0.18, am: 0.42, pm: 0.50,
      labelEnd: true, // start point sits under the Downtown landmark label
    },
    {
      name: "Hessa St",
      pts: [[345, 295], [400, 365], [458, 435], [505, 505]],
      base: 0.14, am: 0.36, pm: 0.38,
    },
  ];

  const LANDMARKS = [
    { name: "Downtown · Burj Khalifa", x: 575, y: 215 },
    { name: "Dubai Marina", x: 195, y: 330 },
    { name: "Business Bay", x: 520, y: 280 },
    { name: "DXB Airport", x: 838, y: 70, anchor: "end" },
    { name: "Jebel Ali", x: 70, y: 395 },
  ];

  const COAST = [[0, 392], [150, 345], [300, 292], [450, 238], [600, 184], [750, 130], [900, 80]];

  function gauss(x, mu, sigma) {
    const d = (x - mu) / sigma;
    return Math.exp(-0.5 * d * d);
  }

  // Stable pseudo-random per segment so the map looks organic but never flickers
  function segJitter(ci, si) {
    const v = Math.sin(ci * 127.1 + si * 311.7) * 43758.5453;
    return 0.78 + 0.4 * (v - Math.floor(v));
  }

  function congestionAt(corridor, segIdx, hour, aiFactor) {
    const c =
      corridor.base +
      corridor.am * gauss(hour, 8.1, 1.25) +
      corridor.pm * gauss(hour, 17.9, 1.5) +
      0.08 * gauss(hour, 13, 2.5); // lunch shoulder
    return Math.min(1, c * segJitter(CORRIDORS.indexOf(corridor), segIdx)) * aiFactor;
  }

  function congestionColor(v) {
    const stops = [
      [0.0, [34, 197, 94]],
      [0.45, [245, 158, 11]],
      [0.75, [239, 68, 68]],
      [1.0, [127, 29, 29]],
    ];
    for (let i = 1; i < stops.length; i++) {
      if (v <= stops[i][0]) {
        const [a, ca] = stops[i - 1];
        const [b, cb] = stops[i];
        const t = (v - a) / (b - a);
        const rgb = ca.map((x, j) => Math.round(x + (cb[j] - x) * t));
        return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      }
    }
    return "rgb(127,29,29)";
  }

  const SVG_NS = "http://www.w3.org/2000/svg";

  class Heatmap {
    constructor(container) {
      const svg = document.createElementNS(SVG_NS, "svg");
      svg.setAttribute("viewBox", "0 0 900 580");
      container.appendChild(svg);
      this.svg = svg;
      this.segments = []; // {line, corridor, segIdx}

      // Coast
      const coast = document.createElementNS(SVG_NS, "polyline");
      coast.setAttribute("points", COAST.map((p) => p.join(",")).join(" "));
      coast.setAttribute("fill", "none");
      coast.setAttribute("stroke", "rgba(56,140,200,0.45)");
      coast.setAttribute("stroke-width", "3");
      coast.setAttribute("stroke-dasharray", "1 7");
      coast.setAttribute("stroke-linecap", "round");
      svg.appendChild(coast);
      const sea = document.createElementNS(SVG_NS, "text");
      sea.setAttribute("x", "120");
      sea.setAttribute("y", "250");
      sea.setAttribute("transform", "rotate(-21 120 250)");
      sea.setAttribute("fill", "rgba(56,140,200,0.5)");
      sea.setAttribute("font-size", "15");
      sea.setAttribute("letter-spacing", "8");
      sea.setAttribute("font-family", "Rajdhani, sans-serif");
      sea.textContent = "ARABIAN GULF";
      svg.appendChild(sea);

      // Corridor segments
      for (const corridor of CORRIDORS) {
        for (let i = 0; i < corridor.pts.length - 1; i++) {
          const line = document.createElementNS(SVG_NS, "line");
          const [x1, y1] = corridor.pts[i];
          const [x2, y2] = corridor.pts[i + 1];
          line.setAttribute("x1", x1); line.setAttribute("y1", y1);
          line.setAttribute("x2", x2); line.setAttribute("y2", y2);
          line.setAttribute("stroke-linecap", "round");
          svg.appendChild(line);
          this.segments.push({ line, corridor, segIdx: i });
        }
        const [lx, ly] = corridor.labelEnd ? corridor.pts[corridor.pts.length - 1] : corridor.pts[0];
        const label = document.createElementNS(SVG_NS, "text");
        label.setAttribute("x", lx + 8);
        label.setAttribute("y", ly + (corridor.labelEnd ? 20 : -12));
        label.setAttribute("fill", "rgba(212,175,55,0.85)");
        label.setAttribute("font-size", "13");
        label.setAttribute("font-family", "Rajdhani, sans-serif");
        label.setAttribute("font-weight", "600");
        label.textContent = corridor.name;
        svg.appendChild(label);
      }

      // Landmarks
      for (const lm of LANDMARKS) {
        const dot = document.createElementNS(SVG_NS, "circle");
        dot.setAttribute("cx", lm.x);
        dot.setAttribute("cy", lm.y);
        dot.setAttribute("r", "4");
        dot.setAttribute("fill", "#d4af37");
        svg.appendChild(dot);
        const t = document.createElementNS(SVG_NS, "text");
        t.setAttribute("x", lm.anchor === "end" ? lm.x - 9 : lm.x + 9);
        t.setAttribute("y", lm.y + 4);
        if (lm.anchor) t.setAttribute("text-anchor", lm.anchor);
        t.setAttribute("fill", "rgba(230,233,240,0.65)");
        t.setAttribute("font-size", "12");
        t.setAttribute("font-family", "Inter, sans-serif");
        t.textContent = lm.name;
        svg.appendChild(t);
      }
    }

    render(hour, aiFactor) {
      for (const s of this.segments) {
        const v = congestionAt(s.corridor, s.segIdx, hour, aiFactor);
        s.line.setAttribute("stroke", congestionColor(v));
        s.line.setAttribute("stroke-width", (4.5 + v * 4).toFixed(1));
        s.line.setAttribute("stroke-opacity", (0.65 + v * 0.35).toFixed(2));
      }
    }
  }

  globalThis.TrafficSim = Object.assign(globalThis.TrafficSim || {}, { LineChart, Heatmap });
})();
