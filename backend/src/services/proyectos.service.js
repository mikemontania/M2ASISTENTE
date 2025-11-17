const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const PROJECTS_BASE = process.env.PROJECTS_BASE || path.resolve(__dirname, '../../projects');

if (!fs.existsSync(PROJECTS_BASE)) fs.mkdirSync(PROJECTS_BASE, { recursive: true });

const createProject = async ({ nombre }) => {
  const id = uuidv4();
  const projectPath = path.join(PROJECTS_BASE, id);
  fs.mkdirSync(projectPath);
  // create a meta file
  fs.writeFileSync(path.join(projectPath, 'meta.json'), JSON.stringify({ id, nombre, createdAt: new Date().toISOString() }, null, 2));
  return { id, nombre, rutaBase: projectPath };
};

const listProjects = async () => {
  const folders = fs.readdirSync(PROJECTS_BASE, { withFileTypes: true }).filter(d => d.isDirectory());
  return folders.map(f => ({ id: f.name, rutaBase: path.join(PROJECTS_BASE, f.name) }));
};

const deleteProject = async (id) => {
  const target = path.join(PROJECTS_BASE, id);
  if (!fs.existsSync(target)) throw new Error('Project not found');
  // dangerous operation; remove recursively
  fs.rmSync(target, { recursive: true, force: true });
  return true;
};

module.exports = { createProject, listProjects, deleteProject, PROJECTS_BASE };