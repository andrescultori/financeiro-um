import { test, expect } from '@playwright/test';
import { generateDashboardData } from '../fixtures/generate.mjs';
import { loginWithData } from './helpers.mjs';

const FIXTURE = generateDashboardData({ seed: 7 });

test.describe('Data de atualização (Tarefa C)', () => {
  test('mostra "Dados atualizados em dd/mm/aaaa às hh:mm" em pt-BR, fuso America/Sao_Paulo', async ({ page, baseURL }) => {
    // 2026-08-29T03:05:00-03:00 (horário de Brasília) == 06:05 UTC.
    await loginWithData(page, baseURL, FIXTURE, '2026-08-29T06:05:00Z');
    await expect(page.locator('#updatedNote')).toHaveText('Dados atualizados em 29/08/2026 às 03:05');
  });

  test('não mostra nada quando atualizado_em não existe', async ({ page, baseURL }) => {
    await loginWithData(page, baseURL, FIXTURE, null);
    await expect(page.locator('#updatedNote')).toHaveText('');
  });
});

test.describe('Sem erros de console', () => {
  test('navegação básica (anual, mensal, filtros) não gera erros', async ({ page, baseURL }) => {
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !m.text().includes('net::ERR')) errors.push(m.text()); });

    await loginWithData(page, baseURL, FIXTURE);
    await page.locator('.nav-tabs button', { hasText: 'Relatório Mensal' }).click();
    await page.locator('.nav-tabs button', { hasText: 'Visão Anual' }).click();

    await page.getByRole('button', { name: 'Filtrar por centro de custo' }).click();
    await page.locator('#ccFilterAll').click();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => activeCostCenters.size > 0);

    await page.locator('#ccChipClear').click();

    expect(errors, errors.join('\n')).toEqual([]);
  });
});
