// Acceptance: the CSV/TSV importer resolves the FASCIA column against the
// user's *current* configured fasce (not a hardcoded TIT/PAN/SCO set), and
// tier badges render correctly wherever a player shows up.
import { chromium } from 'playwright'

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 } })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message))
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))

// --- 1. Rename a tier's label in Settings, then confirm import matches the
//        NEW label, not the old default word. ------------------------------
await p.goto('http://localhost:5173/settings', { waitUntil: 'networkidle' })
await p.waitForTimeout(800)
const fasceSection = p.locator('section:has-text("Fasce")').first()
const firstTierInput = fasceSection.locator('input[type=text], input:not([type])').first()
await firstTierInput.fill('Big')
await p.waitForTimeout(500)

await p.getByRole('link', { name: 'Setup' }).click()
await p.waitForURL('**/setup')
await p.waitForTimeout(600)

const paste = p.locator('textarea')
await p.getByText('…oppure incolla direttamente i dati').click()
await paste.fill('RUOLO\tNOME\tSQUADRA\tPREZZO MEDIO ASTE\tFASCIA\nPc\tOsimhen\tNAP\t60\tBig')
await p.getByRole('button', { name: 'Analizza il testo incollato' }).click()
await p.waitForTimeout(600)

const previewRow = p.locator('table tr', { hasText: 'Osimhen' })
console.log('import resolves FASCIA against the renamed tier label:', /Big/.test(await previewRow.innerText()))

// --- 2. Tier badges render without crashing on Dashboard and Live Draft ---
await p.getByRole('button', { name: /Aggiorna il database/ }).click()
await p.waitForTimeout(600)

await p.getByRole('link', { name: 'Dashboard' }).click()
await p.waitForURL('**/dashboard')
await p.waitForTimeout(500)
console.log('Dashboard renders without error after custom-tier import:', errs.length === 0)

await p.getByRole('link', { name: 'Asta live' }).click()
await p.waitForURL('**/live')
await p.waitForTimeout(500)
const search = p.locator('input[placeholder*="Cerca giocatore"]')
await search.fill('Osimhen')
await p.waitForTimeout(300)
await search.press('Enter')
await p.waitForTimeout(400)
console.log('the imported player loads into the auction card with the renamed tier badge:', /Big/.test(await p.locator('section:has-text("ALL’ASTA")').innerText()))

console.log('errors:', errs.length ? '\n' + errs.join('\n') : 'none')
await b.close()
