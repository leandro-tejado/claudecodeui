#!/usr/bin/env node
// Measures the critical path: everything the browser must download before the app
// can render. That is the entry script, every modulepreload the entry pulls in, and
// the stylesheet. A chunk that exists in dist/ but is not referenced here is fine —
// it gets fetched on demand, which is the whole point of the lazy loading work.
//
//   node scripts/bundle-budget.mjs --report       print the table, never fail
//   node scripts/bundle-budget.mjs                enforce the ceiling below
//   node scripts/bundle-budget.mjs --max-raw N    enforce a different ceiling
//
// The ceiling is on the raw bytes because that is what the parser has to chew
// through; brotli only decides how long the download takes.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')

// Baseline on 22-sep-2026: 4.561.075 raw bytes. The lazy-loading work brought it
// to 1.522.786, a 66.6% cut. The ceiling is set a little above that — enough room
// for ordinary growth in the first screen, tight enough that a static import
// dragging a deferred module back to the start fails the build instead of quietly
// undoing the work.
const DEFAULT_MAX_RAW = 1_700_000

function parseArgs(argv) {
    const args = { report: false, maxRaw: DEFAULT_MAX_RAW }
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--report') args.report = true
        else if (argv[i] === '--max-raw') args.maxRaw = Number(argv[++i])
    }
    return args
}

function criticalAssets(html) {
    const assets = []
    const seen = new Set()
    const patterns = [
        /<script[^>]+type="module"[^>]+src="([^"]+)"/g,
        /<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g,
        /<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g,
    ]
    for (const pattern of patterns) {
        let match
        while ((match = pattern.exec(html)) !== null) {
            const href = match[1]
            if (!href.startsWith('/assets/') || seen.has(href)) continue
            seen.add(href)
            assets.push(href)
        }
    }
    return assets
}

function sizeOf(file) {
    try {
        return fs.statSync(file).size
    } catch {
        return 0
    }
}

function kb(bytes) {
    return (bytes / 1024).toFixed(1).padStart(9) + ' KB'
}

const args = parseArgs(process.argv.slice(2))
const indexPath = path.join(DIST, 'index.html')

if (!fs.existsSync(indexPath)) {
    console.error('bundle-budget: falta dist/index.html — correr `npm run build:client` primero')
    process.exit(1)
}

const assets = criticalAssets(fs.readFileSync(indexPath, 'utf8'))
if (assets.length === 0) {
    console.error('bundle-budget: no se encontró ningún asset en dist/index.html')
    process.exit(1)
}

let totalRaw = 0
let totalBr = 0
const rows = []

for (const href of assets) {
    const file = path.join(DIST, href.replace(/^\//, ''))
    const raw = sizeOf(file)
    const br = sizeOf(file + '.br')
    totalRaw += raw
    totalBr += br
    rows.push({ href, raw, br })
}

rows.sort((a, b) => b.raw - a.raw)

console.log('')
console.log('Camino crítico — lo que el navegador baja antes del primer render')
console.log('')
for (const row of rows) {
    const name = path.basename(row.href).padEnd(42)
    const brNote = row.br ? kb(row.br) : '        — '
    console.log(`  ${name} ${kb(row.raw)}  br ${brNote}`)
}
console.log('  ' + '-'.repeat(42) + ' ' + '-'.repeat(12) + '  ' + '-'.repeat(15))
console.log(`  ${'TOTAL'.padEnd(42)} ${kb(totalRaw)}  br ${kb(totalBr)}`)
console.log(`  ${''.padEnd(42)} ${String(totalRaw).padStart(12)} B ${String(totalBr).padStart(14)} B`)
console.log('')
console.log(`  ${assets.length} archivos en el camino crítico · techo: ${kb(args.maxRaw)} crudos`)
console.log('')

if (args.report) process.exit(0)

if (totalRaw > args.maxRaw) {
    console.error(
        `bundle-budget: el camino crítico son ${totalRaw} bytes crudos y el techo es ${args.maxRaw}.\n` +
        '  Algo volvió al arranque. Buscar un import estático de un módulo que debería ser diferido:\n' +
        '  VISUALIZE=1 npm run build:client && abrir stats.html'
    )
    process.exit(1)
}

console.log(`  OK — ${totalRaw} bytes crudos, por debajo del techo de ${args.maxRaw}.`)
console.log('')
