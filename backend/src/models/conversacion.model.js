const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Conversacion = sequelize.define('Conversacion', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  titulo: { type: DataTypes.STRING(250), allowNull: false, defaultValue: 'Nueva conversación' }
}, {
  tableName: 'conversaciones',
  timestamps: true,
  underscored: true
});

module.exports = Conversacion;