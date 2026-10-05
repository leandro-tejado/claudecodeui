#!/usr/bin/env node
// Prueba mínima de que Chromium headless arranca y saca capturas.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { CHROMIUM, RAIZ_TMP } from './lib/config.mjs';

fs.mkdirSync(RAIZ_TMP, { recursive: true });
const navegador = await chromium.launch({ executablePath: CHROMIUM });
const pagina = await navegador.newPage();
await pagina.goto('about:blank');
await pagina.setContent('<h1 style="font:600 40px system-ui">humo e2e</h1>');
const destino = path.join(RAIZ_TMP, 'humo.png');
await pagina.screenshot({ path: destino });
await navegador.close();
const { size } = fs.statSync(destino);
console.log(`ok ${destino} (${size} bytes)`);
