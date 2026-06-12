# Dubai AI Traffic Initiative

An executive package for pitching an AI-powered traffic management programme for Dubai,
plus a working prototype that demonstrates the core idea: **AI-adaptive traffic signals
measurably outperform fixed-time signals.**

## What's in this repo

| Path | What it is | How to use it |
|---|---|---|
| `presentation/index.html` | Executive slide deck (self-contained, no internet needed) | Open in any browser. Navigate with arrow keys, space, or click. Press `F` for fullscreen. |
| `demo/index.html` | **Live interactive demo** — fixed-time vs AI-adaptive signal control, side by side, identical traffic | Open in any browser. Click "Start rush hour" during the presentation. |
| `docs/proposal.md` | Detailed written proposal (problem, solution architecture, roadmap, KPIs, risks, budget framing) | Share as the leave-behind document after the meeting. |
| `prototype/adaptive_signals.py` | Zero-dependency Python simulation backing the demo's claims with repeatable numbers | `python3 prototype/adaptive_signals.py` |

## Suggested flow for the leadership meeting (15–20 min)

1. **Slides 1–4** — the problem and why now (3 min)
2. **Slides 5–8** — the four solution pillars (5 min)
3. **Switch to `demo/index.html`** — run the rush-hour scenario live; the adaptive side
   visibly clears queues the fixed-time side cannot (3 min). This is the moment that lands.
4. **Slides 9–12** — roadmap, KPIs, and the ask (5 min)
5. Leave `docs/proposal.md` with the audience.

## A note on the figures

Headline statistics in the deck (congestion cost, hours lost, vehicle growth, results from
Pittsburgh/Hangzhou deployments) are drawn from public reporting and are marked with their
sources on each slide. **Verify the latest figures with RTA / TomTom Traffic Index before
presenting** — they are directionally correct but updated annually.

The simulation numbers (≈30–50% wait-time reduction under surge demand) are produced by the
prototype in this repo and are fully reproducible: run `python3 prototype/adaptive_signals.py`.
