const fs = require('fs');
const path = require('path');
const validarRutas = require('../middlewares/validarRutas');

const listFiles = async (projectBase) => {
  if (!fs.existsSync(projectBase)) return [];
  const walk = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let results = [];
    entries.forEach(e => {
      const full = path.join(dir, e.name);
      const relative = path.relative(projectBase, full);
      if (e.isDirectory()) {
        results = results.concat(walk(full));
      } else {
        results.push({ name: e.name, path: relative });
      }
    });
    return results;
  };
  return walk(projectBase);
};

const readFile = async (projectBase, filePath) => {
  const safe = validarRutas.safeJoin(projectBase, filePath);
  return fs.readFileSync(safe, 'utf8');
};

const createFile = async (projectBase, filePath, content) => {
  const safe = validarRutas.safeJoin(projectBase, filePath);
  const dir = path.dirname(safe);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(safe, content, 'utf8');
  return true;
};

const editFile = async (projectBase, filePath, content) => {
  const safe = validarRutas.safeJoin(projectBase, filePath);
  if (!fs.existsSync(safe)) throw new Error('File not found');
  fs.writeFileSync(safe, content, 'utf8');
  return true;
};

const deleteFile = async (projectBase, filePath) => {
  const safe = validarRutas.safeJoin(projectBase, filePath);
  if (!fs.existsSync(safe)) throw new Error('File not found');
  fs.unlinkSync(safe);
  return true;
};

module.exports = { listFiles, readFile, createFile, editFile, deleteFile };