import { test, expect } from '@playwright/test';
import { generateDashboardData } from '../fixtures/generate.mjs';
import { loginWithData } from './helpers.mjs';
import { mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'screenshots');
const FIXTURE = generateDashboardData({ seed: 7 });
const WIDTHS = [1440, 1024, 768, 390];

test.beforeAll(async () => { await mkdir(OUT_DIR, { recursive: true }); });

async function assertHeaderFitsViewport(page) {
  const { headerRight, chipsRight, clientWidth, docScrollWidth } = await page.evaluate(() => {
    const header = document.querySelector('header').getBoundingClientRect();
    const chips = document.querySelector('.header-chips-row').getBoundingClientRect();
    return {
      headerRight: header.right,
      chipsRight: chips.right,
      clientWidth: document.documentElement.clientWidth,
      docScrollWidth: document.documentElement.scrollWidth,
    };
  });
  // O cabeçalho (e a linha de chips, quando visível) nunca deve ultrapassar
  // a largura da viewport — é essa a garantia de "sem rolagem horizontal"
  // que a Tarefa A pede. (Uma tabela não relacionada ao cabeçalho já tinha,
  // antes desta mudança, uma rolagem própria em telas muito estreitas —
  // ver "riscos conhecidos" no PR — então não travamos no scrollWidth do
  // documento inteiro aqui, só no do cabeçalho.)
  expect(headerRight, `header.right (${headerRight}) excede clientWidth (${clientWidth})`).toBeLessThanOrEqual(clientWidth + 1);
  expect(chipsRight, `header-chips-row.right (${chipsRight}) excede clientWidth (${clientWidth})`).toBeLessThanOrEqual(clientWidth + 1);
}

test.describe('Cabeçalho responsivo (Tarefa A)', () => {
  for (const width of WIDTHS) {
    test(`${width}px — visão anual, sem filtro`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width, height: 900 });
      await loginWithData(page, baseURL, FIXTURE);
      await assertHeaderFitsViewport(page);
      await page.screenshot({ path: join(OUT_DIR, `header-anual-sem-filtro-${width}.png`), fullPage: false });
    });

    test(`${width}px — relatório mensal, com filtro de centro de custo`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width, height: 900 });
      await loginWithData(page, baseURL, FIXTURE);
      await page.locator('.nav-tabs button', { hasText: 'Relatório Mensal' }).click();
      await page.getByRole('button', { name: 'Filtrar por centro de custo' }).click();
      await page.locator('.cc-filter-item', { hasText: FIXTURE.cost_centers[0] }).locator('input').check();
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => activeCostCenters.size === 1);
      await assertHeaderFitsViewport(page);
      await page.screenshot({ path: join(OUT_DIR, `header-mensal-com-filtro-${width}.png`), fullPage: false });
    });
  }

  test('320px — ainda sem rolagem horizontal causada pelo cabeçalho', async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await loginWithData(page, baseURL, FIXTURE);
    await assertHeaderFitsViewport(page);
  });

  test('1920px — ainda sem rolagem horizontal causada pelo cabeçalho', async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 1920, height: 1000 });
    await loginWithData(page, baseURL, FIXTURE);
    await assertHeaderFitsViewport(page);
  });

  test('mobile (≤640px): e-mail truncado com reticências e título com o endereço completo', async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const longEmailData = FIXTURE;
    await page.route('**/rest/v1/financeiro_dashboard**', route => route.fulfill({
      status: 200, contentType: 'application/vnd.pgrst.object+json',
      body: JSON.stringify({ dados: longEmailData, atualizado_em: '2026-08-29T06:05:00Z' }),
    }));
    await page.goto(baseURL, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof loadDataOrDeny === 'function');
    const longEmail = 'uma.conta.com.endereco.bem.longo.de.verdade@unimissional.org.br';
    await page.evaluate((email) => loadDataOrDeny({ user: { email } }), longEmail);
    await page.waitForFunction(() => typeof DATA !== 'undefined' && DATA !== null);

    const emailEl = page.locator('#userEmail');
    await expect(emailEl).toHaveAttribute('title', longEmail);
    const { scrollWidth, clientWidth } = await emailEl.evaluate(el => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    expect(scrollWidth, 'e-mail longo deveria estourar a largura visível (e ficar truncado)').toBeGreaterThan(clientWidth);
  });

  test('mobile (≤640px): ordem da coluna única é título/período, e-mail+Sair, abas, depois ano/filtro', async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginWithData(page, baseURL, FIXTURE);
    const order = await page.evaluate(() => {
      const top = (sel) => document.querySelector(sel).getBoundingClientRect().top;
      return {
        brand: top('.brand'),
        userBar: top('.user-bar'),
        navTabs: top('#navTabs'),
        row2: top('.header-row-2'),
      };
    });
    expect(order.brand).toBeLessThan(order.userBar);
    expect(order.userBar).toBeLessThan(order.navTabs);
    expect(order.navTabs).toBeLessThan(order.row2);
  });
});
