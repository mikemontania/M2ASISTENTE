const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const Conversacion = require('./conversacion.model');

const Mensaje = sequelize.define('Mensaje', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  conversacionId: { type: DataTypes.BIGINT, allowNull: false  },
  rol: { type: DataTypes.STRING(32), allowNull: false }, // 'user', 'assistant', 'system' / 'usuario', 'asistente'
  contenido: { type: DataTypes.TEXT, allowNull: false },
 archivosAdjuntos: { type: DataTypes.JSONB, allowNull: true  },
  // metadata libre para control interno (por ejemplo: chosenModel, planner info, flags)
  metadata: { type: DataTypes.JSONB, allowNull: true  },
  // guarda las respuestas de todos los modelos consultados (array de {step, model, raw, contentPreview})
  modelResponses: { type: DataTypes.JSONB, allowNull: true  }, 
   marcaDeTiempo: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW,  }
}, {
  tableName: 'mensajes',
  timestamps: false,
  underscored: true
});

Conversacion.hasMany(Mensaje, { foreignKey: 'conversacion_id' });
Mensaje.belongsTo(Conversacion, { foreignKey: 'conversacion_id' });

module.exports = Mensaje;