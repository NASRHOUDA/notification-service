const { Sequelize } = require("sequelize");
const dotenv = require("dotenv");
dotenv.config();

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: "postgres",
    logging: false,
    pool: { max: 5, min: 0, acquire: 30000, idle: 10000 },
    retry: { max: 5, match: [/ConnectionError/, /ConnectionRefusedError/, /ConnectionTimedOutError/, /TimeoutError/] },
  }
);

const NotificationLog = require("./NotificationLog")(sequelize);

sequelize.sync({ alter: true })
  .then(() => console.log("✅ NotificationLog model synchronized"))
  .catch(err => console.error("❌ Sync error:", err.message));

module.exports = { sequelize, NotificationLog };
