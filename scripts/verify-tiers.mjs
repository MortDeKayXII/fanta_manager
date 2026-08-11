// Acceptance for "set the fasce list, then manually set fasce per player":
// tiers are now user-defined (like role buckets) — edited in Settings (Setup
// links there, same as buckets already do), then assignable per player in
// Prep, and the import mapping resolves against whatever is configured.
import { chromium } from 'playwright'

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 } })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message))
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))

await p.goto('http://localhost:5173/settings', { waitUntil: 'networkidle' })
await p.waitForTimeout(800)

// --- 1. The Fasce section lists the default preset, in order --------------
const fasceSection = p.locator('section:has-text("Fasce")').first()
const tierLabelInputs = fasceSection.locator('input[type=text], input:not([type])')
const initialLabels = await tierLabelInputs.evaluateAll((els) => els.map((e) => e.value))
console.log('default fasce preset shown, in order:', initialLabels.join(',') === 'Titolare,Panchina,Scommessa')

// --- 2. Add a new fascia, rename it, reorder it ----------------------------
await fasceSection.getByRole('button', { name: 'Aggiungi fascia' }).click()
await p.waitForTimeout(400)
const newTierInput = tierLabelInputs.last()
await newTierInput.fill('Rotazione')
await p.waitForTimeout(400)
console.log('a new fascia was added and can be renamed:', (await newTierInput.inputValue()) === 'Rotazione')

// Move it up one slot (from 4th to 3rd).
const rows = fasceSection.locator('div.rounded-lg')
const upButtons = rows.locator('button[title="Sposta su"]')
await upButtons.last().click()
await p.waitForTimeout(400)
const afterMoveLabels = await tierLabelInputs.evaluateAll((els) => els.map((e) => e.value))
console.log('moving the new fascia up changes its position:', afterMoveLabels[2] === 'Rotazione')

await p.reload({ waitUntil: 'networkidle' })
await p.waitForTimeout(700)
const afterReloadLabels = await tierLabelInputs.evaluateAll((els) => els.map((e) => e.value))
console.log('the fasce list (including the reorder) persisted:', afterReloadLabels.join(',') === afterMoveLabels.join(','))

// --- 3. Prep board: the tier filter and the per-row selector both offer the
//        newly configured fasce, and setting one per player persists --------
await p.getByRole('link', { name: 'Prep' }).click()
await p.waitForURL('**/prep')
await p.waitForTimeout(600)

const tierFilter = p.locator('select').nth(2) // reparto, squadra, then fascia
const filterOptions = await tierFilter.locator('option').allTextContents()
console.log('the Prep tier filter lists the configured fasce, including the new one:', filterOptions.includes('Rotazione'))

const firstRowTierSelect = p.locator('tbody tr').first().locator('select')
const beforeTier = await firstRowTierSelect.inputValue()
// Pick whichever option isn't already selected, to force a real change.
const options = await firstRowTierSelect.locator('option').all()
let targetValue
for (const opt of options) {
  const v = await opt.getAttribute('value')
  if (v !== beforeTier) {
    targetValue = v
    break
  }
}
await firstRowTierSelect.selectOption(targetValue)
await p.waitForTimeout(600)
console.log('manually setting a fascia on one player in Prep works:', (await firstRowTierSelect.inputValue()) === targetValue)

await p.reload({ waitUntil: 'networkidle' })
await p.waitForTimeout(700)
console.log('the manually-set fascia survived reload:', (await p.locator('tbody tr').first().locator('select').inputValue()) === targetValue)

console.log('errors:', errs.length ? '\n' + errs.join('\n') : 'none')
await b.close()
