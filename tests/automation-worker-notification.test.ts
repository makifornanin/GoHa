import { describe, expect, it } from "vitest";

import {
  validateWorkerNotification,
  workerFallbackNotification,
} from "@/lib/automation/worker-notification";

describe("worker notification boundary", () => {
  it("accepts a small same-origin relative destination", () => {
    expect(
      validateWorkerNotification({
        title: "Morning brief",
        body: "Start with the proposal.",
        url: "/focus?taskId=123#timer",
      }),
    ).toEqual({
      title: "Morning brief",
      body: "Start with the proposal.",
      url: "/focus?taskId=123#timer",
    });
  });

  it("rejects external, scheme-relative, backslash, and script destinations", () => {
    for (const url of [
      "https://example.com/steal",
      "//example.com/steal",
      "/\\example.com/steal",
      "javascript:alert(1)",
    ]) {
      expect(validateWorkerNotification({ title: "x", body: "y", url })).toBeNull();
    }
  });

  it("rejects empty, oversized, or control-character presentation", () => {
    expect(validateWorkerNotification({ title: "", body: "body", url: "/today" })).toBeNull();
    expect(
      validateWorkerNotification({ title: "x".repeat(81), body: "body", url: "/today" }),
    ).toBeNull();
    expect(
      validateWorkerNotification({ title: "title", body: "x".repeat(241), url: "/today" }),
    ).toBeNull();
    expect(
      validateWorkerNotification({ title: "title\r\ninjected", body: "body", url: "/today" }),
    ).toBeNull();
    expect(
      validateWorkerNotification({
        title: "title",
        body: "body",
        url: "/today",
        userId: "caller-supplied",
      }),
    ).toBeNull();
  });

  it("bounds deterministic fallback presentation", () => {
    const value = workerFallbackNotification(
      "t".repeat(100),
      `  ${"body ".repeat(80)}  `,
      "/today",
    );
    expect(value.title.length).toBeLessThanOrEqual(80);
    expect(value.body.length).toBeLessThanOrEqual(240);
    expect(value.url).toBe("/today");
  });
});
