// Helpers compartilhados pelos testes: "login" simulado (sem rede real ao
// Supabase) e leitura do estado interno da página (DATA/BASE_DATA).
//
// Este app (financeiro-um) só checa `sb.auth.getSession()` uma vez em
// initAuth() — não há onAuthStateChange nem fluxo de hash de OAuth a
// simular. Em vez de reproduzir todo o round-trip PKCE da Microsoft, os
// testes chamam `loadDataOrDeny(session)` diretamente (função global do
// script clássico do app), o que já cobre o caminho de carregar os dados e
// chamar unlockApp()/boot() — exatamente o que os testes de Tarefas A/B/C
// precisam exercitar.

export async function loginWithData(page, baseURL, data, updatedAt = '2026-08-29T06:05:00Z') {
  await page.route('**/rest/v1/financeiro_dashboard**', route => route.fulfill({
    status: 200,
    contentType: 'application/vnd.pgrst.object+json',
    body: JSON.stringify({ dados: data, atualizado_em: updatedAt }),
  }));

  await page.goto(baseURL, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof loadDataOrDeny === 'function');
  await page.evaluate(() => loadDataOrDeny({ user: { email: 'teste@unimissional.org.br' } }));
  await page.waitForFunction(() => typeof DATA !== 'undefined' && DATA !== null, { timeout: 15000 });
}

/** Lê o estado interno relevante da página (DATA/BASE_DATA atuais). */
export async function readState(page) {
  return page.evaluate(() => ({
    monthly: DATA.monthly,
    daily: DATA.daily,
    categoryByYear: DATA.category_by_year,
    activeCostCenters: [...activeCostCenters],
    kpiCredit: document.getElementById('kpiCredit').textContent,
    kpiDebit: document.getElementById('kpiDebit').textContent,
    kpiSaldo: document.getElementById('kpiSaldo').textContent,
    kpiSaldoLabel: document.getElementById('kpiSaldoLabel').textContent,
  }));
}

export function sumMonthly(monthly) {
  return Object.values(monthly).reduce(
    (acc, m) => ({ credit: acc.credit + m.credit, debit: acc.debit + m.debit }),
    { credit: 0, debit: 0 }
  );
}
