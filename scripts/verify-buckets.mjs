// Verifies buckets are genuinely user-defined: an edit in Settings must
// propagate to strategy sections, dashboard groupings and the live board.
// Navigation uses the in-app nav (client-side) — a full page reload would reset
// the in-memory step-1 store and prove nothing.
import { chromium } from 'playwright'

const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1680, height: 1000 } })
const errs = []
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message))
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))

/** A landmark unique to each screen.
 *
 *  Waiting on the URL is not enough: it changes before React swaps the DOM, so
 *  an assertion can read the PREVIOUS screen's text and report a false result.
 *  Wait for the destination's own content instead. */
const LANDMARK = {
  '/setup': 'Importa il database giocatori',
  '/prep': 'Solo disponibili',
  '/strategy': 'Slot pianificati',
  '/live': 'Verifica per squadra',
  '/dashboard': 'Piano budget vs speso',
  '/settings': 'Reparti e quote rosa',
}

const go = async (name, path) => {
  await p.getByRole('link', { name }).click()
  await p.waitForURL(`**${path}`)
  await p.getByText(LANDMARK[path], { exact: false }).first().waitFor()
  await p.waitForTimeout(150)
}
const body = () => p.locator('body').innerText()

await p.goto('http://localhost:5173/settings', { waitUntil: 'networkidle' })

// 1. Rename a bucket and change its quota.
await p.locator('input[value="Difensori"]').fill('Retroguardia')
await p.locator('input[type=number]').nth(1).fill('6')

// 2. Add a 6th bucket, give it role T (already used elsewhere -> overlap).
await p.getByRole('button', { name: /Aggiungi reparto/ }).click()
await p.waitForTimeout(200)
const newInput = p.locator('input[value^="Nuovo reparto"]')
console.log('new bucket created:', (await newInput.count()) === 1)
await p
  .locator('div.rounded-lg.border')
  .filter({ has: newInput })
  .locator('button', { hasText: /^T$/ })
  .first()
  .click()
await p.waitForTimeout(250)

const set = (await body()).replace(/\s+/g, ' ')
console.log('overlap notice shown:', /pi[ùu] reparti/i.test(set))
console.log('squad size recomputed to 24:', /rosa totale 24/.test(set))

// 3. The rename and the new bucket must appear on every other screen.
await go('Strategie', '/strategy')
const strat = await body()
console.log('strategy: renamed bucket  ->', strat.includes('Retroguardia'))
console.log('strategy: new 6th bucket  ->', /Nuovo reparto/.test(strat))
console.log('strategy: quota follows   ->', /\/6 slot/.test(strat))
await p.screenshot({ path: 'shots/v-strategy.png' })

await go('Dashboard', '/dashboard')
const dash = await body()
console.log('dashboard: renamed bucket ->', dash.includes('Retroguardia'))
console.log('dashboard: new 6th bucket ->', /Nuovo reparto/.test(dash))
await p.screenshot({ path: 'shots/v-dashboard.png' })

// The live board lists slots, not buckets, so an empty bucket is absent there by
// design. Assert that, then add a slot and assert it appears.
await go('Asta live', '/live')
const bare = await body()
console.log('live board: renamed bucket    ->', bare.includes('Retroguardia'))
console.log(
  'live board: empty bucket hidden ->',
  !/Nuovo reparto/.test(bare),
)

await go('Strategie', '/strategy')
await p
  .locator('section')
  .filter({ hasText: /Nuovo reparto/ })
  .getByRole('button', { name: 'Slot' })
  .click()
await p.waitForTimeout(200)

await go('Asta live', '/live')
const live = await body()
console.log('live board: new bucket w/slot ->', /Nuovo reparto/.test(live))
await p.screenshot({ path: 'shots/v-live.png' })

// 4. Delete every bucket — no screen may assume at least one exists.
await go('Impostazioni', '/settings')
const dels = p.locator('button[title="Elimina reparto"]')
let n = await dels.count()
while (n-- > 0) {
  await dels.first().click()
  await p.waitForTimeout(80)
}
await p.waitForTimeout(250)
console.log(
  'zero buckets: all 12 roles flagged unassigned ->',
  /Por, Dc, B, Dd, Ds, E, M, C, T, W, A, Pc/.test(await body()),
)

for (const [name, path] of [
  ['Strategie', '/strategy'],
  ['Dashboard', '/dashboard'],
  ['Asta live', '/live'],
  ['Prep', '/prep'],
  ['Setup', '/setup'],
]) {
  await go(name, path)
}
await p.screenshot({ path: 'shots/v-zero.png' })
console.log('survived zero buckets on every screen:', errs.length === 0)
console.log('errors:', errs.length ? '\n' + errs.join('\n') : 'none')
await b.close()
