const {cors, errorResponse, handleOptions, symbolsFromQuery} = require('./_utils');

async function yahooNews(symbol) {
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&newsCount=4&quotesCount=0`;
  const response = await fetch(url, {headers: {'User-Agent': 'Mozilla/5.0'}});
  if (!response.ok) return [];
  const data = await response.json();
  return (data.news || []).map(item => ({
    uuid: item.uuid,
    title: item.title,
    publisher: item.publisher,
    link: item.link,
    time: item.providerPublishTime,
    ticker: symbol,
  }));
}

module.exports = async function handler(req, res) {
  cors(res, 300);
  if (handleOptions(req, res)) return;

  const symbols = symbolsFromQuery(req.query.symbols).slice(0, 8);
  if (!symbols.length) return res.status(400).json({ok: false, error: 'symbols query parameter is required'});

  try {
    const seen = new Set();
    const items = [];
    const results = await Promise.all(symbols.map(yahooNews));
    results.flat().forEach(item => {
      if (!item.uuid || seen.has(item.uuid)) return;
      seen.add(item.uuid);
      items.push(item);
    });
    items.sort((a, b) => b.time - a.time);
    res.status(200).json({
      ok: true,
      source: 'yahoo-server',
      updatedAt: new Date().toISOString(),
      items,
    });
  } catch (error) {
    errorResponse(res, error);
  }
};
