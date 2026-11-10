import { test, expect } from '@playwright/test';
import { generateDashboardData } from '../fixtures/generate.mjs';
import { loginWithData } from './helpers.mjs';
import { mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'screenshots');

// Datas fixas (não "até hoje") para o período padrão ("último trimestre
// completo") e as comparações vs. ano anterior serem sempre os mesmos,
// não importa quando a suíte rodar de verdade. O relógio da página também
// é travado (page.clock), pelo mesmo motivo do month-variation.spec.js.
const FIXTURE = generateDashboardData({
  seed: 11,
  start: new Date(2025, 0, 1),
  end: new Date(2026, 9, 31), // 31/out/2026
});
const CLOCK_NOW = '2026-11-05T12:00:00Z'; // dentro do 4º tri/2026, com o 3º completo e disponível

test.beforeAll(async () => { await mkdir(OUT_DIR, { recursive: true }); });

async function loginForReport(page, baseURL, data = FIXTURE) {
  await page.clock.install({ time: new Date(CLOCK_NOW) });
  await loginWithData(page, baseURL, data);
}

function sumRows(rows, { start, end, cc } = {}) {
  let credit = 0, debit = 0;
  rows.forEach(r => {
    if (start && r[0] < start) return;
    if (end && r[0] > end) return;
    if (cc && r[1] !== cc) return;
    credit += r[3]; debit += r[4];
  });
  return { credit: Math.round(credit * 100) / 100, debit: Math.round(debit * 100) / 100 };
}

function parseBRL(text) {
  const t = text.trim();
  const neg = t.includes('-');
  const digits = t.replace(/[^\d,]/g, '').replace(',', '.');
  const v = parseFloat(digits || '0');
  return neg ? -v : v;
}

// fmtBRL/fmtBRLsigned mostram sem casas decimais; a tolerância de 1 real
// cobre a diferença de arredondamento entre Math.round (usado para montar
// o valor esperado aqui no teste) e toLocaleString (usado pelo app) em
// valores terminados em ",50" exatos.
function expectMoney(shownText, expectedValue){
  expect(Math.abs(parseBRL(shownText) - expectedValue)).toBeLessThanOrEqual(1);
}

test.describe('Exportar PDF — botão e diálogo', () => {
  test('botão existe e abre o diálogo com o trimestre completo mais recente pré-selecionado', async ({ page, baseURL }) => {
    await loginForReport(page, baseURL);
    await expect(page.locator('#exportPdfBtn')).toBeVisible();
    await page.locator('#exportPdfBtn').click();
    await expect(page.locator('#exportPdfDialog')).toBeVisible();
    await expect(page.locator('.export-period-type-btn.active')).toHaveText('Trimestre');
    await expect(page.locator('#exportQuarterYearSelect')).toHaveValue('2026');
    await expect(page.locator('#exportQuarterSelect')).toHaveValue('3');
  });

  test('Esc fecha o diálogo; foco inicial fica no tipo de período ativo', async ({ page, baseURL }) => {
    await loginForReport(page, baseURL);
    await page.locator('#exportPdfBtn').click();
    const focused = await page.evaluate(() => document.activeElement.className);
    expect(focused).toContain('export-period-type-btn');
    await page.keyboard.press('Escape');
    await expect(page.locator('#exportPdfDialog')).toBeHidden();
  });

  test('período sem dados mostra mensagem e não gera o relatório (diálogo continua aberto)', async ({ page, baseURL }) => {
    await loginForReport(page, baseURL);
    await page.locator('#exportPdfBtn').click();
    await page.locator('.export-period-type-btn[data-type=custom]').click();
    await page.locator('#exportCustomStart').fill('2030-01-01');
    await page.locator('#exportCustomEnd').fill('2030-01-31');
    await page.locator('#exportPdfGenerate').click();
    await expect(page.locator('#exportPdfEmptyMsg')).toBeVisible();
    await expect(page.locator('#exportPdfDialog')).toBeVisible();
    const reportLen = await page.evaluate(() => document.getElementById('reportRoot').innerHTML.length);
    expect(reportLen).toBe(0);
  });

  test('centro de custo com um único filtro ativo no dashboard é o padrão do diálogo', async ({ page, baseURL }) => {
    await loginForReport(page, baseURL);
    await page.getByRole('button', { name: 'Filtrar por centro de custo' }).click();
    const targetCc = FIXTURE.cost_centers[0];
    await page.locator('.cc-filter-item', { hasText: targetCc }).locator('input').check();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => activeCostCenters.size === 1);

    await page.locator('#exportPdfBtn').click();
    await expect(page.locator('#exportCcSelect')).toHaveValue(targetCc);
  });
});

test.describe('Exportar PDF — conteúdo bate com os dados (teste automatizado)', () => {
  test('trimestre: KPIs e tabela-resumo batem com a soma direta de rows', async ({ page, baseURL }) => {
    await loginForReport(page, baseURL);
    await page.locator('#exportPdfBtn').click();
    await page.locator('#exportPdfGenerate').click(); // padrão = 3º tri/2026
    await page.waitForTimeout(150);

    const expected = sumRows(FIXTURE.rows, { start: '2026-07-01', end: '2026-09-30' });
    const shown = await page.evaluate(() => ({
      title: document.getElementById('rpTitle').textContent,
      subtitle: document.getElementById('rpSubtitle').textContent,
      credit: document.getElementById('rpKpiCredit').textContent,
      debit: document.getElementById('rpKpiDebit').textContent,
      rowCount: document.getElementById('rpTableBody').children.length,
      tableFooterCredit: document.querySelector('#rpSummaryTable tfoot td.rp-credit').textContent,
    }));
    expect(shown.title).toBe('Relatório Financeiro Trimestral');
    expect(shown.subtitle).toContain('3º trimestre de 2026');
    expect(shown.subtitle).toContain('Todos os centros de custo');
    expectMoney(shown.credit, expected.credit);
    expectMoney(shown.debit, expected.debit);
    expect(shown.rowCount).toBe(3); // jul/ago/set, mesmo que algum mês não tenha lançamento
    // a linha "Trimestre" da tabela tem que fechar com o mesmo total do KPI
    expectMoney(shown.tableFooterCredit, expected.credit);
  });

  test('mês: granularidade diária/semanal e soma batendo', async ({ page, baseURL }) => {
    await loginForReport(page, baseURL);
    await page.locator('#exportPdfBtn').click();
    await page.locator('.export-period-type-btn[data-type=month]').click();
    await page.locator('#exportMonthSelect').selectOption('2026-10');
    await page.locator('#exportPdfGenerate').click();
    await page.waitForTimeout(150);

    const expected = sumRows(FIXTURE.rows, { start: '2026-10-01', end: '2026-10-31' });
    const shown = await page.evaluate(() => ({
      title: document.getElementById('rpTitle').textContent,
      credit: document.getElementById('rpKpiCredit').textContent,
      debit: document.getElementById('rpKpiDebit').textContent,
      firstRowLabel: document.getElementById('rpTableBody').children[0].children[0].textContent,
    }));
    expect(shown.title).toBe('Relatório Financeiro Mensal');
    expectMoney(shown.credit, expected.credit);
    expectMoney(shown.debit, expected.debit);
    expect(shown.firstRowLabel).toMatch(/^Semana 1/);
  });

  test('ano: 12 meses na tabela, somando ao total do ano', async ({ page, baseURL }) => {
    await loginForReport(page, baseURL);
    await page.locator('#exportPdfBtn').click();
    await page.locator('.export-period-type-btn[data-type=year]').click();
    await page.locator('#exportYearSelect').selectOption('2025');
    await page.locator('#exportPdfGenerate').click();
    await page.waitForTimeout(150);

    const expected = sumRows(FIXTURE.rows, { start: '2025-01-01', end: '2025-12-31' });
    const shown = await page.evaluate(() => ({
      title: document.getElementById('rpTitle').textContent,
      credit: document.getElementById('rpKpiCredit').textContent,
      rowCount: document.getElementById('rpTableBody').children.length,
    }));
    expect(shown.title).toBe('Relatório Financeiro Anual');
    expect(shown.rowCount).toBe(12);
    expectMoney(shown.credit, expected.credit);
  });

  test('personalizado: período arbitrário soma certo e aparece no subtítulo', async ({ page, baseURL }) => {
    await loginForReport(page, baseURL);
    await page.locator('#exportPdfBtn').click();
    await page.locator('.export-period-type-btn[data-type=custom]').click();
    await page.locator('#exportCustomStart').fill('2026-02-10');
    await page.locator('#exportCustomEnd').fill('2026-05-20');
    await page.locator('#exportPdfGenerate').click();
    await page.waitForTimeout(150);

    const expected = sumRows(FIXTURE.rows, { start: '2026-02-10', end: '2026-05-20' });
    const shown = await page.evaluate(() => ({
      title: document.getElementById('rpTitle').textContent,
      subtitle: document.getElementById('rpSubtitle').textContent,
      credit: document.getElementById('rpKpiCredit').textContent,
    }));
    expect(shown.title).toBe('Relatório Financeiro Personalizado');
    expect(shown.subtitle).toContain('10/02/2026 a 20/05/2026');
    expectMoney(shown.credit, expected.credit);
  });

  test('centro de custo filtrado: soma restrita ao centro e tabela "por centro de custo" é omitida', async ({ page, baseURL }) => {
    await loginForReport(page, baseURL);
    const targetCc = FIXTURE.cost_centers[1];
    await page.locator('#exportPdfBtn').click();
    await page.locator('#exportCcSelect').selectOption(targetCc);
    await page.locator('#exportPdfGenerate').click();
    await page.waitForTimeout(150);

    const expected = sumRows(FIXTURE.rows, { start: '2026-07-01', end: '2026-09-30', cc: targetCc });
    const shown = await page.evaluate(() => ({
      subtitle: document.getElementById('rpSubtitle').textContent,
      credit: document.getElementById('rpKpiCredit').textContent,
      hasCcTable: !!document.getElementById('rpCcTable'),
    }));
    expect(shown.subtitle).toContain(targetCc);
    expectMoney(shown.credit, expected.credit);
    expect(shown.hasCcTable).toBe(false);
  });
});

test.describe('Exportar PDF — layout em A4 (page.pdf)', () => {
  for (const [type, select] of [
    ['trimestre', async (page) => { await page.locator('.export-period-type-btn[data-type=quarter]').click(); }],
    ['mes', async (page) => { await page.locator('.export-period-type-btn[data-type=month]').click(); await page.locator('#exportMonthSelect').selectOption('2026-10'); }],
    ['ano', async (page) => { await page.locator('.export-period-type-btn[data-type=year]').click(); await page.locator('#exportYearSelect').selectOption('2026'); }],
    ['personalizado', async (page) => {
      await page.locator('.export-period-type-btn[data-type=custom]').click();
      await page.locator('#exportCustomStart').fill('2026-01-01');
      await page.locator('#exportCustomEnd').fill('2026-06-30');
    }],
  ]) {
    test(`gera PDF A4 (2 páginas, sem corte) para período "${type}"`, async ({ page, baseURL }, testInfo) => {
      // O PDF/relatório é tamanho A4 fixo, independente do viewport do
      // navegador — roda só no projeto desktop pra não duplicar os
      // mesmos arquivos (PDF/PNG) nos dois projetos.
      test.skip(testInfo.project.name !== 'desktop', 'conteúdo do relatório não depende do viewport');
      const errors = [];
      page.on('pageerror', e => errors.push('pageerror: ' + e.message));
      page.on('console', m => { if (m.type() === 'error' && !m.text().includes('net::ERR')) errors.push(m.text()); });

      await loginForReport(page, baseURL);
      await page.locator('#exportPdfBtn').click();
      await select(page);
      await page.locator('#exportPdfGenerate').click();
      await page.waitForTimeout(150);

      // page.pdf() exige modo headless (já é o caso na config) e já renderiza
      // com as regras @media print — é o artefato pedido no item (a).
      await page.pdf({
        path: join(OUT_DIR, `export-pdf-${type}-${testInfo.project.name}.pdf`),
        format: 'A4', printBackground: true,
      });

      // Captura rasterizada (PNG) do mesmo estado, pra revisão visual no PR.
      await page.emulateMedia({ media: 'print' });
      const pageEls = page.locator('.report-page');
      await expect(pageEls).toHaveCount(2);
      // Sem conteúdo cortado: cada página não deve crescer além de uma folha
      // A4 (297mm ≈ 1122.5px a 96dpi) — senão o conteúdo vaza pra uma
      // terceira página física em vez de ficar nas 2 esperadas.
      const heights = await pageEls.evaluateAll(els => els.map(el => el.scrollHeight));
      heights.forEach(h => expect(h).toBeLessThanOrEqual(1130));

      await page.screenshot({ path: join(OUT_DIR, `export-pdf-${type}-${testInfo.project.name}.png`), fullPage: true });

      expect(errors, errors.join('\n')).toEqual([]);
    });
  }
});

test.describe('Exportar PDF — sem erros de console', () => {
  test('todo o fluxo (abrir, trocar tipo, gerar, imprimir) não gera erro algum', async ({ page, baseURL }) => {
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !m.text().includes('net::ERR')) errors.push(m.text()); });

    await loginForReport(page, baseURL);
    await page.locator('#exportPdfBtn').click();
    for (const type of ['month', 'quarter', 'year', 'custom']) {
      await page.locator('.export-period-type-btn[data-type=' + type + ']').click();
    }
    await page.locator('.export-period-type-btn[data-type=quarter]').click();
    await page.locator('#exportPdfCancel').click();
    await page.locator('#exportPdfBtn').click();
    await page.locator('#exportPdfGenerate').click();
    await page.waitForTimeout(200);

    expect(errors, errors.join('\n')).toEqual([]);
  });
});
