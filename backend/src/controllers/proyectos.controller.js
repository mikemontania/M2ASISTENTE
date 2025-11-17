const proyectosService = require('../services/proyectos.service');

const crearProyecto = async (req, res, next) => {
  try {
    const { nombre } = req.body;
    const p = await proyectosService.createProject({ nombre });
    res.json(p);
  } catch (e) { next(e); }
};

const listarProyectos = async (req, res, next) => {
  try {
    const l = await proyectosService.listProjects();
    res.json(l);
  } catch (e) { next(e); }
};

const eliminarProyecto = async (req, res, next) => {
  try {
    const { id } = req.params;
    await proyectosService.deleteProject(id);
    res.json({ ok: true });
  } catch (e) { next(e); }
};

module.exports = { crearProyecto, listarProyectos, eliminarProyecto };