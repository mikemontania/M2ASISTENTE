const path = require('path');
const fs = require('fs');

// Utility to safely join and prevent path traversal
const safeJoin = (base, target) => {
  const resolved = path.resolve(base, target || '.');
  if (!resolved.startsWith(path.resolve(base))) {
    throw new Error('Invalid path');
  }
  return resolved;
};

module.exports = { safeJoin };