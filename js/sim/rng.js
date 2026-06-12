/* Seeded PRNG (mulberry32). Deterministic streams are the foundation of the
   "identical traffic, two controllers" comparison. */
(function () {
  "use strict";

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const api = { mulberry32 };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    globalThis.TrafficSim = Object.assign(globalThis.TrafficSim || {}, api);
  }
})();
