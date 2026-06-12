# Dubai Traffic Intelligence Center

A self-contained web app that demonstrates the core of solving Dubai's congestion problem:
**AI-adaptive traffic signals measurably outperform conventional fixed-time signals — on
identical traffic, live, in your browser.**

**Deploy:** pure static site — import the repo at [vercel.com/new](https://vercel.com/new)
(framework preset "Other", no build command, root output) or serve the folder anywhere.

![Dubai Traffic Intelligence Center](https://img.shields.io/badge/zero%20dependencies-vanilla%20JS-d4af37)

## What it does

1. **Live dual simulation** — two copies of the same 3×3 signalized grid (arterials labeled
   after real Dubai corridors) receive *byte-identical*, seeded traffic. The left network
   runs a rigid fixed-time signal plan; the right runs **max-pressure adaptive control**
   (Varaiya, 2013), the throughput-optimal algorithm from adaptive-signal research. Pick a
   scenario — Morning Rush, Evening Rush, or Incident Surge — and watch the delay gap open
   in real time, with a live "% delay reduced" headline.
2. **Charts** — cumulative average delay and live queue counts for both networks.
3. **A day on Dubai's corridors** — a stylized 24-hour congestion heatmap of Sheikh Zayed
   Rd, Al Khail Rd, E311 and key cross streets, with an "AI optimization" toggle that
   applies the improvement measured in the simulation above. (Illustrative profiles, not
   live RTA data.)

## Verified results

Every number in the app is reproduced deterministically by the test harness
(3 scenarios × 5 seeds × 1 simulated hour):

| Scenario | Avg delay reduction | What happens |
|---|---|---|
| Morning rush | **~47%** (43–54% across seeds) | Fixed-time wastes half its green on the light axis; adaptive reallocates it |
| Evening rush | **~50%** (44–57%) | Same, under a sharper reversed peak |
| Incident surge | **~90%** (72–95%) | A crash halves capacity at the central interchange; fixed-time gridlocks, adaptive keeps the network flowing |

```
node test/verify.js
```

asserts determinism (same seed ⇒ identical metrics), vehicle conservation
(spawned = exited + queued + in transit), sanity bounds, and that the adaptive controller
wins on **every** seed/scenario pair — and prints the full table. Exit code gates deployment.

## Run it

No build step, no dependencies:

```
open index.html            # works straight from the filesystem
# or
python3 -m http.server     # then visit http://localhost:8000
```

## How the model works (and its limits)

Discrete-time queueing simulation, 1 s steps, over a 3×3 grid of two-phase signalized
intersections:

- Poisson arrivals at 12 boundary entries, time-varying per scenario; each vehicle's full
  turn sequence is drawn at spawn from a seeded RNG, so demand never depends on controller
  behaviour — the linchpin of the fair comparison.
- Saturation discharge of 0.5 veh/s per approach on green (= the standard
  1800 veh/h/lane), 12 s link travel time, jam capacity of 20 vehicles per approach with
  spillback blocking, and lane filtering past a blocked leader.
- Both controllers pay the same 3 s lost time on every phase switch and respect the same
  8 s minimum / 60 s maximum green.
- The adaptive side computes capacity-aware max-pressure: each movement's queue weighted by
  remaining downstream room (floored so blocked corridors are never starved).

It is a *concept demonstration*, not a calibrated model of Dubai's network: real
intersections have more phases, real demand is messier, and real deployments
(Pittsburgh's Surtrac, Hangzhou's City Brain) report 10–25% travel-time gains city-wide.
The point the demo makes is directional and robust: rigid plans waste green time, and
queue-responsive control recovers it — most dramatically when something goes wrong.

## Repository layout

```
index.html            single page, plain <script> tags (loads from file:// too)
css/style.css         dark command-center theme
js/sim/rng.js         seeded PRNG (mulberry32)
js/sim/model.js       network, demand generation, scenarios
js/sim/controllers.js fixed-time + max-pressure controllers
js/sim/engine.js      tick loop, spillback, metrics
js/ui/render.js       canvas renderer (instantiated twice)
js/ui/dashboard.js    charts + Dubai corridor heatmap
js/main.js            wiring and animation loop
test/verify.js        deterministic verification harness (Node, zero deps)
```

The simulation core runs unchanged in the browser (via a `TrafficSim` global) and in Node
(via CommonJS exports), which is what makes the claims testable.
