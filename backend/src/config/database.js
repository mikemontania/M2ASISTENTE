const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DB_CNN, {
  dialect: 'postgres',
  logging: false,
  pool: { max: 5, min: 0, acquire: 30000, idle: 10000 }
});

module.exports = { sequelize };