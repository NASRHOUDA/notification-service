const cron = require("node-cron");
const axios = require("axios");
const { sendDeadlineExceededEmail } = require("./mailer");
const { NotificationLog } = require("../models");

const GATEWAY_URL = process.env.GATEWAY_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

const internalClient = axios.create({
  baseURL: GATEWAY_URL,
  headers: { "x-internal-api-key": INTERNAL_API_KEY },
  timeout: 5000,
});

async function checkOverdueTasks() {
  let overdueTasks = [];
  try {
    const { data } = await internalClient.get("/internal/tasks/overdue");
    overdueTasks = data;
  } catch (err) {
    console.error("❌ Échec récupération tâches en retard:", err.message);
    return;
  }

  if (!overdueTasks.length) return;

  for (const task of overdueTasks) {
    const userId = task.userId || task.UserId;
    if (!userId) {
      console.error(`❌ Tâche ${task.id} sans userId, skip.`);
      continue;
    }
    try {
      const { data: user } = await internalClient.get(`/internal/users/${userId}`);

      await sendDeadlineExceededEmail(task, user);

      await internalClient.patch(`/internal/tasks/${task.id}/alert-sent`);
      await NotificationLog.create({
        taskId: task.id,
        type: "overdue",
        email: user.email,
        status: "sent",
      });

      console.log(`📧 Alerte envoyée pour la tâche "${task.title}" (id: ${task.id})`);
    } catch (err) {
      console.error(`❌ Échec traitement tâche ${task.id}:`, err.message);
      await NotificationLog.create({
        taskId: task.id,
        type: "overdue",
        email: task.email || "unknown",
        status: "failed",
        error: err.message,
      }).catch(() => {});
    }
  }
}

function startDeadlineChecker() {
  cron.schedule("*/5 * * * *", () => {
    checkOverdueTasks();
  });
  console.log("⏰ Deadline checker démarré (toutes les 5 minutes)");
}

module.exports = { startDeadlineChecker, checkOverdueTasks };
