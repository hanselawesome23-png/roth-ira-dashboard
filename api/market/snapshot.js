const {alpacaFetch, cors, errorResponse, feed, handleOptions, num, pick, symbolsFromQuery} = require('./_utils');

function normalizeSnapshot(symbol, snapshot) {
  const latestTrade = snapshot.latestTrade || snapshot.latest_trade || {};
  const latestQuote = snapshot.latestQuote || snapshot.latest_quote || {};
  const minuteBar = snapshot.minuteBar || snapshot.minute_bar || {};
  const dailyBar = snapshot.dailyBar || snapshot.daily_bar || {};
  const previousDailyBar = snapshot.prevDailyBar || snapshot.previousDailyBar || snapshot.previous_daily_bar || {};
  const price = num(pick(latestTrade, ['p', 'price'])) ?? num(pick(minuteBar, ['c', 'close'])) ?? num(pick(dailyBar, ['c', 'close']));
  const previousClose = num(pick(previousDailyBar, ['c', 'close']));
  const changePercent = price != null && previousClose ? ((price - previousClose) / previousClose) * 100 : null;

  return {
    symbol,
    price,
    changePercent: changePercent == null ? null : +changePercent.toFixed(2),
    bid: num(pick(latestQuote, ['bp', 'bid_price'])),
    ask: num(pick(latestQuote, ['ap', 'ask_price'])),
    latestTradeTime: pick(latestTrade, ['t', 'timestamp']),
    volume: num(pick(dailyBar, ['v', 'volume'])),
    open: num(pick(dailyBar, ['o', 'open'])),
    high: num(pick(dailyBar, ['h', 'high'])),
    low: num(pick(dailyBar, ['l', 'low'])),
    close: num(pick(dailyBar, ['c', 'close'])),
    previousClose,
  };
}

module.exports = async function handler(req, res) {
  cors(res, 10);
  if (handleOptions(req, res)) return;

  const symbols = symbolsFromQuery(req.query.symbols);
  if (!symbols.length) return res.status(400).json({ok: false, error: 'symbols query parameter is required'});

  try {
    const data = await alpacaFetch('/v2/stocks/snapshots', {
      symbols: symbols.join(','),
      feed: req.query.feed || feed(),
      currency: 'USD',
    });
    const snapshots = data.snapshots || data;
    const normalized = {};
    symbols.forEach(symbol => {
      if (snapshots?.[symbol]) normalized[symbol] = normalizeSnapshot(symbol, snapshots[symbol]);
    });
    res.status(200).json({
      ok: true,
      source: 'alpaca',
      feed: req.query.feed || feed(),
      updatedAt: new Date().toISOString(),
      symbols: normalized,
    });
  } catch (error) {
    errorResponse(res, error);
  }
};
