const {alpacaFetch, cors, errorResponse, feed, handleOptions, num, symbolsFromQuery} = require('./_utils');

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

module.exports = async function handler(req, res) {
  cors(res, 3600);
  if (handleOptions(req, res)) return;

  const symbols = symbolsFromQuery(req.query.symbols);
  if (!symbols.length) return res.status(400).json({ok: false, error: 'symbols query parameter is required'});

  try {
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
    });
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

    const priceData = await alpacaFetch('/v2/stocks/snapshots', {
      symbols: symbols.join(','),
      feed: req.query.feed || feed(),
      currency: 'USD',
    });
    const snapshots = priceData.snapshots || {};
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
      const snap = snapshots[symbol] || {};
      const latestTrade = snap.latestTrade || {};
      const minuteBar = snap.minuteBar || {};
      const price = num(latestTrade.p) ?? num(minuteBar.c);
      result[symbol] = {
        paysDividend: !!annualAmount,
        amount: annualAmount ? +annualAmount.toFixed(4) : null,
        frequency,
        yield: annualAmount && price ? +((annualAmount / price) * 100).toFixed(2) : null,
        exDate: formatDate(latest?.exDate),
        payDate: formatDate(latest?.payDate),
      };
    });

    res.status(200).json({
      ok: true,
      source: 'alpaca',
      updatedAt: new Date().toISOString(),
      symbols: result,
    });
  } catch (error) {
    errorResponse(res, error);
  }
};
