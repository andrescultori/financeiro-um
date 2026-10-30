// Gera dados financeiros 100% fictícios para os testes (Playwright).
// Nunca usar dados reais aqui. Determinístico (seed fixa) para testes reprodutíveis.

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round2(v) { return Math.round(v * 100) / 100; }
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function ym(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1); }
function fmtDate(d) { return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear(); }

const COST_CENTERS = ['Administração', 'Educação', 'Saúde Comunitária', 'Comunicação', 'Infraestrutura', '(Sem centro de custo)'];
const CATEGORIES_CREDIT = ['Doações', 'Mensalidades', 'Receitas Financeiras'];
const CATEGORIES_DEBIT = ['Aluguel', 'Salários', 'Serviços', 'Material de Escritório'];

const OPENING_BALANCE = 5000;

/**
 * Gera o objeto `dados` (schema_version 2) que o dashboard espera, com
 * lançamentos fictícios entre `start` e `end` (inclusive).
 * @param {{seed?: number, start?: Date, end?: Date}} opts
 */
export function generateDashboardData(opts = {}) {
  const seed = opts.seed ?? 42;
  const rnd = mulberry32(seed);
  const start = opts.start ?? new Date(2025, 0, 1);
  const end = opts.end ?? new Date();

  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  const rawRows = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const n = Math.floor(rnd() * 3); // 0-2 lançamentos por dia
    for (let i = 0; i < n; i++) {
      const isCredit = rnd() < 0.45;
      const cc = rnd() < 0.08 ? '(Sem centro de custo)' : pick(COST_CENTERS.slice(0, -1));
      const cat = isCredit ? pick(CATEGORIES_CREDIT) : pick(CATEGORIES_DEBIT);
      const amount = round2(50 + rnd() * 2000);
      rawRows.push({
        date: new Date(d),
        credit: isCredit ? amount : 0,
        debit: isCredit ? 0 : -amount,
        cat, cc
      });
    }
  }
  rawRows.sort((a, b) => a.date - b.date);

  const years = Array.from(new Set(rawRows.map(r => r.date.getFullYear()))).sort();

  const monthly = {};
  rawRows.forEach(r => {
    const k = ym(r.date);
    if (!monthly[k]) monthly[k] = { credit: 0, debit: 0 };
    monthly[k].credit += r.credit;
    monthly[k].debit += r.debit;
  });
  const allMonths = Object.keys(monthly).sort();
  let cum = OPENING_BALANCE;
  const monthStartCum = {};
  allMonths.forEach(k => {
    monthStartCum[k] = round2(cum);
    const net = monthly[k].credit + monthly[k].debit;
    cum = round2(cum + net);
    monthly[k] = { credit: round2(monthly[k].credit), debit: round2(monthly[k].debit), net: round2(net), cum };
  });

  const daily = {};
  rawRows.forEach(r => {
    const k = ymd(r.date);
    if (!daily[k]) daily[k] = { credit: 0, debit: 0 };
    daily[k].credit += r.credit;
    daily[k].debit += r.debit;
  });
  Object.keys(daily).forEach(k => {
    daily[k].credit = round2(daily[k].credit);
    daily[k].debit = round2(daily[k].debit);
    daily[k].net = round2(daily[k].credit + daily[k].debit);
  });

  function addCat(bucket, key, cat, r) {
    if (!bucket[key]) bucket[key] = {};
    if (!bucket[key][cat]) bucket[key][cat] = { credit: 0, debit: 0 };
    bucket[key][cat].credit += r.credit;
    bucket[key][cat].debit += r.debit;
  }
  const catYear = {}, catMonth = {}, catDay = {};
  rawRows.forEach(r => {
    addCat(catYear, String(r.date.getFullYear()), r.cat, r);
    addCat(catMonth, ym(r.date), r.cat, r);
    addCat(catDay, ymd(r.date), r.cat, r);
  });
  [catYear, catMonth, catDay].forEach(bucket => {
    Object.keys(bucket).forEach(key => {
      Object.keys(bucket[key]).forEach(cat => {
        bucket[key][cat].credit = round2(bucket[key][cat].credit);
        bucket[key][cat].debit = round2(bucket[key][cat].debit);
      });
    });
  });

  const ccVolume = {};
  const rows = rawRows.map(r => {
    ccVolume[r.cc] = (ccVolume[r.cc] || 0) + r.credit + Math.abs(r.debit);
    return [ymd(r.date), r.cc, r.cat, round2(r.credit), round2(r.debit)];
  });
  const cost_centers = Object.keys(ccVolume).sort((a, b) => ccVolume[b] - ccVolume[a]);

  return {
    schema_version: 2,
    opening_balance: OPENING_BALANCE,
    cost_centers,
    rows,
    years,
    period: { min: fmtDate(rawRows[0].date), max: fmtDate(rawRows[rawRows.length - 1].date) },
    monthly,
    month_start_cum: monthStartCum,
    daily,
    category_by_year: catYear,
    category_by_month: catMonth,
    category_by_day: catDay
  };
}

/** Mesmos dados, mas sem `rows`/`cost_centers` — simula um schema antigo. */
export function generateLegacyDashboardData(opts = {}) {
  const d = generateDashboardData(opts);
  const { rows, cost_centers, schema_version, opening_balance, ...legacy } = d;
  return legacy;
}
