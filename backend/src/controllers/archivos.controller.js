const proyectosService = require('../services/proyectos.service');
const archivosService = require('../services/archivos.service');

const listarArchivos = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const projectBase = `${proyectosService.PROJECTS_BASE}/${projectId}`;
    const files = await archivosService.listFiles(projectBase);
    res.json(files);
  } catch (e) { next(e); }
};

const leerArchivo = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { ruta } = req.query;
    const projectBase = `${proyectosService.PROJECTS_BASE}/${projectId}`;
    const content = await archivosService.readFile(projectBase, ruta);
    res.json({ content });
  } catch (e) { next(e); }
};

const crearArchivo = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { ruta, contenido } = req.body;
    const projectBase = `${proyectosService.PROJECTS_BASE}/${projectId}`;
    await archivosService.createFile(projectBase, ruta, contenido || '');
    res.json({ ok: true });
  } catch (e) { next(e); }
};

const editarArchivo = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { ruta, contenido } = req.body;
    const projectBase = `${proyectosService.PROJECTS_BASE}/${projectId}`;
    await archivosService.editFile(projectBase, ruta, contenido || '');
    res.json({ ok: true });
  } catch (e) { next(e); }
};

module.exports = { listarArchivos, leerArchivo, crearArchivo, editarArchivo };