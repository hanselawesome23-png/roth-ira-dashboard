const ALPACA_BASE = 'https://data.alpaca.markets';
const ALPACA_TRADING_BASE = 'https://paper-api.alpaca.markets';

function json(body, status = 200, maxAge = 15) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,OPTIONS',
      'access-control-allow-headers': 'Content-Type',
      'cache-control': `s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 4}`,
    },
  });
}

function symbolsFromQuery(value) {
  return String(value || '')
    .split(',')
    .map(s => s.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, ''))
    .filter(Boolean)
    .slice(0, 30);
}

function feed(env) {
  return env.ALPACA_DATA_FEED || 'iex';
}

async function alpacaFetch(path, params, env) {
  const key = env.ALPACA_API_KEY || env.APCA_API_KEY_ID;
  const secret = env.ALPACA_SECRET_KEY || env.APCA_API_SECRET_KEY;
  if (!key || !secret) {
    throw new Error('Alpaca API credentials are not configured.');
  }
  const url = new URL(path, ALPACA_BASE);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value != null && value !== '') url.searchParams.set(key, value);
  });
  const response = await fetch(url, {
    headers: {
      'APCA-API-KEY-ID': key,
      'APCA-API-SECRET-KEY': secret,
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || `Alpaca request failed (${response.status})`);
  return data;
}

async function alpacaTradingFetch(path, params, env) {
  const key = env.ALPACA_API_KEY || env.APCA_API_KEY_ID;
  const secret = env.ALPACA_SECRET_KEY || env.APCA_API_SECRET_KEY;
  if (!key || !secret) {
    throw new Error('Alpaca API credentials are not configured.');
  }
  const url = new URL(path, env.ALPACA_TRADING_BASE_URL || ALPACA_TRADING_BASE);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value != null && value !== '') url.searchParams.set(key, value);
  });
  const response = await fetch(url, {
    headers: {
      'APCA-API-KEY-ID': key,
      'APCA-API-SECRET-KEY': secret,
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || `Alpaca request failed (${response.status})`);
  return data;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeSnapshot(symbol, snapshot) {
  const latestTrade = snapshot.latestTrade || {};
  const latestQuote = snapshot.latestQuote || {};
  const minuteBar = snapshot.minuteBar || {};
  const dailyBar = snapshot.dailyBar || {};
  const previousDailyBar = snapshot.prevDailyBar || snapshot.previousDailyBar || {};
  const price = num(latestTrade.p) ?? num(minuteBar.c) ?? num(dailyBar.c);
  const previousClose = num(previousDailyBar.c);
  const changePercent = price != null && previousClose ? ((price - previousClose) / previousClose) * 100 : null;
  return {
    symbol,
    price,
    changePercent: changePercent == null ? null : +changePercent.toFixed(2),
    bid: num(latestQuote.bp),
    ask: num(latestQuote.ap),
    latestTradeTime: latestTrade.t,
    volume: num(dailyBar.v),
    open: num(dailyBar.o),
    high: num(dailyBar.h),
    low: num(dailyBar.l),
    close: num(dailyBar.c),
    previousClose,
  };
}

function yearsAgo(years) {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - years);
  date.setUTCDate(date.getUTCDate() - 10);
  return date.toISOString();
}

function annualizedReturn(bars, years) {
  if (!bars.length) return null;
  const last = bars[bars.length - 1];
  const target = new Date(last.t);
  target.setUTCFullYear(target.getUTCFullYear() - years);
  const nearest = bars
    .map(bar => ({bar, distance: Math.abs(new Date(bar.t) - target)}))
    .sort((a, b) => a.distance - b.distance)[0];
  if (!nearest || nearest.distance > 75 * 24 * 60 * 60 * 1000) return null;
  const base = nearest.bar;
  const lastClose = num(last.c);
  const baseClose = num(base?.c);
  if (!lastClose || !baseClose) return null;
  const total = (lastClose - baseClose) / baseClose;
  return years === 1 ? +(total * 100).toFixed(1) : +((Math.pow(1 + total, 1 / years) - 1) * 100).toFixed(1);
}

async function snapshot(url, env) {
  const symbols = symbolsFromQuery(url.searchParams.get('symbols'));
  const data = await alpacaFetch('/v2/stocks/snapshots', {symbols: symbols.join(','), feed: feed(env), currency: 'USD'}, env);
  const normalized = {};
  symbols.forEach(symbol => {
    if (data.snapshots?.[symbol]) normalized[symbol] = normalizeSnapshot(symbol, data.snapshots[symbol]);
  });
  return json({ok: true, source: 'alpaca-cloudflare', feed: feed(env), updatedAt: new Date().toISOString(), symbols: normalized}, 200, 10);
}

async function history(url, env) {
  const symbol = symbolsFromQuery(url.searchParams.get('symbol'))[0];
  const data = await alpacaFetch('/v2/stocks/bars', {
    symbols: symbol,
    timeframe: '1Month',
    start: yearsAgo(10),
    end: new Date().toISOString(),
    adjustment: 'all',
    feed: feed(env),
    limit: 10000,
  }, env);
  const bars = data.bars?.[symbol] || [];
  return json({ok: true, source: 'alpaca-cloudflare', symbol, updatedAt: new Date().toISOString(), barsCount: bars.length, returns: {
    r1: annualizedReturn(bars, 1),
    r3: annualizedReturn(bars, 3),
    r5: annualizedReturn(bars, 5),
    r10: annualizedReturn(bars, 10),
  }}, 200, 3600);
}

async function status(env) {
  const clock = await alpacaTradingFetch('/v2/clock', {}, env);
  return json({ok: true, source: 'alpaca-cloudflare', updatedAt: new Date().toISOString(), isOpen: !!clock.is_open, timestamp: clock.timestamp, nextOpen: clock.next_open, nextClose: clock.next_close}, 200, 15);
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : null;
}

function inferFrequency(payments) {
  const recent = payments.filter(p => {
    const date = toDate(p.exDate || p.payDate);
    return date && Date.now() - date.getTime() <= 370 * 24 * 60 * 60 * 1000;
  });
  if (recent.length >= 10) return 'Monthly';
  if (recent.length >= 3) return 'Quarterly';
  if (recent.length === 2) return 'Semi-annual';
  if (recent.length === 1) return 'Annual';
  return payments.length ? 'Irregular' : null;
}

async function dividends(url, env) {
  const symbols = symbolsFromQuery(url.searchParams.get('symbols'));
  const start = new Date();
  start.setUTCFullYear(start.getUTCFullYear() - 2);
  const end = new Date();
  end.setUTCFullYear(end.getUTCFullYear() + 1);
  const actions = await alpacaFetch('/v1/corporate-actions/announcements', {
    symbols: symbols.join(','),
    ca_types: 'cash_dividend',
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    sort: 'desc',
    limit: 1000,
  }, env);
  const rows = Array.isArray(actions) ? actions : actions.announcements || actions.corporate_actions || [];
  const bySymbol = Object.fromEntries(symbols.map(symbol => [symbol, []]));
  rows.forEach(row => {
    const symbol = String(row.symbol || row.initiating_symbol || '').toUpperCase();
    if (!bySymbol[symbol]) return;
    bySymbol[symbol].push({
      amount: num(row.cash || row.rate || row.dividend_rate || row.amount),
      exDate: row.ex_date || row.exDate,
      payDate: row.payable_date || row.payableDate || row.payment_date,
    });
  });
  const priceData = await alpacaFetch('/v2/stocks/snapshots', {symbols: symbols.join(','), feed: feed(env), currency: 'USD'}, env);
  const result = {};
  symbols.forEach(symbol => {
    const payments = bySymbol[symbol].filter(p => p.amount != null).sort((a, b) => {
      return (toDate(b.exDate || b.payDate)?.getTime() || 0) - (toDate(a.exDate || a.payDate)?.getTime() || 0);
    });
    const recentAnnual = payments.reduce((sum, p) => {
      const date = toDate(p.exDate || p.payDate);
      return date && Date.now() - date.getTime() <= 370 * 24 * 60 * 60 * 1000 ? sum + p.amount : sum;
    }, 0);
    const latest = payments[0];
    const frequency = inferFrequency(payments);
    const annualAmount = recentAnnual || (latest?.amount && frequency === 'Monthly' ? latest.amount * 12 : latest?.amount && frequency === 'Semi-annual' ? latest.amount * 2 : latest?.amount && frequency ? latest.amount * 4 : null);
    const snap = priceData.snapshots?.[symbol] || {};
    const price = num(snap.latestTrade?.p) ?? num(snap.minuteBar?.c);
    result[symbol] = {
      paysDividend: !!annualAmount,
      amount: annualAmount ? +annualAmount.toFixed(4) : null,
      frequency,
      yield: annualAmount && price ? +((annualAmount / price) * 100).toFixed(2) : null,
      exDate: formatDate(latest?.exDate),
      payDate: formatDate(latest?.payDate),
    };
  });
  return json({ok: true, source: 'alpaca-cloudflare', updatedAt: new Date().toISOString(), symbols: result}, 200, 3600);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return json({}, 204);
    const url = new URL(request.url);
    try {
      if (url.pathname.endsWith('/snapshot')) return snapshot(url, env);
      if (url.pathname.endsWith('/history')) return history(url, env);
      if (url.pathname.endsWith('/dividends')) return dividends(url, env);
      if (url.pathname.endsWith('/status')) return status(env);
      return json({ok: false, error: 'Unknown market route'}, 404);
    } catch (error) {
      return json({ok: false, dataUnavailable: true, error: error.message || 'Data unavailable'}, 503);
    }
  },
};
