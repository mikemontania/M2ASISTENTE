module.exports = (err, req, res, next) => {
  console.error(err && err.stack ? err.stack : err);
  res.status(500).json({ error: err.message || 'Internal server error' });
};