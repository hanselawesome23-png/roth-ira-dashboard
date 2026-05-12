# Real-Time Market Data Setup

This dashboard uses server-side endpoints for financial data so API keys are never exposed in the browser.

## Vercel Environment Variables

Set these on the Vercel project:

- `ALPACA_API_KEY`
- `ALPACA_SECRET_KEY`
- `ALPACA_DATA_FEED` (optional, defaults to `iex`)
- `ALPACA_TRADING_BASE_URL` (optional, defaults to `https://paper-api.alpaca.markets`)

The API also accepts Alpaca's common variable names `APCA_API_KEY_ID` and `APCA_API_SECRET_KEY`.

The dashboard calls these Vercel routes:

- `/api/market/snapshot?symbols=VOO,QQQM,SCHD`
- `/api/market/history?symbol=VOO&range=10y`
- `/api/market/dividends?symbols=VOO,SCHD`
- `/api/market/status`
- `/api/market/news?symbols=VOO,QQQM,SCHD`

## Cloudflare Backup

Deploy `cloudflare/market-worker.js` as a Worker and set the same Alpaca secrets there.

To enable the backup endpoint in the browser, set:

```js
localStorage.setItem('cloudflare_market_api_base', 'https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/api/market');
```

or define this before the dashboard script loads:

```js
window.CLOUDFLARE_MARKET_API_BASE = 'https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/api/market';
```

The frontend uses Vercel first and Cloudflare only if Vercel fails.
