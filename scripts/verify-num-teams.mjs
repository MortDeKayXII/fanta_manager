// Acceptance for the "customizable number of teams" request: changing the
// team count in Setup (or Settings) actually resizes session.teams, and every
// screen that lists teams reflects it — not just the number field itself.
import { chromium } from 'playwright'

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 } })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message))
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))

await p.goto('http://localhost:5173/setup', { waitUntil: 'networkidle' })
await p.waitForTimeout(800)

// --- 1. Growing to 10 teams from Setup actually adds team rows -------------
const numTeamsInput = p.locator('label:has-text("Numero di squadre") input[type=number]')
await numTeamsInput.fill('10')
await p.waitForTimeout(500)
console.log('Setup shows 10 teams listed after growing:', (await p.locator('text=Squadre (').first().innerText()).includes('10'))

// --- 2. Settings reflects the same count and lists all 10 teams -----------
await p.getByRole('link', { name: 'Impostazioni' }).click()
await p.waitForURL('**/settings')
await p.waitForTimeout(400)
const settingsCountInput = p.locator('label:has-text("numero di squadre") input[type=number]')
console.log('Settings\' own team-count field shows 10:', (await settingsCountInput.inputValue()) === '10')
const teamRows = p.locator('section:has-text("Squadre della lega") input[type=text], section:has-text("Squadre della lega") input:not([type])')
console.log('Settings lists 10 team-name inputs:', (await teamRows.count()) === 10)

// --- 3. Dashboard shows 10 team cards --------------------------------------
await p.getByRole('link', { name: 'Dashboard' }).click()
await p.waitForURL('**/dashboard')
await p.waitForTimeout(400)
console.log('Dashboard renders 10 team cards:', (await p.locator('section:has-text("Squadre") .grid > div').count()) === 10)

// --- 4. Live draft's sale-assignment dropdown offers all 10 teams ---------
await p.getByRole('link', { name: 'Asta live' }).click()
await p.waitForURL('**/live')
await p.waitForTimeout(400)
const teamSelect = p.locator('section:has-text("ALL’ASTA") select')
console.log('sale dropdown lists all 10 teams:', (await teamSelect.locator('option').count()) === 10)

// --- 5. Shrinking removes from the end but refuses to drop a team with a
//        logged purchase or "my" team, so the request may be only partly
//        honored — never silently corrupting a sale. --------------------
await p.getByRole('link', { name: 'Impostazioni' }).click()
await p.waitForURL('**/settings')
await p.waitForTimeout(400)
await settingsCountInput.fill('1')
await p.waitForTimeout(500)
const afterShrink = Number(await settingsCountInput.inputValue())
console.log(
  'shrinking to 1 does not drop teams with logged purchases (demo has several):',
  afterShrink > 1,
)

// Persistence: reload and confirm the resized roster survived.
await p.reload({ waitUntil: 'networkidle' })
await p.waitForTimeout(700)
const afterReload = Number(await settingsCountInput.inputValue())
console.log('the resized team count survived reload:', afterReload === afterShrink)

console.log('errors:', errs.length ? '\n' + errs.join('\n') : 'none')
await b.close()
