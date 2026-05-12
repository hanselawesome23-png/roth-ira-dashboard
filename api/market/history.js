const {alpacaFetch, cors, errorResponse, feed, handleOptions, num} = require('./_utils');

function yearsAgo(years) {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - years);
  date.setUTCDate(date.getUTCDate() - 10);
  return date.toISOString();
}

function annualizedReturn(bars, years) {
  if (!bars.length) return null;
  const last = bars[bars.length - 1];
  const target = new Date(last.t || last.timestamp);
  target.setUTCFullYear(target.getUTCFullYear() - years);
  const candidates = bars
    .map(bar => ({bar, distance: Math.abs(new Date(bar.t || bar.timestamp) - target)}))
    .sort((a, b) => a.distance - b.distance);
  const base = candidates[0]?.bar;
  if (!base || candidates[0].distance > 75 * 24 * 60 * 60 * 1000) return null;
  const lastClose = num(last.c ?? last.close);
  const baseClose = num(base?.c ?? base?.close);
  if (!lastClose || !baseClose) return null;
  const total = (lastClose - baseClose) / baseClose;
  if (years === 1) return +(total * 100).toFixed(1);
  return +((Math.pow(1 + total, 1 / years) - 1) * 100).toFixed(1);
}

module.exports = async function handler(req, res) {
  cors(res, 3600);
  if (handleOptions(req, res)) return;

  const symbol = String(req.query.symbol || '').trim().toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  if (!symbol) return res.status(400).json({ok: false, error: 'symbol query parameter is required'});

  try {
    const data = await alpacaFetch('/v2/stocks/bars', {
      symbols: symbol,
      timeframe: '1Month',
      start: yearsAgo(10),
      end: new Date().toISOString(),
      adjustment: 'all',
      feed: req.query.feed || feed(),
      limit: 10000,
    });
    const bars = data.bars?.[symbol] || [];
    res.status(200).json({
      ok: true,
      source: 'alpaca',
      symbol,
      updatedAt: new Date().toISOString(),
      barsCount: bars.length,
      returns: {
        r1: annualizedReturn(bars, 1),
        r3: annualizedReturn(bars, 3),
        r5: annualizedReturn(bars, 5),
        r10: annualizedReturn(bars, 10),
      },
    });
  } catch (error) {
    errorResponse(res, error);
  }
};
