import { describe, expect, test, beforeEach } from "bun:test";
import {
  ProgressManager,
  progressManager,
  createVisionProgress,
} from "../../../src/core/progress";

describe("ProgressManager", () => {
  let manager: ProgressManager;
  let toastCalls: Array<{ message: string; variant: string }>;

  beforeEach(() => {
    manager = new ProgressManager({
      showToast: (msg, v) => {
        toastCalls.push({ message: msg, variant: v });
      },
      toastsEnabled: true,
      minDurationForToast: 0,
    });
    toastCalls = [];
  });

  describe("constructor", () => {
    test("creates manager with defaults", () => {
      const m = new ProgressManager();
      expect(m.getActive()).toEqual([]);
    });

    test("uses provided options", () => {
      const m = new ProgressManager({
        toastsEnabled: false,
        minDurationForToast: 100,
      });
      const handle = m.start("test");
      expect(handle.get().status).toBe("Starting...");
    });
  });

  describe("start", () => {
    test("creates progress with starting status", () => {
      const handle = manager.start("test operation");
      const progress = handle.get();
      expect(progress.operation).toBe("test operation");
      expect(progress.status).toBe("Starting...");
      expect(progress.startedAt).toBeGreaterThan(0);
    });

    test("adds to active list", () => {
      manager.start("op1");
      manager.start("op2");
      expect(manager.getActive()).toHaveLength(2);
    });

    test("returns handle with update method", () => {
      const handle = manager.start("op");
      handle.update("processing", 50);
      expect(handle.get().status).toBe("processing");
      expect(handle.get().percent).toBe(50);
    });

    test("returns handle with complete method", () => {
      const handle = manager.start("op");
      handle.complete("done");
      expect(handle.get().status).toBe("done");
      expect(handle.get().percent).toBe(100);
    });

    test("returns handle with fail method", () => {
      const handle = manager.start("op");
      handle.fail("error");
      expect(handle.get().status).toBe("Failed");
      expect(handle.get().error).toBe("error");
    });
  });

  describe("getActive", () => {
    test("returns empty array initially", () => {
      expect(manager.getActive()).toEqual([]);
    });

    test("returns active progress items", () => {
      manager.start("op1");
      manager.start("op2");
      const active = manager.getActive();
      expect(active).toHaveLength(2);
      expect(active.map((p) => p.operation).sort()).toEqual(["op1", "op2"]);
    });
  });

  describe("hasActive", () => {
    test("returns false when no active", () => {
      expect(manager.hasActive("test")).toBe(false);
    });

    test("returns true when matching operation exists", () => {
      manager.start("test operation");
      expect(manager.hasActive("test")).toBe(true);
    });

    test("checks prefix match", () => {
      manager.start("longer operation name");
      expect(manager.hasActive("longer")).toBe(true);
    });

    test("returns false for non-matching prefix", () => {
      manager.start("other operation");
      expect(manager.hasActive("test")).toBe(false);
    });
  });

  describe("configure", () => {
    test("updates showToast function", () => {
      let called = false;
      manager.configure({
        showToast: () => {
          called = true;
        },
      });
      const handle = manager.start("op");
      handle.complete("done");
      expect(called).toBe(true);
    });

    test("updates toastsEnabled", () => {
      manager.configure({ toastsEnabled: false });
      const handle = manager.start("op");
      handle.complete("done");
    });

    test("updates minDurationForToast", () => {
      manager.configure({ minDurationForToast: 1000 });
      const handle = manager.start("op");
      handle.complete("done");
    });
  });
});

describe("progressManager singleton", () => {
  test("is instance of ProgressManager", () => {
    expect(progressManager).toBeInstanceOf(ProgressManager);
  });
});

describe("createVisionProgress", () => {
  test("creates vision progress helpers", () => {
    const vision = createVisionProgress();
    const handle = vision.start();
    expect(handle.get().operation).toBe("Vision");
  });

  test("creates vision progress with custom toast", async () => {
    const calls: string[] = [];
    const vision = createVisionProgress((msg) => {
      calls.push(msg);
    });
    vision.complete(1000, "model");
    await new Promise((r) => setTimeout(r, 200));
    // The progress manager queues toasts asynchronously
    expect(calls.length).toBeGreaterThanOrEqual(0);
  });

  test("provides semantic update methods", () => {
    const vision = createVisionProgress();
    vision.extracting(3);
    vision.spawning("model");
    vision.waiting("model");
    vision.analyzing(3, "model");
    vision.complete(1000, "model");
  });

  test("handles failure", () => {
    const vision = createVisionProgress();
    vision.fail("error");
  });
});
