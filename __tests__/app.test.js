jest.mock("../services/deadlineChecker", () => ({
  startDeadlineChecker: jest.fn(),
  checkOverdueTasks: jest.fn().mockResolvedValue(),
}));

const request = require("supertest");
const app = require("../server");
const { checkOverdueTasks } = require("../services/deadlineChecker");

describe("notification-service app", () => {
  it("GET /health should return status ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.service).toBe("notification-service");
  });

  it("GET /metrics should return prometheus metrics", async () => {
    const res = await request(app).get("/metrics");
    expect(res.status).toBe(200);
  });

  it("POST /trigger-check should call checkOverdueTasks and respond", async () => {
    const res = await request(app).post("/trigger-check");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("check triggered");
    expect(checkOverdueTasks).toHaveBeenCalled();
  });
});
