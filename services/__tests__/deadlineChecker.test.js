const mockGet = jest.fn();
const mockPatch = jest.fn();

jest.mock("axios", () => ({
  create: jest.fn(() => ({
    get: mockGet,
    patch: mockPatch,
  })),
}));

jest.mock("../mailer", () => ({
  sendDeadlineExceededEmail: jest.fn(),
}));

jest.mock("node-cron", () => ({
  schedule: jest.fn(),
}));

const cron = require("node-cron");
const { sendDeadlineExceededEmail } = require("../mailer");
const { checkOverdueTasks, startDeadlineChecker } = require("../deadlineChecker");

describe("checkOverdueTasks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should stop silently if fetching overdue tasks fails", async () => {
    mockGet.mockRejectedValueOnce(new Error("network error"));

    await checkOverdueTasks();

    expect(sendDeadlineExceededEmail).not.toHaveBeenCalled();
  });

  it("should do nothing if there are no overdue tasks", async () => {
    mockGet.mockResolvedValueOnce({ data: [] });

    await checkOverdueTasks();

    expect(sendDeadlineExceededEmail).not.toHaveBeenCalled();
  });

  it("should skip a task with no userId", async () => {
    mockGet.mockResolvedValueOnce({ data: [{ id: "t1", title: "No user" }] });

    await checkOverdueTasks();

    expect(sendDeadlineExceededEmail).not.toHaveBeenCalled();
  });

  it("should fetch the user, send the email, and mark alertSent for each overdue task", async () => {
    const task = { id: "t1", title: "Late", userId: "u1" };
    const user = { id: "u1", name: "Test", email: "test@example.com" };

    mockGet
      .mockResolvedValueOnce({ data: [task] })
      .mockResolvedValueOnce({ data: user });
    sendDeadlineExceededEmail.mockResolvedValueOnce({});
    mockPatch.mockResolvedValueOnce({});

    await checkOverdueTasks();

    expect(mockGet).toHaveBeenCalledWith("/internal/tasks/overdue");
    expect(mockGet).toHaveBeenCalledWith("/internal/users/u1");
    expect(sendDeadlineExceededEmail).toHaveBeenCalledWith(task, user);
    expect(mockPatch).toHaveBeenCalledWith("/internal/tasks/t1/alert-sent");
  });

  it("should continue with the next task if one task fails", async () => {
    const task1 = { id: "t1", title: "Late 1", userId: "u1" };
    const task2 = { id: "t2", title: "Late 2", userId: "u2" };
    const user2 = { id: "u2", name: "T2", email: "t2@example.com" };

    mockGet
      .mockResolvedValueOnce({ data: [task1, task2] })
      .mockRejectedValueOnce(new Error("user lookup failed"))
      .mockResolvedValueOnce({ data: user2 });
    sendDeadlineExceededEmail.mockResolvedValueOnce({});
    mockPatch.mockResolvedValueOnce({});

    await checkOverdueTasks();

    expect(sendDeadlineExceededEmail).toHaveBeenCalledTimes(1);
    expect(sendDeadlineExceededEmail).toHaveBeenCalledWith(task2, user2);
  });

  it("should log an error but continue if sending the email fails", async () => {
    const task = { id: "t1", title: "Late", userId: "u1" };
    const user = { id: "u1", name: "Test", email: "test@example.com" };

    mockGet
      .mockResolvedValueOnce({ data: [task] })
      .mockResolvedValueOnce({ data: user });
    sendDeadlineExceededEmail.mockRejectedValueOnce(new Error("smtp down"));

    await checkOverdueTasks();

    expect(mockPatch).not.toHaveBeenCalled();
  });
});

describe("startDeadlineChecker", () => {
  it("should schedule a cron job every 5 minutes", () => {
    startDeadlineChecker();

    expect(cron.schedule).toHaveBeenCalledWith("*/5 * * * *", expect.any(Function));
  });
});
