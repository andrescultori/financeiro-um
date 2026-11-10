# Testes do dashboard

Testes end-to-end (Playwright + Chromium) do `index.html`, com dados **100% fictícios** — nunca dados reais. O app roda localmente via um servidor estático simples; a resposta da tabela `financeiro_dashboard` é simulada e a sessão de login é injetada chamando `loadDataOrDeny()` diretamente (nenhuma chamada sai para o Supabase de verdade — nem para o REST, que é mockado, nem para o Auth, que nunca chega a ser consultado nesse caminho).

## Rodando

```bash
cd tests
npm install
npx playwright test
```

Por padrão os testes usam o Chromium baixado pelo Playwright. Se estiver usando um Chromium já instalado em outro caminho (como neste ambiente de desenvolvimento), aponte via variável de ambiente:

```bash
CHROMIUM_PATH=/caminho/para/chrome npx playwright test
```

Para ver só um arquivo: `npx playwright test cost-center-filter`.

## Por que o login é simulado chamando `loadDataOrDeny()` direto

Este app (`financeiro-um`) só verifica `sb.auth.getSession()` uma vez, em `initAuth()` — não há `onAuthStateChange` nem necessidade de reproduzir o round-trip OAuth (PKCE) da Microsoft. A função `loadDataOrDeny(session)` já é exatamente o ponto em que o app, de posse de uma sessão válida, busca a linha `financeiro_dashboard` e chama `unlockApp()` → `boot()`. Os testes mockam apenas o endpoint REST dessa tabela e chamam essa função global diretamente via `page.evaluate()`, o que cobre fielmente tudo que importa para testar as Tarefas A/B/C sem depender de simular tokens, hash de URL ou o fluxo PKCE completo.

## Estrutura

| Arquivo | O que cobre |
|---|---|
| `fixtures/generate.mjs` | Gera dados fictícios (`schema_version: 2`, 2 anos, 5 centros de custo + "(Sem centro de custo)", algumas categorias), determinístico via seed |
| `specs/helpers.mjs` | Login simulado (chamada direta a `loadDataOrDeny`) e leitura do estado interno da página |
| `specs/cost-center-filter.spec.js` | Filtro de centro de custo: totais batendo com/sem filtro, soma dos centros isolados = total, rótulos "Total acumulado", mensagem de filtro vazio, compatibilidade sem `DATA.rows`, acessibilidade (teclado, aria-expanded, clique fora), busca |
| `specs/month-variation.spec.js` | Variação vs. mês anterior: créditos/débitos/saldo, cores e setas, mudança de sinal (R$ em vez de %), sem mês anterior, valor anterior zero, nota "mês em andamento", respeito aos filtros ativos |
| `specs/general.spec.js` | Data de atualização (`DATA_UPDATED_AT`) formatada em pt-BR/America-São_Paulo, e ausência de erros no console durante a navegação básica |
| `specs/screenshots.spec.js` | Gera os screenshots em `screenshots/` (desktop 1440px e mobile 390px, anual e mensal, com e sem filtro) |
| `specs/header-responsive.spec.js` | Cabeçalho (Tarefa A): nenhuma rolagem horizontal causada por ele em 1440/1024/768/390/320/1920px, com e sem filtro, nas duas páginas; e-mail truncado com `title` no celular; ordem da coluna única em ≤640px |
| `specs/chart-tooltips.spec.js` | Tooltip/bolinha nas miniaturas (mês ou dia certo, valor em R$, raio 0 em repouso), crosshair + bolinha destacada nos gráficos grandes (só depois da animação de entrada, some ao tirar o mouse), toque (mobile, `hasTouch`) nas miniaturas e nos gráficos, e ausência de erros de console durante os hovers |

## Cabeçalho e tooltips (Tarefa A/B)

`header-responsive.spec.js` testa a garantia de "sem rolagem horizontal" checando que `header.getBoundingClientRect().right` (e o mesmo para a linha de chips) nunca ultrapassa a largura da viewport — e não o `scrollWidth` do documento inteiro. Isso é proposital: a tabela do "Fluxo mensal" já tinha, antes desta mudança e sem relação com o cabeçalho, uma rolagem própria em telas muito estreitas (abaixo de ~360px) por causa de `white-space:nowrap` nas células — ver "riscos conhecidos" no PR.

`chart-tooltips.spec.js` lê o estado interno do Chart.js (`charts[canvasId].tooltip`, `.getActiveElements()`, `.$introDone`) via `page.evaluate()`, já que o tooltip e a linha-guia (crosshair) são desenhados no `<canvas>`, não no DOM — não dá para usar `expect(locator).toHaveText(...)` neles.

## Dados fictícios

`fixtures/generate.mjs` gera lançamentos aleatórios (seed fixa, reprodutível) com a mesma forma que o dashboard espera — mas os valores, categorias e centros de custo são todos inventados para o teste. Nenhum teste lê nem referencia dados reais da UniMissional.
