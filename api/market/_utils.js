const ALPACA_BASE = 'https://data.alpaca.markets';
const ALPACA_TRADING_BASE = 'https://paper-api.alpaca.markets';

function cors(res, maxAge = 15) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', `s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 4}`);
}

function handleOptions(req, res) {
  if (req.method === 'OPTIONS') {
    cors(res);
    res.status(204).end();
    return true;
  }
  return false;
}

function alpacaHeaders() {
  const key = process.env.ALPACA_API_KEY || process.env.APCA_API_KEY_ID;
  const secret = process.env.ALPACA_SECRET_KEY || process.env.APCA_API_SECRET_KEY;
  if (!key || !secret) {
    const err = new Error('Alpaca API credentials are not configured.');
    err.statusCode = 503;
    throw err;
  }
  return {
    'APCA-API-KEY-ID': key,
    'APCA-API-SECRET-KEY': secret,
  };
}

function feed() {
  return process.env.ALPACA_DATA_FEED || 'iex';
}

function symbolsFromQuery(value) {
  return String(value || '')
    .split(',')
    .map(s => s.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, ''))
    .filter(Boolean)
    .slice(0, 30);
}

async function alpacaFetch(path, params = {}) {
  const url = new URL(path, ALPACA_BASE);
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== '') url.searchParams.set(key, value);
  });
  const response = await fetch(url, {headers: alpacaHeaders()});
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) {
    const err = new Error(data?.message || data?.error || `Alpaca request failed (${response.status})`);
    err.statusCode = response.status;
    err.details = data;
    throw err;
  }
  return data;
}

async function alpacaTradingFetch(path, params = {}) {
  const url = new URL(path, process.env.ALPACA_TRADING_BASE_URL || ALPACA_TRADING_BASE);
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== '') url.searchParams.set(key, value);
  });
  const response = await fetch(url, {headers: alpacaHeaders()});
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) {
    const err = new Error(data?.message || data?.error || `Alpaca request failed (${response.status})`);
    err.statusCode = response.status;
    err.details = data;
    throw err;
  }
  return data;
}

function errorResponse(res, error) {
  const status = error.statusCode || 500;
  res.status(status).json({
    ok: false,
    dataUnavailable: true,
    error: error.message || 'Data unavailable',
  });
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pick(object, keys) {
  for (const key of keys) {
    if (object && object[key] != null) return object[key];
  }
  return null;
}

module.exports = {
  alpacaFetch,
  alpacaTradingFetch,
  cors,
  errorResponse,
  feed,
  handleOptions,
  num,
  pick,
  symbolsFromQuery,
};
