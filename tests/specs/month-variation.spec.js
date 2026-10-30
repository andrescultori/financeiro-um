import { test, expect } from '@playwright/test';
import { generateDashboardData } from '../fixtures/generate.mjs';
import { loginWithData } from './helpers.mjs';

// Fixture controlada (números exatos escolhidos à mão) para verificar a
// matemática da variação vs. mês anterior com precisão. O mês corrente real
// (2026-10, no momento em que isto foi escrito) fica incompleto de propósito,
// para testar a nota "mês em andamento".
function buildVariationFixture() {
  const monthly = {
    '2026-06': { credit: 300, debit: 0, net: 300, cum: 300 },      // primeiro mês — sem anterior
    '2026-07': { credit: 800, debit: -200, net: 600, cum: 900 },    // débito anterior = 0 → variação de débito oculta
    '2026-08': { credit: 1000, debit: -400, net: 600, cum: 1500 },
    '2026-09': { credit: 1200, debit: -500, net: 700, cum: 2200 },
    '2026-10': { credit: 500, debit: -700, net: -200, cum: 2000 },  // saldo muda de sinal vs. set (700 → -200)
  };
  const month_start_cum = { '2026-06': 0, '2026-07': 300, '2026-08': 900, '2026-09': 1500, '2026-10': 2200 };
  const daily = {};
  Object.entries(monthly).forEach(([m, v]) => {
    daily[m + '-15'] = { credit: v.credit, debit: v.debit, net: v.net };
  });
  return {
    schema_version: 2,
    years: [2026],
    period: { min: '01/06/2026', max: '29/10/2026' },
    monthly, month_start_cum, daily,
    category_by_year: {}, category_by_month: {}, category_by_day: {},
  };
}

const FIXTURE = buildVariationFixture();

async function goToMonth(page, label) {
  // #monthSelect só fica visível/interagível na aba "Relatório Mensal".
  await page.locator('.nav-tabs button', { hasText: 'Relatório Mensal' }).click();
  await page.locator('#monthSelect').selectOption({ label });
}

test.describe('Variação vs. mês anterior', () => {
  test('créditos: alta é boa (verde) e mostra o percentual correto', async ({ page, baseURL }) => {
    await loginWithData(page, baseURL, FIXTURE);
    await goToMonth(page, 'Agosto/2026'); // 1000 vs 800 (jul) = +25,0%
    const el = page.locator('#kpiCreditVarM span').first();
    await expect(el).toHaveClass('kpi-var-pos');
    await expect(el).toHaveText('▲ 25,0% vs. julho');
  });

  test('débitos: alta (mais gasto) é ruim (vermelho), compara valor absoluto', async ({ page, baseURL }) => {
    await loginWithData(page, baseURL, FIXTURE);
    await goToMonth(page, 'Setembro/2026'); // débito abs 500 vs 400 (ago) = +25,0%, pior
    const el = page.locator('#kpiDebitVarM span').first();
    await expect(el).toHaveClass('kpi-var-neg');
    await expect(el).toHaveText('▲ 25,0% vs. agosto');
  });

  test('débitos: queda no gasto é boa (verde)', async ({ page, baseURL }) => {
    await loginWithData(page, baseURL, FIXTURE);
    await goToMonth(page, 'Julho/2026'); // débito anterior (junho) é zero -> variação de débito deve ficar oculta
    await expect(page.locator('#kpiDebitVarM')).toBeEmpty();
  });

  test('sem mês anterior (primeiro mês): nenhuma variação aparece', async ({ page, baseURL }) => {
    await loginWithData(page, baseURL, FIXTURE);
    await goToMonth(page, 'Junho/2026');
    await expect(page.locator('#kpiCreditVarM')).toBeEmpty();
    await expect(page.locator('#kpiDebitVarM')).toBeEmpty();
    await expect(page.locator('#kpiSaldoVarM')).toBeEmpty();
  });

  test('saldo: mudança de sinal mostra diferença em R$, não percentual', async ({ page, baseURL }) => {
    await loginWithData(page, baseURL, FIXTURE);
    await goToMonth(page, 'Outubro/2026'); // saldo set=700, out=-200 (sinal muda) -> |diff| = 900
    const el = page.locator('#kpiSaldoVarM span').first();
    await expect(el).toHaveClass('kpi-var-neg'); // piorou
    await expect(el).toContainText('R$');
    await expect(el).not.toContainText('%');
    await expect(el).toContainText('vs. setembro');
  });

  test('nota "mês em andamento" aparece só no mês corrente', async ({ page, baseURL }) => {
    await loginWithData(page, baseURL, FIXTURE);
    await goToMonth(page, 'Setembro/2026');
    await expect(page.locator('#kpiCreditVarM')).not.toContainText('mês em andamento');

    await goToMonth(page, 'Outubro/2026'); // mês corrente no momento da fixture
    await expect(page.locator('#kpiCreditVarM')).toContainText('mês em andamento');
    await expect(page.locator('#kpiDebitVarM')).toContainText('mês em andamento');
    await expect(page.locator('#kpiSaldoVarM')).toContainText('mês em andamento');
  });

  test('a comparação respeita o filtro de centro de custo ativo', async ({ page, baseURL }) => {
    const data = generateDashboardData({ seed: 21 });
    await loginWithData(page, baseURL, data);

    const months = Object.keys(data.monthly).sort();
    // Escolhe um mês com mês anterior na lista, para ter variação a comparar.
    const midMonth = months[Math.floor(months.length / 2)];
    const prevMonth = months[months.indexOf(midMonth) - 1];
    const [y, m] = midMonth.split('-');
    const label = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date(Number(y), Number(m) - 1, 1));
    const capitalized = label.charAt(0).toUpperCase() + label.slice(1);
    await page.locator('.nav-tabs button', { hasText: 'Relatório Mensal' }).click();
    await page.locator('#monthSelect').selectOption({ label: `${capitalized}/${y}` });

    const targetCc = data.cost_centers[0];
    await page.getByRole('button', { name: 'Filtrar por centro de custo' }).click();
    await page.locator('.cc-filter-item', { hasText: targetCc }).locator('input').check();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => activeCostCenters.size === 1);

    // Valor esperado calculado direto a partir de `rows`, independente do app.
    const expectedCreditCur = data.rows
      .filter(r => r[0].startsWith(midMonth) && r[1] === targetCc)
      .reduce((s, r) => s + r[3], 0);
    const expectedCreditPrev = data.rows
      .filter(r => r[0].startsWith(prevMonth) && r[1] === targetCc)
      .reduce((s, r) => s + r[3], 0);

    const actualCreditCur = await page.evaluate(() => monthValues(currentMonthKey).credit);
    expect(actualCreditCur).toBeCloseTo(expectedCreditCur, 1);

    if (expectedCreditPrev > 0) {
      const expectedPct = Math.abs((expectedCreditCur - expectedCreditPrev) / expectedCreditPrev * 100);
      const varText = await page.locator('#kpiCreditVarM').textContent();
      const match = varText.match(/([\d.,]+)%/);
      expect(match, `esperava percentual no texto, veio "${varText}"`).not.toBeNull();
      const shownPct = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
      expect(shownPct).toBeCloseTo(expectedPct, 0);
    }
  });
});
