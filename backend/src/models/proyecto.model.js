const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Proyecto = sequelize.define('Proyecto', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  nombre: { type: DataTypes.STRING(250), allowNull: false },
  rutaBase: { type: DataTypes.STRING(1000), allowNull: false, field: 'ruta_base' },
  descripcion: { type: DataTypes.TEXT, allowNull: true }
}, {
  tableName: 'proyectos',
  timestamps: true,
  underscored: true
});

module.exports = Proyecto;