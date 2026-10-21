# financeiro-um

Dashboard financeiro institucional da UniMissional, publicado em https://adm.unimissional.org.br.

## Como funciona

- `index.html` é uma página estática, **sem nenhum dado financeiro**.
- Os números ficam no Supabase (tabela `financeiro_dashboard`) e só são entregues após login Microsoft, para e-mails listados em `financeiro_acesso`.
- Toda segunda às 3h um workflow do n8n lê o Excel do SharePoint, consolida e grava o JSON no Supabase (função `financeiro_publicar`). O HTML não é mais regerado por ele.
- Este repositório está conectado ao projeto `financeiro-um` na Vercel: o merge na `main` publica em produção; cada PR gera um preview.

## Como atualizar o dashboard

1. Crie uma branch: `git switch -c minha-mudanca`.
2. Edite o `index.html` (HTML, CSS e JS ficam no mesmo arquivo; as bibliotecas Chart.js e Supabase JS estão embutidas).
3. Abra um PR. Aguarde o preview da Vercel e teste o login e as telas.
4. Faça o merge na `main`. A publicação em produção é automática.

## Regras

- Nunca colocar números reais, tokens ou o segredo de publicação no repositório. A chave `sb_publishable_...` do Supabase é pública por desenho e pode ficar no HTML.
- Dar ou tirar acesso é feito no banco (`financeiro_acesso`), não no código.
- O preview de PR precisa estar nas Redirect URLs do Supabase (`https://financeiro-um-*.vercel.app/**`) para o login funcionar.

Desenvolvido por [André Scultori](https://github.com/andrescultori) · © 2026 · [GitHub](https://github.com/andrescultori/financeiro-um)
