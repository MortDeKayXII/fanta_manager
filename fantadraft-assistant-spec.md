# FantaDraft Assistant — Build Spec for Claude Code

## 0. Context (read first)

I play Fantacalcio using the **Mantra system** (official rules: https://www.fantacalcio.it/regolamenti/sistema-mantra).
I already run my live auction draft on a third-party tool (fantalab.it), which handles the actual bidding
and stores official rosters. **This app is a separate, standalone companion tool** — it does NOT need to
integrate with fantalab.it. It works from its own player database and I update it manually (or via CSV
import) during prep and during the draft. If a live-sync integration becomes possible later, it will be
added as an optional data source, not a dependency — so build this to work fully standalone first.

The goal: help me (a) prepare before the auction (tiers, targets, budget plan) and (b) get real-time
decision support during the auction — specifically, warn me (or flag for any team) when buying a given
player would be a **"bad pick"**: too many players from the same real-life club, or a role that's already
over-covered on that team's roster.

## 1. Mantra rules — what the app needs to know

Reference roles (a player can have 1+ roles, e.g. "C, T"):

| Code | Role |
|------|------|
| Por | Goalkeeper |
| Dc | Central defender |
| B | Wing-back suited to 3-man defense (not central) |
| Dd | Right-back (4-man defense) |
| Ds | Left-back (4-man defense) |
| E | Defensive wide midfielder / wing-back |
| M | Defensive midfielder / holding mid |
| C | Central midfielder (box-to-box / playmaker) |
| T | Attacking midfielder / trequartista |
| W | Winger |
| A | Support striker |
| Pc | Out-and-out striker |

Every valid formation uses 1 GK + 5 "defensive-leaning" outfield players (from Dd, Ds, Dc, B, E, M) +
5 "offensive-leaning" outfield players (from C, T, W, A, Pc). There are 11 valid schemes total.

**Squad composition (roster size / role quotas) is NOT fixed by the official rules** — it's set per league.
Make this a **configurable setting** in the app (defaults below, editable in a Settings screen):

```
Default squad = 25 players per team:
  Por: 3
  Difensori (Dc/B/Dd/Ds): 8
  Esterni/Mediani (E/M): 5
  Centrocampisti offensivi (C/T): 5
  Attaccanti (W/A/Pc): 4
```
(These defaults are a placeholder — surface them clearly as editable so I can match my actual league's
rules before the draft.)

## 2. Data model

### Player
```
id, name, real_team (club), roles: string[] (e.g. ["C","T"]),
avg_price: number,           // "Prezzo Medio Aste" from my sheet
tier: "TIT" | "PAN" | "SCO", // "Fascia" from my sheet — starter / bench-tier / longshot
personal_tag?: "target" | "avoid" | null,
personal_note?: string,
personal_max_price?: number,
status: "available" | "sold",
sold_to?: team_id,
sold_price?: number
```

### Team (a manager in the league/draft)
```
id, name, budget_total, budget_spent (derived), budget_remaining (derived),
roster: Player[] (derived from Player.sold_to)
```

### Draft session
```
id, name, created_at, settings: { squad_requirements, num_teams, budget_per_team, flag_thresholds },
teams: Team[], players: Player[], log: DraftLogEntry[]
```

### DraftLogEntry (for undo / history)
```
timestamp, player_id, team_id, price
```

## 3. Import format

CSV/TSV import matching my existing Google Sheet columns:
```
RUOLO, NOME, SQUADRA, PREZZO MEDIO ASTE, FASCIA, FANTARUOLO
```
- `RUOLO` → split on `,` → `roles[]`
- `FANTARUOLO` can be ignored (it's derived: role + tier concatenation) or used as a sanity check
- Build the importer to be forgiving: trim whitespace, uppercase club codes, tolerate a missing FANTARUOLO
  column, and show a preview + column-mapping step before committing the import (so it survives me tweaking
  the sheet later).
- Also support manual "add player" / "edit player" in the UI, since I may want to hand-tweak tiers/notes
  after import.

## 4. Features

### 4.1 Prep phase
- Import/edit player database (above).
- Per-player: set `personal_tag` (target/avoid), `personal_note`, `personal_max_price`.
- Filter/sort by role, club, tier, avg price, tag.
- Budget planner: set total budget and a soft allocation per role bucket (e.g. "40% on Pc/A, 20% on Por+Dc...");
  show running comparison of planned vs. actual as the draft proceeds (actual only populates once live phase starts).
- Configure squad requirements and league settings (Section 1) before the draft starts.

### 4.2 Live draft phase — main screen layout

The live-draft screen is the app's core screen and should be a **three-column layout**:

**Left column — auction + opponent fit checks**
- "Player up for auction" panel (not compact — this is the primary focus area): name, club, role(s),
  tier, avg price, my personal tag/note/max price if set.
- Assign sale inline: pick winning team + final price → on confirm:
  - marks player `sold`, sets `sold_to`/`sold_price`
  - deducts from that team's budget
  - appends to draft log
  - removes player from "available" pool
- Below the auction panel, a **fit-check list, one row per team** (including my own), each showing either
  a green "OK" badge or a red/amber badge with the count of flags, expandable into a bullet list of the
  actual flag messages (see 4.4) for that team if this player were bought by them. This lets me read *every*
  team's situation at a glance during the bidding, not just mine.
- Undo last sale (pop from draft log, revert state) — needs to be one click, auctions move fast.

**Middle column — raw roster (read-only reference)**
- A compact, always-visible, **read-only** list of every player I've actually bought so far, each row just
  `name · role · price paid`. This is a plain factual log — it does NOT get reordered or edited here, and
  is NOT the same thing as the strategy board (see right column). It exists purely so I always have my
  actual purchase history in view without switching screens.
- Header shows `X/25 · budget remaining`.

**Right column — strategy board**
- A dropdown to pick from my saved strategies (created in the prep phase — see 4.3).
- Each strategy is broken into the same role-group buckets as squad requirements (Section 1), and each
  bucket has a fixed number of **slots**, each slot pre-assigned a **target price** (the price I planned to
  spend on "whoever fills this slot") when I built the strategy.
- Each slot is rendered as a **draggable puzzle-piece-shaped element** once filled by one of my actual
  purchases (visually: a rounded block with a small tab/nub, evoking a puzzle piece connector). The slot's
  **target price is shown as a separate label outside the piece**, not inside it, so actual price paid
  (on the piece) and planned price (on the label) are always both visible and easy to compare.
- I drag purchased players (from anywhere they currently sit) into whichever slot I want them to represent.
  This is a **manual mapping exercise**, not automatic assignment — after a purchase, I decide myself which
  planned slot that player is meant to fill.
- Dropping a player into a slot is **always allowed**, including when the player's actual role doesn't
  match the slot's intended role group. When that happens, render the piece in the danger/red color instead
  of the default (match) color — this is the "I bought a player who doesn't fit the plan" signal made
  visible, not a blocking error. The point is to let me see, in real time, how far my actual roster is
  drifting from the strategy I planned, and consciously re-plan slots as needed (e.g. drag another purchase
  into the now-conflicting slot, or accept the mismatch and move on).
- Empty (unfilled) slots render as a dashed placeholder showing only the target price.
- Note again: dragging a player between strategy slots does **not** affect the middle column's raw roster
  list or any budget/roster-requirement calculations elsewhere in the app — the strategy board is a planning
  overlay on top of the real purchase data, not the source of truth. The middle column and the team-fit
  calculations in the left column always derive strictly from actual `sold_to`/`sold_price` data.

**Dashboard screen (separate, secondary screen)**
- Full detail view for when I want more than the compact fit-check list: per-team budget remaining, full
  roster grid grouped by role bucket with counts vs. requirement, and a filterable available-players table.
  This is the "zoom out and audit everything" screen; the live-draft screen above is the "fast decision
  during an active auction" screen.

### 4.3 Strategy builder (prep phase)

Built before the draft, edited any time. A strategy is a named plan:
```
Strategy { id, name, description, slots: StrategySlot[] }
StrategySlot { id, role_group: bucket key (Section 1), target_price: number }
```
- I can create multiple strategies (e.g. "star-heavy attack", "balanced squad", "bargain defense") and
  switch between them freely — switching does not delete or alter the others.
- For each strategy, I define, per role-group bucket, how many slots exist and each slot's target price
  (these target prices don't have to sum to the full budget exactly, they're planning guides).
- Strategies are pure planning data — they hold no reference to real players until I manually drag a
  purchased player onto a slot during the live draft (Section 4.2, right column). A strategy can be reused
  across multiple draft sessions/simulations since it's just role-group + price targets.

### 4.4 "Bad pick" flag engine

Given a candidate player `p` and a candidate team `t`, compute and display these flags (all thresholds
configurable in settings, defaults shown):

1. **Club stacking risk**
   - Count `t`'s current players with `real_team == p.real_team`.
   - If count + 1 >= threshold (default **3**), flag: *"⚠️ Would be Nth player from {club} — fixture/rotation
     correlation risk."*

2. **Role saturation**
   - For each of `p.roles`, check how many of `t`'s current roster already cover that role bucket
     (per Section 1 buckets) vs. the configured requirement for that bucket.
   - If the bucket is already at or above quota, flag: *"⚠️ {bucket} already full for this team
     ({current}/{required}) — marginal value likely low unless upgrading a starter."*
   - If `p` is multi-role and at least one of their roles is NOT saturated, downgrade this to an info note
     rather than a warning (flexibility still has value).

3. **Price risk**
   - If `sold_price` (once entered) exceeds `avg_price` by more than a configurable % (default **25%**),
     flag as overpay; if it's a `personal_tag == "avoid"` player, flag prominently regardless of price.
   - If `personal_max_price` is set and the current bid context (manual input, since bids aren't tracked
     live) would exceed it, flag as *"Above your set max price."*

4. **Budget feasibility**
   - If buying at `avg_price` (or current entered price) would leave `t` unable to afford minimum viable
     players for remaining unfilled slots (rough heuristic: `remaining_budget - price < remaining_slots * 1`),
     flag: *"⚠️ Would strain remaining budget for {remaining_slots} open slots."*

Flags are advisory, not blocking — I can always confirm the sale anyway. Show flags as a small badge list
on the player card, color-coded by severity (info/warning).

## 5. Suggested tech stack

Single-user, session-based tool, no need for real user accounts. Recommend:

- **Frontend**: React + TypeScript + Vite, Tailwind for styling.
- **State/persistence**: Local-first — persist the whole draft session (players, teams, log, settings) to
  `localStorage` or `IndexedDB` (prefer IndexedDB via `idb` or `Dexie` since the player DB + log can get
  large-ish and localStorage has size/type limits). Add explicit **Export session (JSON)** / **Import session**
  buttons so I can back up mid-draft or move to another device manually.
- **No backend required for MVP.** If a later requirement is "multiple devices in sync during the same live
  draft" (e.g. laptop running the dashboard, phone used to log sales), that needs a small real-time backend
  (e.g. Node + Express + WebSocket, or Supabase/Firebase for quick real-time sync) — call this out as a
  **Phase 2 stretch goal**, not part of the MVP.
- **CSV parsing**: PapaParse.

## 6. Suggested screens

1. **Setup / Import** — import player DB, configure squad requirements, add teams + budgets.
2. **Prep board** — sortable/filterable player table with tagging, notes, max price, tier badges.
3. **Strategy builder** — create/edit strategies: role-group buckets, slot counts, per-slot target price
   (see 4.3). Feeds the right column of the live draft screen.
4. **Live draft** — the main working screen during the auction, three columns (see 4.2 for full detail):
   - Left: auction panel (full detail, not compact) + assign-sale form + undo + per-team fit-check list
   - Middle: compact read-only raw roster (players bought so far, with price paid)
   - Right: strategy board — selected strategy's role-group slots, each a draggable puzzle-piece element
     once filled, price target shown outside the piece, red piece on role mismatch
5. **Dashboard** — secondary/audit screen: all teams' full rosters/budgets/role-quota progress, filterable
   available-players table.
6. **Settings** — squad requirements, flag thresholds, team management.

## 7. Build order (suggested milestones for Claude Code)

1. Scaffold React+Vite+TS+Tailwind app, set up IndexedDB persistence layer and the core data model/types
   (including `Strategy`/`StrategySlot` from Section 4.3).
2. Build Setup/Import screen (CSV import with column mapping + preview, manual add/edit player, team setup).
3. Build Prep board screen (filter/sort/tag/notes/max price).
4. Build Strategy builder screen (create/edit strategies, role-group buckets, slot counts, target prices).
5. Build the live draft screen's left + middle columns: player search+card, manual sale assignment, undo,
   draft log, and the compact read-only raw roster list.
6. Implement the bad-pick flag engine (Section 4.4) as a pure function (`computeFlags(player, team, session)
   => Flag[]`) with unit tests, then wire it into the left column's auction card and per-team fit-check list.
7. Build the live draft screen's right column (strategy board): render selected strategy's slots, implement
   drag-and-drop of purchased players onto slots (always allowed, red styling on role mismatch — see 4.2),
   with the slot-to-player mapping stored as its own piece of state, separate from the roster/budget data
   (dragging must never mutate `sold_to`/`sold_price` or trigger flag recomputation).
8. Build Dashboard screen (team rosters, budgets, role-quota progress, available players table).
9. Build Settings screen (squad requirements, thresholds).
10. Polish: keyboard-friendly player search (fast entry during a live auction is important — this needs to
    be fast to use under time pressure), color-coded flag badges, export/import session JSON.

## 8. Open items to confirm/adjust before or during the build

- Exact squad composition/role quotas for my actual league (I'll edit Settings once known — defaults are a
  placeholder, don't over-invest in getting them "right" upfront).
- Number of teams and starting budget for this draft.
- Whether I want Phase 2 (multi-device live sync) at all, or single-device-only is fine.
