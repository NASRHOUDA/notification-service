require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const client = require("prom-client");
const { startDeadlineChecker, checkOverdueTasks } = require("./services/deadlineChecker");

const app = express();
app.use(helmet());
app.use(express.json());

client.collectDefaultMetrics();

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "notification-service" });
});

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.post("/trigger-check", async (req, res) => {
  await checkOverdueTasks();
  res.json({ status: "check triggered" });
});

const PORT = process.env.PORT || 5004;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🔔 Notification-service démarré sur le port ${PORT}`);
    startDeadlineChecker();
  });
}

module.exports = app;
