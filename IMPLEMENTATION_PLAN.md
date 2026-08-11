# FantaDraft Assistant — Implementation Plan

Derived from `fantadraft-assistant-spec.md`. Deliberate deviation from the spec's suggested
build order (§7): **step 1 is the full visual layer** — all six screens rendered as real
components fed by hardcoded fixtures — so the product is legible and reviewable before any
persistence, import, or flag logic exists.

---

## Guiding decisions

| Decision | Choice | Rationale |
|---|---|---|
| Mock strategy | Real React+Vite+TS+Tailwind app with hardcoded fixtures | Mocks *become* the app; no throwaway HTML |
| Data access | Every screen reads from a single `useSession()` hook | Step 2 swaps its implementation from fixtures → Dexie without touching a component |
| State shape | One `DraftSession` object, mutated through named actions (`sellPlayer`, `undoLastSale`, `assignSlot`, …) | Actions are the seam for persistence + undo |
| Role buckets | **User-defined**, stored in `settings.buckets` — not hardcoded | League rules vary; buckets drive quotas, strategies, and flags, so they must be editable |
| Strategy board isolation | `slotAssignments: Record<slotId, playerId>` lives in its own slice, never in `Player` | Spec §4.2 hard requirement: dragging must not touch `sold_to`/`sold_price` |
| Flag engine | Pure `computeFlags(player, team, session): Flag[]`, no React imports | Unit-testable, called from both the auction card and the fit-check list |
| Routing | `react-router` with 6 routes + persistent top nav | Live draft must be one click away from anywhere |

### Role buckets — user-defined

Buckets are **configuration, not code**. The user defines them in Settings: how many buckets exist,
each one's label, which of the 12 Mantra roles it contains, and its quota.

```ts
type RoleBucket = {
  id: string
  label: string        // e.g. "Difensori"
  roles: MantraRole[]  // any subset of the 12 codes
  quota: number        // required players for this bucket
  color: string        // accent token, reused across every screen
}
// settings.buckets: RoleBucket[]
```

Shipped default preset (spec §1), editable and resettable:

| Label | Roles | Quota |
|---|---|---|
| Portieri | Por | 3 |
| Difensori | Dc, B, Dd, Ds | 8 |
| Esterni/Mediani | E, M | 5 |
| Centrocampisti offensivi | C, T | 5 |
| Attaccanti | W, A, Pc | 4 |

Consequences that must hold everywhere:
- A player belongs to **every** bucket any of their roles maps to (multi-role players count in
  multiple buckets — the flag engine relies on this for the §4.4.2 downgrade-to-info rule).
- Roles may be assigned to multiple buckets, or to none — no code may assume a total partition
  of the 12 roles. Settings shows an advisory notice for unassigned roles rather than blocking.
- Nothing may hardcode five buckets or the keys `POR`/`DIF`/`EST`/`COFF`/`ATT`. Squad requirements,
  strategy builder sections, live-draft strategy-board sections, dashboard roster groupings, and the
  role-saturation flag all iterate `settings.buckets` dynamically.
- Editing a bucket after the draft starts must not corrupt data: `StrategySlot.bucket_id` and quota
  lookups resolve by id, and an orphaned slot (bucket deleted) degrades to a neutral "unassigned"
  section instead of throwing.

---

## Step 1 — Visual layer: all screens, hardcoded data ← **start here**

**Goal:** a clickable, navigable app that looks finished and contains zero business logic.
Nothing persists; a reload resets to fixtures. This is the review artifact.

### 1a. Scaffold
- `npm create vite@latest . -- --template react-ts`, Tailwind v4, `react-router`, `lucide-react` (icons), `clsx`.
- Design tokens in CSS: dark-first palette, severity colors (`info` / `warn` / `danger` / `ok`),
  role-bucket accent colors reused across every screen so a `Dc` badge looks the same everywhere.
- `AppShell`: top nav (Setup · Prep · Strategy · **Live Draft** · Dashboard · Settings) + session name +
  budget pill.

### 1b. Types + fixtures (`src/types.ts`, `src/mocks/fixtures.ts`)
- Full type set from spec §2 and §4.3 written now, final: `Player`, `Team`, `DraftSession`,
  `Settings`, `RoleBucket`, `FlagThresholds`, `DraftLogEntry`, `Strategy`, `StrategySlot`, `Flag`.
- Bucket helpers as pure functions (`bucketsForPlayer`, `bucketCounts`, `rolesWithoutBucket`) so no
  screen re-derives bucket membership by hand.
- Fixtures: ~60 real-ish Serie A players across all 12 roles and ~15 clubs, 8 teams (one flagged
  `isMe`), ~20 players already sold to create a mid-draft state, a populated draft log, and 2 strategies
  ("Star-heavy attack", "Balanced squad") with slot assignments — including one deliberate role
  mismatch so the red puzzle piece is visible on first load.

### 1c. Shared components
`RoleBadge`, `TierBadge` (TIT/PAN/SCO), `TagBadge` (target/avoid), `FlagBadge` (severity-colored),
`BudgetPill`, `BucketProgress` (count / required bar), `PlayerRow`, `EmptyState`.

### 1d. Screens (all six, static)
1. **Setup / Import** — dropzone + paste-TSV area, mock 5-row preview table with column-mapping
   selects (`RUOLO → roles`, …), team list with name + budget inputs, squad-requirements form.
2. **Prep board** — dense player table (name, club, roles, tier, avg price, tag, max price, note),
   filter bar (role bucket, club, tier, tag, text) and sortable headers — wired as *local UI state
   over fixtures*, so filtering genuinely works from day one.
3. **Strategy builder** — strategy list + editor: per bucket, slot count stepper and per-slot target
   price input, live "planned total vs. budget" readout.
4. **Live draft** — the three-column core screen:
   - *Left*: large auction card (name, club, roles, tier, avg price, personal tag/note/max), assign-sale
     row (team select + price input + Confirm), one-click Undo, and the per-team fit-check list — one
     collapsible row per team with OK / N-flags badge, expanding to bullet flag messages. In this step
     flags come from a hardcoded fixture so all severities and layouts are visible.
   - *Middle*: `X/25 · budget remaining` header over a compact read-only `name · role · price` list.
   - *Right*: strategy dropdown + bucket sections of slots. Filled slot = puzzle-piece block
     (rounded body + CSS-shaped nub) showing player + price paid, with target price as a label
     *outside* the piece; mismatch = danger color; empty slot = dashed placeholder with target price only.
     Static in this step (drag comes in step 7).
5. **Dashboard** — team cards grid (budget bars, roster grouped by bucket with counts vs. requirement) +
   filterable available-players table.
6. **Settings** — **role-bucket editor** (add/remove/rename buckets, toggle which of the 12 roles each
   contains, set quota, reset-to-default preset, advisory notice for unassigned roles), flag thresholds
   (club-stack ≥3, overpay >25%), team management, Export/Import session buttons (visually present, inert).

**Exit criteria:** every screen reachable and screenshot-ready; layout, density, and the puzzle-piece
metaphor signed off before logic lands. Feedback here is cheap; after step 2 it isn't.

---

## Step 2 — Persistence + session store
- `Dexie` schema, one row per session. `useSession()` swapped from fixtures to a store backed by
  Dexie with debounced writes; components untouched.
- Named actions implemented for real: `sellPlayer`, `undoLastSale`, `upsertPlayer`, `assignSlot`,
  `clearSlot`, `updateSettings`.
- Session create / switch / delete; fixtures survive behind a "Load demo data" button.

## Step 3 — CSV/TSV import ✅
- `lib/import.ts`: PapaParse tokenizes, everything else is pure and unit-tested (35 tests).
  Delimiter sniffed (TAB / `,` / `;`); headers matched case-, accent- and punctuation-insensitively
  with aliases, so a renamed column still maps; `RUOLO` split on `, / ; |` or whitespace; prices
  accept `€ 46`, `46,5` and `1.234`; tier read from words or codes and mined from `FANTARUOLO`
  when `FASCIA` is blank. Only `name` + `roles` are required — everything else degrades with a
  warning. A missing *column* is reported once (row 0), not once per row.
- Column mapping + preview live; per-row issues listed with spreadsheet row numbers; a
  hand-corrected mapping survives (re-guessing only on a new paste).
- Two commit paths: **merge** (default, matches on name + club — refreshes price/tier/roles and
  keeps sales and annotations) and **replace** (destructive, confirms when a draft is in progress).
- Manual add / edit / delete inline in the database list. Deleting a sold player is refused: the
  log references them by id.
- Verified by `scripts/verify-import.mjs` (23 assertions), including re-importing mid-draft.

## Step 4 — Prep board wiring
Tagging, notes, max price persisted; budget planner (soft % allocation per bucket, planned vs. actual).

## Step 5 — Strategy builder wiring ✅
CRUD on strategies (create, rename/edit description, duplicate, delete, slot add/remove,
per-slot target price) already lived in `StrategyBuilderScreen` + `store/actions.ts`, backed
by Dexie since step 2. Added: `actions.importStrategy` copies a strategy from any other known
session under fresh strategy + slot ids (never the source's), exposed as `useSession().importStrategy`
and a picker in the builder's sidebar header — the literal reading of spec §4.3 ("a strategy can be
reused across multiple draft sessions since it's just role-group + price targets"). `Strategy`/
`StrategySlot` hold no player reference, confirmed by types and by `actions.test.ts`.
Verified by `scripts/verify-strategy-wiring.mjs` (8 assertions): cross-session import, slot data
carried over, survives reload.

## Step 6 — Live draft mechanics ✅
Sale assignment (writes `sold_to`/`sold_price` + log entry, budget derives from `sold_price` via
`financeOf`) and Undo (pops the log, reverts atomically) already worked since step 2 — `sellPlayer`/
`undoLastSale` in `store/actions.ts`. Added the actually-missing piece: `PlayerSearch`
(`screens/live/AuctionPanel.tsx`) now supports ↑/↓ to move a highlight through the type-filtered
matches, Enter to load the highlighted one into the auction card, and Escape to clear — the
speed-critical path spec §7.10 calls out, previously click-only. Also fixed a real bug found while
verifying this: the auction card's "no player loaded" empty state was hiding the Undo button
entirely, making the one sale most likely to need a fast undo — the one just confirmed, which
clears the card — unreachable without picking a new player first; Undo now stays visible there too.
Verified by `scripts/verify-live-draft.mjs` (11 assertions): keyboard filter/highlight/pick/clear,
sale writes through correctly, undo works from the cleared auction-card state.

## Step 7 — Flag engine ✅
`computeFlags(player, team, session, price)` in `src/lib/flags.ts`: pure, no React imports, all
thresholds read from `session.settings.flag_thresholds` (never hardcoded). Covers all four families
from spec §4.4 — club stacking, role saturation (incl. the multi-role downgrade-to-info case when at
least one of the player's other buckets isn't saturated), price risk (overpay %, `avoid` tag flagged
regardless of price, personal max), budget feasibility (`remaining - price < openSlots *
min_credits_per_slot`, skipped once the squad is already full). 17 unit tests in `flags.test.ts`
written first, covering each family plus the exact threshold boundaries.
Replaced the step-1 `mocks/mockFlags.ts` fixture (deleted) with the real engine in both places the
spec calls for it: the fit-check list (`FitCheckList`, one call per team, memoized on
player/price/session so the 8-team list stays cheap per keystroke) and the auction card itself
(flags for whichever team is currently selected in the sale form, at the currently-entered price).
Verified by `scripts/verify-flag-engine.mjs` (9 assertions): flags appear/disappear live as price
changes, a Settings threshold edit recomputes flags immediately without touching unrelated flags.

## Step 8 — Strategy board drag & drop ✅
`@dnd-kit/core` installed; a single `DndContext` lives in `LiveDraftScreen` (the shared ancestor of
the middle and right columns) with a `DragOverlay` for the dragged piece. Drag sources are restricted
to MY team's rows in `RostersColumn` (dragging an opponent's purchase onto my plan isn't meaningful);
drop targets are every `SlotRow` in `StrategyBoard`, always accepting via `useDroppable`. `onDragEnd`
calls `assignSlot` unconditionally — a role mismatch is purely `PuzzlePiece`'s color, decided after
the write, never a gate on it. Added a "×" on a filled piece to `clearSlot` it, since drag alone
couldn't empty a slot. Ids are namespaced (`player:<id>` / `slot:<id>`) so the drop handler
distinguishes drag kinds without relying on id shape.
Guard test in `flags.test.ts`: `computeFlags` output for every team is byte-identical before and
after an `assignSlot` call against a session engineered to trip every flag family — confirms the
existing `actions.test.ts` sale-data invariant extends to flags, not just `sold_to`/`sold_price`.
Verified by `scripts/verify-strategy-dnd.mjs` (7 assertions, real `page.mouse` drag sequences): drop
fills the slot, the middle column is untouched, the assignment survives reload, and a deliberately
mismatched drop is still accepted with the danger-colored nub.

## Step 9 — Dashboard + Settings wiring ✅
Live per-team rosters/quotas/budgets, available-players filters, and editable requirements/thresholds
(with immediate flag recompute) were already done — steps 4 and 7 respectively. The one real gap was
Export/Import session JSON (spec §5), until now visually present but inert.
Added `src/lib/sessionFile.ts` (pure, unit-tested first in `sessionFile.test.ts`): `serializeSession`
(pretty JSON), `parseSessionFile` (shape-checks the required top-level keys, rejects invalid JSON or
a non-object without throwing), `sessionFileName` (accent-stripped slug + export date). Export builds
a `Blob` and triggers a browser download; Import reads the picked file, and `useSession().importSession`
saves it to Dexie and switches to it — reassigning a fresh id on an id collision so re-importing a
backup can never silently overwrite the session it came from.
Verified by `scripts/verify-session-io.mjs` (6 assertions, real file download + upload): the exported
file round-trips through import as a new session without touching the original, and a malformed file
is rejected with a message instead of crashing.

## Step 10 — Polish ✅
Shortcuts, scoped to the live-draft screen (the one used under time pressure) via a single
document-level `keydown` listener in `LiveDraftScreen`: `/` focuses the player search from anywhere
on the page, `u` undoes the last sale, `1`-`9` picks the Nth team in the sale-assignment dropdown.
All three no-op while a text field has focus, so typing a player name or a price never misfires a
shortcut. Team-select `<option>`s now show their number (`1 · Team name`) and the undo button's
title carries `(u)`, plus a one-line `<kbd>` hint under the sale row, so the shortcuts are
discoverable without a help screen.
Responsive fallback for the 3-column screen was already in place (stacks to one scrolling column
below the `xl` breakpoint) — confirmed adequate, no separate notice needed for a single-user tool
used mainly on a wide screen during a live draft.
Loading state: `useSession().loading` existed but was wired to nothing — `AppShell` now gates on it
with a small "Caricamento sessione…" message, so a real (non-demo) session never flashes the demo
fixture before its own IndexedDB read resolves.
Flag badge legibility: already covered by the dataviz-validated palette in `index.css` (documented
ΔE checks against the surface color, bucket swatch always paired with text so identity is never
color-alone) — no change needed.
Verified by `scripts/verify-polish.mjs` (6 assertions): each shortcut fires from anywhere on the
page, none fire while typing in a field, undo via `u` shrinks the draft log by exactly one.

---

## MVP complete
All ten steps of the build order are done, in the framing of this implementation plan (spec's own
suggested order in §7 was deliberately reordered — see the top of this document). Every step has a
corresponding automated verification: 100 Vitest unit tests (`src/**/*.test.ts`) plus nine Playwright
scripts under `scripts/verify-*.mjs`, all passing as of this write-up.

**Phase 2 (out of scope, per spec §5):** multi-device live sync.

## Post-MVP: user-defined fasce (tiers)
Originally the three fasce (TIT/PAN/SCO) were a hardcoded `Tier` union, unlike role buckets which
were user-defined from step 1. Reworked to match: `Settings.tiers: TierDef[]` (`{ id, label, color }`,
ordered — order drives the Prep board's ordinal sort), `Player.tier` is now a plain `string` id
referencing it. New `src/lib/tiers.ts` mirrors `lib/buckets.ts` (`defaultTiers`, `findTier`,
`tierLabel`, `tierRank`, `addTier`); new actions `setTiers`/`patchTier`/`removeTier`/`addTier`/
`moveTier` in `store/actions.ts`, the last one specific to tiers since order is meaningful here and
buckets have no equivalent. A deleted tier orphans any player who had it — degrades to showing the
raw id, same treatment `RoleBadge`/`StrategyBoard` already give an orphaned bucket, never a crash.
Settings gained a "Fasce" editor section (add/remove/rename/recolor/reorder), mirroring the bucket
editor; Setup's existing "modificali in Impostazioni" note now mentions fasce too. Prep board's tier
column became an inline `<select>` (manual per-player fascia, as requested) instead of a static badge;
its filter/sort now read `settings.tiers` instead of a hardcoded TIT/PAN/SCO order.
`lib/import.ts`'s `parseTier` now resolves a FASCIA cell against the *configured* tiers (exact id,
exact label, or — only when unambiguous — a single-letter initial) instead of a hardcoded word list;
the FANTARUOLO-mining fallback only fires for tier ids shaped like a short code (2-4 letters, the
default preset's shape), since a longer or lowercase custom id can't be told apart from the role code
reliably. `buildPlayers`/`importFromText` take `tiers` explicitly; the "no tier column" and
"unrecognized fascia" messages now name whichever tier is first in the user's list, not a hardcoded PAN.
Verified by `scripts/verify-tiers.mjs` (7 assertions: add/rename/reorder/persist a fascia in Settings,
then the Prep filter and a manual per-player fascia change both reflect it) and
`scripts/verify-tiers-import.mjs` (3 assertions: import resolves FASCIA against a *renamed* tier
label, and the renamed tier's badge renders correctly on Dashboard and the live-draft auction card).

---

## Open items (spec §8) — assumed, not blocking
- Squad quotas: spec defaults, editable in Settings from step 1.
- Teams / budget: **8 teams, 500 credits** in fixtures; both configurable.
- Multi-device sync: excluded from MVP.
