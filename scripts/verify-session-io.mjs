// Step 9 acceptance: session Export/Import JSON actually works (spec §5:
// "explicit Export session (JSON) / Import session buttons so I can back up
// mid-draft or move to another device manually"), plus the Dashboard/Settings
// wiring already covered in steps 4/7 stays intact.
import { chromium } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 }, acceptDownloads: true })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message))
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))

await p.goto('http://localhost:5173/settings', { waitUntil: 'networkidle' })
await p.waitForTimeout(800)

// --- 1. Export downloads a real JSON file describing this session ---------
const [download] = await Promise.all([
  p.waitForEvent('download'),
  p.getByRole('button', { name: /Esporta sessione/ }).click(),
])
const downloadPath = path.join(os.tmpdir(), download.suggestedFilename())
await download.saveAs(downloadPath)
const exported = JSON.parse(fs.readFileSync(downloadPath, 'utf-8'))
console.log('export filename is a .json file:', download.suggestedFilename().endsWith('.json'))
console.log('exported file contains this session\'s id and players:', exported.id === 'demo' && exported.players.length > 0)

// --- 2. Importing that same file opens it as session data, without wiping
//        the one currently open (imported under a fresh id on a collision) --
const fileInput = p.locator('input[type=file]')
await fileInput.setInputFiles(downloadPath)
await p.waitForTimeout(800)

const afterImport = await p.locator('body').innerText()
console.log('no import error is shown for a valid export:', !/File non valido|incompleto/.test(afterImport))
console.log('the imported session becomes the open one:', new RegExp(exported.name).test(afterImport))

// The original "demo" session must still be listed (not overwritten), now
// reachable via "Apri" since the import took over as the active session.
console.log('the original session is still listed, not overwritten:', (await p.locator('button', { hasText: 'Apri' }).count()) > 0)

// --- 3. A corrupt file is rejected with a message, not a crash ------------
const badPath = path.join(os.tmpdir(), 'not-a-session.json')
fs.writeFileSync(badPath, JSON.stringify({ foo: 'bar' }))
await fileInput.setInputFiles(badPath)
await p.waitForTimeout(500)
console.log('a malformed session file is rejected with a visible error:', /incompleto/.test(await p.locator('body').innerText()))

console.log('errors:', errs.length ? '\n' + errs.join('\n') : 'none')
await b.close()
