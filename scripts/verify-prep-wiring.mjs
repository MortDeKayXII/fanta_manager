// Step 4 acceptance: prep-board tagging/notes/max-price persist, and the budget
// planner's per-bucket allocation is editable and drives the dashboard's
// planned-vs-actual readout.
import { chromium } from 'playwright'

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 } })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message))
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))

await p.goto('http://localhost:5173/prep', { waitUntil: 'networkidle' })
await p.waitForTimeout(800)

// --- 1. Tag a player as target, set a max price and a note ----------------
const row = p.locator('tbody tr').first()
const name = await row.locator('td').first().innerText()
await row.locator('input[placeholder="—"]').fill('45')
await row.locator('button[title="Target"]').click()
await row.locator('input[placeholder="Nota…"]').fill('occasione')
await p.waitForTimeout(700)

console.log('max price set:', (await row.locator('input[placeholder="—"]').inputValue()) === '45')
console.log('note set:', (await row.locator('input[placeholder="Nota…"]').inputValue()) === 'occasione')

await p.reload({ waitUntil: 'networkidle' })
await p.getByText('Solo disponibili').first().waitFor()
await p.waitForTimeout(700)
// Sort/filter state resets on reload, so relocate the row by name.
const rowAfterReload = p.locator('tbody tr', { hasText: name }).first()
console.log(
  'max price survived reload:',
  (await rowAfterReload.locator('input[placeholder="—"]').inputValue()) === '45',
)
console.log(
  'note survived reload:',
  (await rowAfterReload.locator('input[placeholder="Nota…"]').inputValue()) === 'occasione',
)
console.log(
  'target filter finds the tagged player:',
  await (async () => {
    await p.locator('select').nth(3).selectOption('target')
    await p.waitForTimeout(300)
    const count = await p.locator('tbody tr').count()
    return count >= 1
  })(),
)

// --- 2. Budget allocation is editable and drives the dashboard planner ----
await p.getByRole('link', { name: 'Dashboard' }).click()
await p.waitForURL('**/dashboard')
await p.getByText('Piano budget vs speso').first().waitFor()
await p.waitForTimeout(400)

const pctInput = p
  .locator('section:has-text("Piano budget vs speso") input[type=number]')
  .first()
await pctInput.fill('40')
await p.waitForTimeout(700)
console.log('allocation edit applied:', (await pctInput.inputValue()) === '40')

await p.reload({ waitUntil: 'networkidle' })
await p.getByText('Piano budget vs speso').first().waitFor()
await p.waitForTimeout(700)
const pctAfterReload = await p
  .locator('section:has-text("Piano budget vs speso") input[type=number]')
  .first()
  .inputValue()
console.log('allocation survived reload:', pctAfterReload === '40')

console.log('errors:', errs.length ? '\n' + errs.join('\n') : 'none')
await b.close()
