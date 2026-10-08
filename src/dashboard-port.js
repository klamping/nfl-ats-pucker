function parseDashboardPort(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value) || Number(value) > 65535) {
    throw new Error('Dashboard port must be an integer from 0 to 65535');
  }
  return Number(value);
}

module.exports = { parseDashboardPort };
