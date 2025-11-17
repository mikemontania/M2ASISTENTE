const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ArchivoAdjunto = sequelize.define('ArchivoAdjunto', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  conversacionId: { type: DataTypes.BIGINT, allowNull: true, field: 'conversacion_id' },
  nombreArchivo: { type: DataTypes.STRING(250), allowNull: false, field: 'nombre_archivo' },
  rutaArchivo: { type: DataTypes.STRING(1000), allowNull: false, field: 'ruta_archivo' },
  mimeType: { type: DataTypes.STRING(200), allowNull: true, field: 'mimetype' },
  contenidoExtraido: { type: DataTypes.TEXT, allowNull: true, field: 'contenido_extraido' }
}, {
  tableName: 'archivos_adjuntos',
  timestamps: true,
  underscored: true
});

module.exports = ArchivoAdjunto;