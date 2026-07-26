# KrapMaps Partnerships & Funding Scout — agent brief

Standing context + operating instructions for an OpenClaw agent whose job is
finding partnerships, funding, and investors for KrapMaps on an ongoing basis.
Paste this whole file as the agent's task/context to run it.

## Standing context

> KRAPMAPS — STANDING CONTEXT BRIEF (for research agent)
>
> **Purpose:** working reference for an AI agent scanning for partnership & funding
> opportunities on an ongoing basis. Dense reference, not marketing copy. Where a
> fact is not established, it says **UNKNOWN** — do not fabricate.
> **Last updated:** 2026-07-26. Facts drift; treat figures as ~as-of late July 2026.
>
> ---
>
> ## 0. IDENTITY / QUICK FACTS
> - **Product:** KrapMaps — a free mobile app that gamifies finding & mapping public bins.
> - **Legal entity:** KrapMaps Ltd (UK, Companies House registered). **Incorporated ~February 2026** (so <1 year trading as of mid-2026 — relevant for grant eligibility caps).
> - **App:** live on Apple App Store + Google Play. Android package id `com.findkrap.krap`. Internal name "Krap"/"KrapMaps".
> - **Founder/CEO:** Harley Treagust, age 21 (turned 21 ~end June 2026). Solo technical+business founder, self-taught. UK-based.
> - **Co-founder:** Kaden Bokome — Content & Social Marketing. UK-based (near founder). **Equity/vesting NOT formalised** (open risk). Runs video content + now this research agent.
> - **Base:** Havant, Hampshire, England, UK — postcode PO9 2FW (near Portsmouth, Solent region). See §6.
> - **Domain / contact:** krapmaps.app · contact@krapmaps.app
> - **Personal driver:** founder's stated goal "#richby22" (financial success by ~June 2027). Not for external comms.
>
> ---
>
> ## 1. ORIGIN & HISTORY
> - **Genesis:** Idea born during founder's ~10-month solo backpacking trip across Southeast Asia. Observation: beautiful destinations marred by litter, largely because (a) travellers genuinely can't find a bin, and (b) individual good behaviour feels invisible/pointless. Thesis: make correct waste disposal *easy to find* and *rewarding/collective*.
> - **Build:** Founder self-built the app (React Native/Expo). Company incorporated Feb 2026.
> - **Public launch:** ~June 2026, anchored by the Mad Monkey Hostels partnership.
> - **Key milestones:**
>   - Mad Monkey Hostels signed as launch partner (24 properties, SE Asia) — the defining early win; proved the hostel-distribution model.
>   - Revolution Hostels (Pai, Thailand) as second hostel partner.
>   - Genki travel insurance affiliate partnership signed.
>   - First Country Ambassador: "Bleshie Barbie" / Tita Barbs (Philippines, ~39K FB reach; promo code BLESHIE).
>   - Press: Mad Monkey editorial + Chiang Mai City Life feature (both ~May 2026).
>   - Community Goal counter feature shipped (in-app live progress-to-prize mechanic) ~July 2026.
> - **Pivots / hard lessons:**
>   - **Premium subscription failed** (see §3): ~0% conversion → strategic pivot AWAY from B2C subscription toward B2B/sponsorship/affiliate revenue.
>   - Removed an "AI Magic description" feature (cost + error-path reduction).
>   - Security hardening pass (Firestore/Storage rules, key rotation) after an audit.
>   - UCEA Capital Partners pre-seed call was cancelled by the VC in May 2026; door left open for a Series Seed at £400K ARR.
>
> ---
>
> ## 2. WHAT IT IS TODAY
> - **Product:** Free app. Users photograph + GPS-pin public bins; other users verify them (proximity + community confirmation); verified bins populate a live map so any traveller can find a bin nearby. Gamified: points (regionally weighted), streaks, achievements, Team Crimson vs Azure, duo streaks, mini-games, and a **Community Goal counter** (whole community maps toward shared prize milestones).
> - **Core users:** international travellers / backpackers (primary early adopters). Strongest in Southeast Asia. Secondary: locals in covered areas.
> - **Stage:** **early traction / pre-seed.** Live product, real partnerships, minimal revenue.
> - **Team:** effectively 2 — Harley (CEO/product/everything) + Kaden (content/social, unpaid, informal). No other employees. Founder currently also job-hunting for personal runway income (e.g., car-sales role) — a bandwidth constraint.
> - **Revenue model (mostly TARGET, not yet realised):**
>   1. **Community Goal sponsorships** (B2B) — brands pay to sponsor the in-app community prize. One-pager built; no signed sponsor yet.
>   2. **Affiliates** — Genki insurance (signed, ~€200-300 per premium conversion); Hostelworld, Holafly (eSIM), Airalo (eSIM) — all *applied* July 2026, not yet earning.
>   3. **B2B data & licensing** — selling bin-infrastructure data to councils / tourism boards / waste-management companies. Aspirational; NO signed deals yet.
>   4. **Premium subscription** (£4.99/mo via RevenueCat) — exists but proven weak (~0 conversion); treated as tiny residual, NOT the business.
>   5. **AdMob** ads — negligible (pennies/month).
>   - **Future upside (NOT in base case):** platform integrations (e.g., Booking.com / Hostelworld "map 5 bins → 10% off") — gated on reaching ~20-30k users; would likely flow as affiliate commission.
> - **Operating area:** app data live in **29 countries**; commercial focus SE Asia (via Mad Monkey) + UK home base.
>
> ---
>
> ## 3. NUMBERS (as of ~July 2026; rough where noted)
> - Registered users: **251**
> - Bins mapped: **826** (only a small fraction verified historically — verification is a known bottleneck due to low user density)
> - Countries with data: **29**
> - Paying Premium subscribers: **0**
> - Revenue: **~£0/month** (AdMob pennies + ~$12 lifetime in-app purchases). Effectively pre-revenue.
> - Monthly burn: **~£30/month** (infrastructure only; founders unpaid)
> - New users: **~15/week**, split ~**75% organic / 20% Mad Monkey / 5% ambassador**
> - App Store funnel: **13.7%** page-view→download conversion (strong; well above ~2-5% norm)
> - Download→paid: **~1%** (real, from App Store Connect) — confirms weak Premium
> - MAU: **UNKNOWN** — no product analytics installed; Apple's opt-in sample showed only ~2 daily-active (unreliable/undercount). Android analytics pending a rebuild.
> - Retention (D1/D7/D30): **UNKNOWN** — insufficient data (note: travel app = *episodic* usage; dormancy ≠ churn).
> - Financial model (projection, driver-based, built July 2026): raise closes Nov 2026; monthly breakeven ~Q4 2027; ~£248-274K cash post-raise; £400K ARR run-rate projected ~mid-2028. These are FORECASTS, not actuals.
>
> ---
>
> ## 4. WHERE IT'S HEADED
> - **Immediate (6-12 months):**
>   - Close **£275K pre-seed** (at £1.5M pre-money, SEIS/EIS eligible).
>   - Reach **£400K ARR** — the trigger that reopens the UCEA Series Seed door.
>   - **World Cleanup Day (Sept 2026) campaign** — flagship growth push (in-app milestone + hostel "Trash Walk & Map" events + press).
>   - Scale hostel partnerships beyond SE Asia into Europe/global (chains first, then eco-flagship hostels).
>   - Recruit more Country Ambassadors (Vietnam, Indonesia, Thailand).
>   - Fix verification throughput + install proper analytics.
> - **Longer-term:** become the default traveller utility for finding bins → broader "gamified good-deeds / real-world sustainability infrastructure" platform (water refill points, cleanups, etc.), and a valuable **bin-infrastructure dataset** licensable to councils/waste firms. "Success" = a fundable growth chart, real recurring revenue (sponsorship+data+affiliate), and a Series Seed raise.
>
> ---
>
> ## 5. WHAT IT NEEDS (agent should target these)
> ### Funding (priority: non-dilutive first, given cash constraint)
> - **Grants** — young-founder + sustainability/climate + early-stage. CONFIRMED FIT: **King's Trust Enterprise Programme** (18-30, <1yr trading, ≥50% ownership — founder qualifies). Note: **Innovate UK Young Innovators has ENDED** (do not chase). Other targets to find: Shell LiveWIRE, Santander X, university/regional startup grants, environmental/climate grants.
> - **Start Up Loan** (British Business Bank, up to £25k, low fixed interest) — via King's Trust or direct.
> - **Pre-seed equity** — £275K round at £1.5M pre-money, UK SEIS (£250k allowance) + EIS. Consumer/travel-tech/sustainability angle.
> - **Angel / accelerator** — consumer & travel-tech focused; SE Asia programs (Antler, Peak XV Surge) as parallel.
> ### Partnerships that genuinely help
> - **Distribution — hostel chains** (leverage Mad Monkey proof): Wombat's, Generator, a&o, St Christopher's, Ostello Bello, YHA, Hostelworld. **AVOID Selina** (financial collapse ~2024). Also eco-award flagship hostels (HOSCAR winners).
> - **Legitimacy + volunteers — environmental NGOs:** Trash Hero World, Let's Do It World (World Cleanup Day), Plastic Free Foundation, Keep Britain Tidy (UK), Ocean Conservancy, Surfrider.
> - **Revenue — sponsors** (Community Goal): waste-management (Veolia, Biffa, SUEZ CSR arms), reusable/eco travel brands (Ocean Bottle, Chilly's, Water-to-Go), sunscreen/backpack brands.
> - **Revenue — affiliate partners:** eSIM (Airalo, Holafly — applied), travel insurance (Genki — signed; SafetyWing), Hostelworld (applied), booking platforms.
> - **B2B data buyers:** local councils, tourism boards, waste-management route-planning, urban-sustainability/tourism academic researchers.
> - **Tech/ops:** analytics tooling; anyone enabling in-app eSIM resale or data-API productisation.
> ### Constraints (filters for the agent)
> - **Money:** cash-tight, pre-revenue → prioritise non-dilutive / free / low-cost. No budget for paid programs unless clearly ROI-positive.
> - **Legal structure:** UK Ltd (KrapMaps Ltd), UK-tax-resident → UK & EU grants, SEIS/EIS, UK gov schemes.
> - **Founder profile:** UK, age 21 → youth-entrepreneur schemes (18-30/under-30/under-35).
> - **Trading age:** <1 year (from Feb 2026) → qualifies for grants with early-stage/trading-age caps; will age out of some in 2027.
> - **Bandwidth:** ~2 people, founder part-time-constrained → favour low-effort, high-leverage opportunities; not labour-heavy programs.
> - **Sector tags:** consumer app, travel-tech, sustainability/climate, gamification, waste/circular-economy, community.
> - **Compliance note:** runs in-app cash prize draws → UK free-prize-draw rules + platform (Apple/Google) contest rules apply (official rules + disclaimers).
> - **Open risks (context, not blockers):** Mad Monkey partnership is a handshake (no signed agreement); Kaden equity unformalised.
>
> ---
>
> ## 6. LOCAL / AREA CONTEXT (for location-specific schemes)
> - **Registered/based:** Havant, Hampshire, PO9 2FW — **Havant Borough**, **Hampshire county**, **Solent sub-region**, adjacent to **Portsmouth**. South-East England.
> - **Local bodies & support orgs to monitor for grants/schemes:**
>   - Havant Borough Council (local business support)
>   - Portsmouth City Council (business & sustainability grants; littering/waste KPIs = relevant B2B angle)
>   - Hampshire County Council
>   - **Solent Growth Hub** / former Solent LEP successor bodies (regional business support)
>   - Enterprise M3 / relevant Growth Hub for Hampshire
>   - **University of Portsmouth** — startup/incubator/enterprise support, student ambassador pipeline
>   - Shaping Portsmouth / local enterprise networks
> - **Why local matters for KrapMaps specifically:** Portsmouth/Havant councils have litter & waste-management remits → a **local council data-pilot** (they pay for bin-infrastructure data / a community mapping pilot) is a warm, achievable first B2B/B2G deal AND a fundable local-innovation story. Founder is a *local young founder with press* — strong narrative for regional/council schemes.
> - **National (UK) layer:** Innovate UK/UKRI, British Business Bank (Start Up Loans), King's Trust, SEIS/EIS (HMRC), UK Government Help to Grow.

## Recurring job

Scan for grants, funding programs, business partnerships, investors, and
local/regional schemes that genuinely fit KrapMaps, using §5 (what it needs),
§6 (local context), and the Investors section below as the target list, and
§7's scoring method exactly as written.

**Cadence:** twice a week. Opportunities don't change day to day — go deep on
a few leads per run rather than shallow on many.

### Investors (explicit target category)

Actively search for and surface specific investors, not just generic funding
programs:
- **Angel investors** — individuals or syndicates investing at pre-seed/SEIS
  stage in consumer apps, travel-tech, or sustainability. UK-based or
  UK-SEIS-eligible preferred (KrapMaps' £275K round is structured for
  SEIS/EIS).
- **VC funds** — small-check, pre-seed/seed-stage funds in consumer,
  travel-tech, or climate/sustainability. UCEA Capital Partners is a warm-ish
  lead already (cancelled a pre-seed call, said to revisit at £400K ARR) —
  track progress toward that trigger.
- **Accelerators/programs with investment** — Antler, Peak XV Surge (SE
  Asia), plus UK equivalents.
- For each investor found: what they typically invest (stage, check size,
  sector), why they'd plausibly be interested in KrapMaps specifically, how
  to reach them (warm intro path if any, or a real application/contact
  route), and flag clearly if they fit the *current* £275K/£1.5M pre-money
  round vs. a later stage.

## 7. Search guidance / output format

When evaluating an opportunity, score it on:
1. **Eligibility fit** — UK Ltd? young founder (18-30)? <1yr/early-stage OK?
   sustainability/consumer/travel sector? (hard filters)
2. **Effort vs reward** — favour low-effort/high-leverage (small team). Flag
   anything labour-heavy.
3. **Non-dilutive preferred** for funding; for partnerships, prioritise:
   distribution (hostels) > revenue (sponsors/affiliates/data) > legitimacy
   (NGOs).
4. **Warm-bridge potential** — can an existing partner (Mad Monkey, Genki,
   Bleshie) intro? (Mad Monkey is featured on Hostelworld's sustainability
   page = a real bridge.)
5. **Deadline/timing** — surface application windows; note World Cleanup Day
   (Sept) and the Sept VC pitch conference as anchor moments.

**Output for every opportunity:** name, what it is, why it fits KrapMaps,
eligibility check against §5 constraints, effort estimate, deadline/next
step, and a warm-intro route if any. Flag anything requiring money to enter.
Say UNKNOWN rather than guessing on eligibility.

## Hard boundaries

- Never send outreach, applications, or emails on your own — draft them for
  human review and approval, always.
- Never mention the "#richby22" personal driver, or any founder-personal
  detail, in anything meant for an external party.
- If something looks like a strong warm-intro opportunity, flag it clearly
  but don't contact the partner yourself — that's a human call.
- Skip anything already logged as pursued/dismissed rather than re-surfacing
  it every run (keep a simple running log of decisions).
