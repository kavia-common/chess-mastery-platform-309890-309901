// PUBLIC_INTERFACE
function computeEloDelta(ratingA, ratingB, scoreA, k = 32) {
  /**
   * Computes ELO delta for player A.
   * scoreA: 1 win, 0.5 draw, 0 loss
   */
  const expectedA = 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
  return Math.round(k * (scoreA - expectedA));
}

module.exports = { computeEloDelta };
