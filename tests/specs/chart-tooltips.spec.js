import { test, expect } from '@playwright/test';
import { generateDashboardData } from '../fixtures/generate.mjs';
import { loginWithData } from './helpers.mjs';

const FIXTURE = generateDashboardData({ seed: 7 });

async function hoverCenter(page, selector) {
  const locator = page.locator(selector);
  await locator.scrollIntoViewIfNeeded();
  await locator.hover();
  await page.waitForTimeout(150);
  return locator.boundingBox();
}

test.describe('Tooltip e bolinha nas miniaturas (sparklines)', () => {
  test('hover no sparkCredit mostra bolinha + tooltip com o mês e o valor corretos', async ({ page, baseURL }) => {
    await loginWithData(page, baseURL, FIXTURE);
    await page.waitForTimeout(600); // animação de entrada

    await hoverCenter(page, '#sparkCredit');
    const tt = await page.evaluate(() => {
      const chart = charts['sparkCredit'];
      return { opacity: chart.tooltip.opacity, title: chart.tooltip.title, body: chart.tooltip.body };
    });
    expect(tt.opacity).toBeGreaterThan(0);
    expect(tt.title[0]).toMatch(/^[a-zç]{3}\/\d{4}$/); // ex.: "fev/2026"
    expect(tt.body[0].lines[0]).toMatch(/^R\$\s/);

    const hoverRadius = await page.evaluate(() => {
      const chart = charts['sparkCredit'];
      const active = chart.getActiveElements();
      return active.length ? active[0].element.options.radius : null;
    });
    expect(hoverRadius).toBeGreaterThan(0); // pointRadius em repouso é 0
  });

  test('hover no sparkCreditM (mensal) mostra o dia no título do tooltip', async ({ page, baseURL }) => {
    await loginWithData(page, baseURL, FIXTURE);
    await page.locator('.nav-tabs button', { hasText: 'Relatório Mensal' }).click();
    await page.waitForTimeout(600);

    await hoverCenter(page, '#sparkCreditM');
    const title = await page.evaluate(() => charts['sparkCreditM'].tooltip.title[0]);
    expect(title).toMatch(/^dia \d{2}$/);
  });

  test('fora do hover, a bolinha fica em raio 0 (só aparece ao passar o mouse)', async ({ page, baseURL }) => {
    await loginWithData(page, baseURL, FIXTURE);
    await page.waitForTimeout(600);
    const restRadius = await page.evaluate(() => {
      const chart = charts['sparkCredit'];
      const meta = chart.getDatasetMeta(0);
      return meta.data[0].options.radius;
    });
    expect(restRadius).toBe(0);
  });
});

test.describe('Crosshair e bolinha destacada nos gráficos grandes', () => {
  test('comboChart (fluxo mensal): crosshair só depois da animação, some sem hover', async ({ page, baseURL }) => {
    await loginWithData(page, baseURL, FIXTURE);

    // Logo após renderizar, a animação de entrada ainda não terminou.
    const introDoneEarly = await page.evaluate(() => !!charts['comboChart'].$introDone);
    expect(introDoneEarly).toBe(false);

    await page.waitForTimeout(700);
    const introDoneLater = await page.evaluate(() => !!charts['comboChart'].$introDone);
    expect(introDoneLater).toBe(true);

    // Sem hover, nenhum elemento ativo.
    const activeBefore = await page.evaluate(() => charts['comboChart'].getActiveElements().length);
    expect(activeBefore).toBe(0);

    await hoverCenter(page, '#comboChart');
    const afterHover = await page.evaluate(() => {
      const chart = charts['comboChart'];
      const active = chart.getActiveElements();
      const lineEl = active.find(a => a.datasetIndex === 2);
      return {
        activeLen: active.length,
        lineHoverRadius: lineEl ? lineEl.element.options.radius : null,
      };
    });
    expect(afterHover.activeLen).toBeGreaterThan(0);
    expect(afterHover.lineHoverRadius).toBeGreaterThanOrEqual(6); // pointHoverRadius configurado

    // Tirando o mouse do canvas, os elementos ativos somem de novo.
    await page.mouse.move(5, 5);
    await page.waitForTimeout(150);
    const activeAfterLeave = await page.evaluate(() => charts['comboChart'].getActiveElements().length);
    expect(activeAfterLeave).toBe(0);
  });

  test('dailyChart (fluxo diário): crosshair vertical ativo no hover', async ({ page, baseURL }) => {
    await loginWithData(page, baseURL, FIXTURE);
    await page.locator('.nav-tabs button', { hasText: 'Relatório Mensal' }).click();
    await page.waitForTimeout(700);

    await hoverCenter(page, '#dailyChart');
    const active = await page.evaluate(() => charts['dailyChart'].getActiveElements().length);
    expect(active).toBeGreaterThan(0);
  });

  test('barras por categoria (horizontais): guia aparece como linha horizontal no hover de uma barra', async ({ page, baseURL }) => {
    await loginWithData(page, baseURL, FIXTURE);
    await page.locator('#creditBarChart').scrollIntoViewIfNeeded();
    await page.waitForTimeout(700);

    const bar = await page.evaluate(() => {
      const chart = charts['creditBarChart'];
      const meta = chart.getDatasetMeta(0);
      const el = meta.data[0];
      const rect = chart.canvas.getBoundingClientRect();
      return { x: rect.left + el.x - 20, y: rect.top + el.y, isHorizontal: chart.options.indexAxis === 'y' };
    });
    expect(bar.isHorizontal).toBe(true);
    await page.mouse.move(bar.x, bar.y, { steps: 4 });
    await page.waitForTimeout(150);
    const active = await page.evaluate(() => charts['creditBarChart'].getActiveElements().length);
    expect(active).toBeGreaterThan(0);
  });
});

test.describe('Toque (mobile)', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('tocar no sparkline mostra o tooltip; sair esconde', async ({ page, baseURL }) => {
    await loginWithData(page, baseURL, FIXTURE);
    await page.waitForTimeout(600);

    await page.locator('#sparkCredit').scrollIntoViewIfNeeded();
    await page.locator('#sparkCredit').tap();
    await page.waitForTimeout(200);
    const opacityAfterTap = await page.evaluate(() => charts['sparkCredit'].tooltip.opacity);
    expect(opacityAfterTap).toBeGreaterThan(0);
  });

  test('tocar no gráfico mensal mostra o crosshair (elementos ativos)', async ({ page, baseURL }) => {
    await loginWithData(page, baseURL, FIXTURE);
    await page.locator('.nav-tabs button', { hasText: 'Relatório Mensal' }).click();
    await page.waitForTimeout(700);

    await page.locator('#dailyChart').scrollIntoViewIfNeeded();
    await page.locator('#dailyChart').tap();
    await page.waitForTimeout(200);
    const active = await page.evaluate(() => charts['dailyChart'].getActiveElements().length);
    expect(active).toBeGreaterThan(0);
  });
});

test.describe('Sem conflito com os rótulos de valor (valueLabelPlugin) e sem erros de console', () => {
  test('hover nos gráficos grandes e nas miniaturas não gera erro algum', async ({ page, baseURL }) => {
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !m.text().includes('net::ERR')) errors.push(m.text()); });

    await loginWithData(page, baseURL, FIXTURE);
    await page.waitForTimeout(700);
    await hoverCenter(page, '#sparkCredit');
    await hoverCenter(page, '#sparkDebit');
    await hoverCenter(page, '#sparkSaldo');
    await hoverCenter(page, '#comboChart');
    await hoverCenter(page, '#creditBarChart');
    await hoverCenter(page, '#debitBarChart');

    await page.locator('.nav-tabs button', { hasText: 'Relatório Mensal' }).click();
    await page.waitForTimeout(700);
    await hoverCenter(page, '#dailyChart');
    await hoverCenter(page, '#sparkCreditM');
    await hoverCenter(page, '#sparkAcumM');

    expect(errors, errors.join('\n')).toEqual([]);
  });
});
