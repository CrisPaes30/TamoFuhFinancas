// scripts/qa-login.mjs
//
// Abre uma janela REAL do Chromium (não headless) apontando pro dev server
// local. O humano faz login com Google manualmente nessa janela. Assim que
// a tela sair do "Entrar com Google" (RequireAuth resolveu "ready"), salva
// o storageState (cookies + localStorage, incluindo a sessão do Firebase
// Auth) em playwright/.auth/user.json, pra reuso em testes automatizados
// sem precisar logar de novo toda hora.

import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const APP_URL = process.env.APP_URL || "http://localhost:5173";
const OUT_DIR = path.resolve("playwright/.auth");
const OUT_FILE = path.join(OUT_DIR, "user.json");
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos pra logar

mkdirSync(OUT_DIR, { recursive: true });

console.log(`\n>> Abrindo ${APP_URL} numa janela do Chromium...`);
console.log(">> Faça login com sua conta Google normalmente nessa janela.");
console.log(`>> Você tem até ${TIMEOUT_MS / 60000} minutos.\n`);

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();

await page.goto(APP_URL);

try {
  await page.waitForSelector(
    "text=/Adicionar despesa|Comece criando seu casal|Entrar em um casal/i",
    { timeout: TIMEOUT_MS }
  );
  console.log(">> Login detectado! Salvando sessão...");
  await context.storageState({ path: OUT_FILE });
  console.log(`>> Sessão salva em: ${OUT_FILE}`);
} catch (e) {
  console.error(">> Tempo esgotado ou erro esperando o login:", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
