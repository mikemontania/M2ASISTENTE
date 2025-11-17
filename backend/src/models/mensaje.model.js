const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const Conversacion = require('./conversacion.model');

const Mensaje = sequelize.define('Mensaje', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  conversacionId: { type: DataTypes.BIGINT, allowNull: false, field: 'conversacion_id' },
  rol: { type: DataTypes.STRING(32), allowNull: false }, // 'user', 'assistant', 'system' / 'usuario', 'asistente'
  contenido: { type: DataTypes.TEXT, allowNull: false },
  archivosAdjuntos: { type: DataTypes.JSONB, allowNull: true, field: 'archivos_adjuntos' },
  marcaDeTiempo: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'marca_de_tiempo' }
}, {
  tableName: 'mensajes',
  timestamps: false,
  underscored: true
});

Conversacion.hasMany(Mensaje, { foreignKey: 'conversacion_id' });
Mensaje.belongsTo(Conversacion, { foreignKey: 'conversacion_id' });

module.exports = Mensaje;