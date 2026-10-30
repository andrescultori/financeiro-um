import { test, expect } from '@playwright/test';
import { generateDashboardData, generateLegacyDashboardData } from '../fixtures/generate.mjs';
import { loginWithData, readState } from './helpers.mjs';

const FIXTURE = generateDashboardData({ seed: 7 });

function monthlyCreditDebit(monthly) {
  const out = {};
  Object.keys(monthly).forEach(m => { out[m] = { credit: monthly[m].credit, debit: monthly[m].debit }; });
  return out;
}

async function selectCostCenters(page, names) {
  await page.getByRole('button', { name: 'Filtrar por centro de custo' }).click();
  // Garante estado limpo antes de marcar os pedidos.
  await page.locator('#ccFilterNone').click();
  for (const name of names) {
    await page.locator('.cc-filter-item', { hasText: name }).locator('input[type=checkbox]').check();
  }
  await page.keyboard.press('Escape');
}

test.describe('Filtro de centro de custo', () => {
  test('ponto 1 — "todos selecionados" reproduz os totais mensais/diários/por categoria do objeto original', async ({ page, baseURL }) => {
    await loginWithData(page, baseURL, FIXTURE);
    const before = await readState(page);

    await selectCostCenters(page, FIXTURE.cost_centers);
    await page.waitForFunction(() => activeCostCenters.size > 0);
    const after = await readState(page);

    // Créditos/débitos por mês devem bater exatamente (o acumulado não —
    // com filtro de centro de custo ativo, mesmo cobrindo todos os centros,
    // o saldo recomeça do zero por definição da Tarefa A, ponto 4).
    expect(monthlyCreditDebit(after.monthly)).toEqual(monthlyCreditDebit(before.monthly));

    for (const day of Object.keys(before.daily)) {
      expect(after.daily[day].credit).toBeCloseTo(before.daily[day].credit, 2);
      expect(after.daily[day].debit).toBeCloseTo(before.daily[day].debit, 2);
    }
    expect(after.categoryByYear).toEqual(before.categoryByYear);
  });

  test('ponto 1b — sem filtro nenhum (nenhum centro selecionado) é idêntico ao objeto original', async ({ page, baseURL }) => {
    await loginWithData(page, baseURL, FIXTURE);
    const state = await readState(page);
    expect(state.activeCostCenters).toEqual([]);
    expect(state.monthly).toEqual(FIXTURE.monthly); // inclui o cum, aqui sim deve bater (sem filtro = objeto original)
  });

  test('ponto 2 — soma dos centros isolados reproduz o total geral', async ({ page, baseURL }) => {
    await loginWithData(page, baseURL, FIXTURE);

    let sumCredit = 0, sumDebit = 0;
    for (const cc of FIXTURE.cost_centers) {
      await selectCostCenters(page, [cc]);
      await page.waitForFunction(() => activeCostCenters.size === 1);
      const state = await readState(page);
      const totals = Object.values(state.monthly).reduce(
        (acc, m) => ({ credit: acc.credit + m.credit, debit: acc.debit + m.debit }),
        { credit: 0, debit: 0 }
      );
      sumCredit += totals.credit;
      sumDebit += totals.debit;
    }

    const overall = Object.values(FIXTURE.monthly).reduce(
      (acc, m) => ({ credit: acc.credit + m.credit, debit: acc.debit + m.debit }),
      { credit: 0, debit: 0 }
    );
    expect(sumCredit).toBeCloseTo(overall.credit, 1);
    expect(sumDebit).toBeCloseTo(overall.debit, 1);
  });

  test('ponto 3 — com um centro ativo, KPIs/gráficos/tabela mudam e os rótulos viram "Total acumulado"', async ({ page, baseURL }) => {
    await loginWithData(page, baseURL, FIXTURE);
    const before = await readState(page);
    expect(before.kpiSaldoLabel).toBe('Saldo acumulado');

    const oneCenter = FIXTURE.cost_centers[0];
    await selectCostCenters(page, [oneCenter]);
    await page.waitForFunction(() => activeCostCenters.size === 1);

    const after = await readState(page);
    expect(after.kpiSaldoLabel).toBe('Total acumulado');
    expect(after.kpiCredit).not.toBe(before.kpiCredit);

    // o chip de centro de custo deve aparecer com o nome do centro
    await expect(page.locator('#ccChip')).toBeVisible();
    await expect(page.locator('#ccChipLabel')).toHaveText('Centro: ' + oneCenter);

    // a tabela mensal também deve trocar o cabeçalho "Saldo" -> "Total"
    await expect(page.locator('#monthTableSaldoHead')).toHaveText('Total');

    // limpar pelo chip restaura o estado original
    await page.locator('#ccChipClear').click();
    await page.waitForFunction(() => activeCostCenters.size === 0);
    await expect(page.locator('#ccChip')).toBeHidden();
    await expect(page.locator('#kpiSaldoLabel')).toHaveText('Saldo acumulado');
  });

  test('mensagem de "sem lançamentos" aparece quando o filtro esvazia o ano', async ({ page, baseURL }) => {
    // Fixture controlada: "Centro B" existe na lista de centros (aparece em
    // algum outro ano/relatório), mas não tem nenhum lançamento em 2026.
    const data = {
      schema_version: 2,
      years: [2026],
      period: { min: '10/01/2026', max: '10/02/2026' },
      monthly: {
        '2026-01': { credit: 500, debit: -200, net: 300, cum: 300 },
        '2026-02': { credit: 400, debit: -100, net: 300, cum: 600 },
      },
      month_start_cum: { '2026-01': 0, '2026-02': 300 },
      daily: {
        '2026-01-10': { credit: 500, debit: -200, net: 300 },
        '2026-02-10': { credit: 400, debit: -100, net: 300 },
      },
      category_by_year: { '2026': { Doações: { credit: 900, debit: 0 }, Aluguel: { credit: 0, debit: -300 } } },
      category_by_month: {
        '2026-01': { Doações: { credit: 500, debit: 0 }, Aluguel: { credit: 0, debit: -200 } },
        '2026-02': { Doações: { credit: 400, debit: 0 }, Aluguel: { credit: 0, debit: -100 } },
      },
      category_by_day: {},
      cost_centers: ['Centro A', 'Centro B'],
      rows: [
        ['2026-01-10', 'Centro A', 'Doações', 500, 0],
        ['2026-01-10', 'Centro A', 'Aluguel', 0, -200],
        ['2026-02-10', 'Centro A', 'Doações', 400, 0],
        ['2026-02-10', 'Centro A', 'Aluguel', 0, -100],
      ],
    };
    await loginWithData(page, baseURL, data);

    await selectCostCenters(page, ['Centro B']);
    await page.waitForFunction(() => activeCostCenters.size === 1);

    await expect(page.locator('#annualCharts')).toBeHidden();
    await expect(page.locator('#emptyFilterNoticeAnnual')).toBeVisible();
    await expect(page.locator('#emptyFilterNoticeAnnual')).toContainText('Nenhum lançamento');
    // KPIs continuam visíveis (com zero), só os gráficos/tabela saem de cena.
    await expect(page.locator('#kpiCredit')).toHaveText('R$ 0');

    // No relatório mensal, o mesmo deve valer.
    await page.locator('.nav-tabs button', { hasText: 'Relatório Mensal' }).click();
    await expect(page.locator('#monthlyCharts')).toBeHidden();
    await expect(page.locator('#emptyFilterNoticeMonthly')).toBeVisible();

    // Limpando o filtro, tudo volta a aparecer.
    await page.locator('#ccChipClear').click();
    await page.waitForFunction(() => activeCostCenters.size === 0);
    await expect(page.locator('#monthlyCharts')).toBeVisible();
    await expect(page.locator('#emptyFilterNoticeMonthly')).toBeHidden();
  });

  test('ponto 6 — sem DATA.rows, o dashboard funciona e o filtro fica oculto', async ({ page, baseURL }) => {
    const legacy = generateLegacyDashboardData({ seed: 7 });
    await loginWithData(page, baseURL, legacy);

    await expect(page.locator('#ccFilter')).toBeHidden();
    await expect(page.locator('#kpiCredit')).not.toHaveText('—');

    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.locator('.year-toggle button').first().click();
    await page.waitForTimeout(300);
    expect(errors).toEqual([]);
  });

  test('UI: abre/fecha com teclado e clique fora, aria-expanded correto', async ({ page, baseURL }) => {
    await loginWithData(page, baseURL, FIXTURE);
    const btn = page.locator('#ccFilterBtn');
    await expect(btn).toHaveAttribute('aria-expanded', 'false');

    await btn.click();
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#ccFilterPanel')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#ccFilterPanel')).toBeHidden();

    await btn.click();
    // Clica na marca (canto oposto do header) — longe o bastante para nunca
    // ficar coberta pelo próprio painel, que é alinhado à direita.
    await page.locator('.brand h1').click({ force: true });
    await expect(page.locator('#ccFilterPanel')).toBeHidden();
  });

  test('UI: busca filtra a lista de centros de custo', async ({ page, baseURL }) => {
    await loginWithData(page, baseURL, FIXTURE);
    await page.locator('#ccFilterBtn').click();
    const target = FIXTURE.cost_centers[0];
    await page.locator('#ccFilterSearch').fill(target.slice(0, 3));
    const visibleItems = page.locator('.cc-filter-item:not(.cc-hidden)');
    const count = await visibleItems.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(visibleItems.nth(i)).toContainText(new RegExp(target.slice(0, 3), 'i'));
    }
  });
});
