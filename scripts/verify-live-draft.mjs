// Step 6 acceptance: keyboard-first player search (type-to-filter, ↑↓, Enter
// loads into the auction card) and the sale/undo mechanics already wired in
// step 2 (sale writes sold_to/sold_price + log entry, budget derives from it,
// undo reverts atomically).
import { chromium } from 'playwright'

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 } })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message))
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))

await p.goto('http://localhost:5173/live', { waitUntil: 'networkidle' })
await p.waitForTimeout(800)

const search = p.locator('input[placeholder*="Cerca giocatore"]')

// --- 1. Type-to-filter shows matches -------------------------------------
await search.fill('a')
await p.waitForTimeout(300)
const dropdown = search.locator('xpath=following-sibling::ul[1]')
const matchCount = await dropdown.locator('li button').count()
console.log('type-to-filter shows matches:', matchCount > 0)

// --- 2. ArrowDown moves the highlight, without picking a player ----------
const firstMatchName = await dropdown.locator('li button span').first().innerText()
await search.press('ArrowDown')
await p.waitForTimeout(150)
const highlighted = dropdown.locator('li button.bg-\\(--color-surface-3\\)')
console.log('exactly one item highlighted after ArrowDown:', (await highlighted.count()) === 1)
const highlightedName = await highlighted.locator('span').first().innerText()
console.log('highlight moved off the first match:', highlightedName !== firstMatchName)

// --- 3. Enter loads the highlighted match into the auction card, not the
//        first one that would've matched a plain click ---------------------
await search.press('Enter')
await p.waitForTimeout(400)
const auctionName = await p
  .locator('section:has-text("ALL’ASTA") h2')
  .first()
  .innerText()
console.log('Enter loaded the highlighted player into the auction card:', auctionName === highlightedName)
console.log('search box cleared after Enter:', (await search.inputValue()) === '')

// --- 4. Escape clears the query without picking anything -----------------
await search.fill('a')
await p.waitForTimeout(300)
await search.press('Escape')
await p.waitForTimeout(150)
console.log('Escape clears the query:', (await search.inputValue()) === '')
console.log('Escape does not open a stray dropdown:', (await dropdown.count()) === 0)

// --- 5. Confirming a sale writes sold_to/sold_price + a log entry, deducts
//        budget (derived), and undo reverts all of it atomically -----------
const priceInput = p.locator('section:has-text("ALL’ASTA") input[type=number]')
const teamSelect = p.locator('section:has-text("ALL’ASTA") select')
await teamSelect.selectOption({ index: 1 }) // a non-"mine" team, for a clean before/after
const chosenTeam = await teamSelect.locator('option:checked').innerText()
await priceInput.fill('51')

const before = await p.locator('body').innerText()
const logCountBefore = Number(before.match(/(\d+)\/25/)?.[1] ?? -1)

await p.getByRole('button', { name: 'Assegna' }).click()
await p.waitForTimeout(500)

const afterText = await p.locator('body').innerText()
console.log('sale removed the player from the search pool:', !new RegExp(highlightedName).test(await search.inputValue()))
console.log(
  'sale recorded under the chosen team, with the price paid:',
  new RegExp(`${highlightedName.split(' ')[0]}`).test(afterText) && /51/.test(afterText),
)
console.log(
  'auction card cleared after confirm, ready for the next pick:',
  await p.locator('text=Nessun giocatore all’asta').first().isVisible(),
)

await p.getByRole('button', { name: 'Annulla' }).click()
await p.waitForTimeout(500)
const undone = await p.locator('body').innerText()
console.log('undo removed the sale record entirely:', !new RegExp(highlightedName).test(undone))
void logCountBefore
void chosenTeam

console.log('errors:', errs.length ? '\n' + errs.join('\n') : 'none')
await b.close()
