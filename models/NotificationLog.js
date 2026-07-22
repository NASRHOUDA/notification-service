const { DataTypes } = require("sequelize");

module.exports = function defineNotificationLogModel(sequelize) {
  const NotificationLog = sequelize.define(
    "NotificationLog",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      taskId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      type: {
        type: DataTypes.ENUM("deadline", "overdue", "reminder"),
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      sentAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      status: {
        type: DataTypes.ENUM("sent", "failed"),
        defaultValue: "sent",
      },
      error: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: "notification_logs",
      timestamps: true,
    }
  );

  return NotificationLog;
};
