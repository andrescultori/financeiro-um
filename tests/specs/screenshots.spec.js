import { test } from '@playwright/test';
import { generateDashboardData } from '../fixtures/generate.mjs';
import { loginWithData } from './helpers.mjs';
import { mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'screenshots');
const FIXTURE = generateDashboardData({ seed: 7 });

test.beforeAll(async () => { await mkdir(OUT_DIR, { recursive: true }); });

async function shot(page, project, name) {
  await page.screenshot({ path: join(OUT_DIR, `${name}-${project}.png`), fullPage: true });
}

test('anual e mensal, com e sem filtro de centro de custo', async ({ page, baseURL }, testInfo) => {
  const project = testInfo.project.name;
  await loginWithData(page, baseURL, FIXTURE);

  await shot(page, project, 'anual-sem-filtro');

  await page.locator('.nav-tabs button', { hasText: 'Relatório Mensal' }).click();
  await shot(page, project, 'mensal-sem-filtro');

  await page.getByRole('button', { name: 'Filtrar por centro de custo' }).click();
  await page.locator('.cc-filter-item', { hasText: FIXTURE.cost_centers[0] }).locator('input').check();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => activeCostCenters.size === 1);
  await shot(page, project, 'mensal-com-filtro');

  await page.locator('.nav-tabs button', { hasText: 'Visão Anual' }).click();
  await shot(page, project, 'anual-com-filtro');
});
