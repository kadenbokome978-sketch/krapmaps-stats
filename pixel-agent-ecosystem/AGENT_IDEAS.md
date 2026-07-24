# Agent ideas — backlog

Ideas for future specialist agents, captured as they come up. Not
implemented yet — this is a holding pen, not a task list.

## Trading strategy research agent — VWAP + EMA

**Goal:** an agent whose job is to develop a VWAP + EMA trading strategy
until it's reliable enough to output real trade signals — not just run it
once, but iterate.

**Loop:**
1. Research the VWAP + EMA approach (parameters, timeframes, known
   variants, what makes it work/fail).
2. Backtest against historical data.
3. Analyze results, adjust parameters/rules.
4. Repeat until the strategy backtests consistently well.
5. Once validated, have it watch live/recent data and emit trade signals.

**Open questions for when we build this:**
- Which market/instrument and timeframe (crypto, stocks, forex)?
- Where does backtest data come from (a paid API, free source)?
- "Signal" = agent just reports it to you (dashboard/chat), or eventually
  something more automated? Per the earlier discussion — research/signal
  only, no auto-execution of real trades/money without explicit approval.
- This is a slower-feedback, harder-to-verify domain than content work
  (see earlier discussion on self-improvement loops needing fast, clear
  feedback) — backtested performance isn't the same as live performance,
  so treat backtest results as a starting hypothesis, not proof.
