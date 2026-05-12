const {alpacaTradingFetch, cors, errorResponse, handleOptions} = require('./_utils');

module.exports = async function handler(req, res) {
  cors(res, 15);
  if (handleOptions(req, res)) return;

  try {
    const clock = await alpacaTradingFetch('/v2/clock');
    res.status(200).json({
      ok: true,
      source: 'alpaca',
      updatedAt: new Date().toISOString(),
      isOpen: !!clock.is_open,
      timestamp: clock.timestamp,
      nextOpen: clock.next_open,
      nextClose: clock.next_close,
    });
  } catch (error) {
    errorResponse(res, error);
  }
};
