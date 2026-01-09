import { describe, it, expect, beforeEach } from "bun:test";
import {
  EventCleanup,
  getDefaultEventCleanupConfig,
} from "../../../src/core/event-cleanup";

describe("EventCleanup", () => {
  let eventCleanup: EventCleanup;

  beforeEach(() => {
    eventCleanup = new EventCleanup({
      intervalMs: 60000,
      maxListeners: 10,
    });
  });

  describe("initial state", () => {
    it("should start with no listeners", () => {
      expect(eventCleanup.getListenerCount()).toBe(0);
      expect(eventCleanup.getTrackedListenerCount()).toBe(0);
    });

    it("should not be running periodic cleanup by default", () => {
      expect(eventCleanup.getIsRunning()).toBe(false);
    });

    it("should have correct config from constructor", () => {
      const config = eventCleanup.getConfig();
      expect(config.intervalMs).toBe(60000);
      expect(config.maxListeners).toBe(10);
    });
  });

  describe("listener registration", () => {
    it("should register listeners and return unsubscribe function", () => {
      const listener = () => {};
      const unsubscribe = eventCleanup.on("test", listener);

      expect(eventCleanup.getListenerCount("test")).toBe(1);
      expect(eventCleanup.getTrackedListenerCount()).toBe(1);

      unsubscribe();

      expect(eventCleanup.getListenerCount("test")).toBe(0);
      expect(eventCleanup.getTrackedListenerCount()).toBe(0);
    });

    it("should support multiple listeners on same event", () => {
      const listener1 = () => {};
      const listener2 = () => {};

      eventCleanup.on("test", listener1);
      eventCleanup.on("test", listener2);

      expect(eventCleanup.getListenerCount("test")).toBe(2);
      expect(eventCleanup.getTrackedListenerCount()).toBe(2);
    });

    it("should support listeners on different events", () => {
      eventCleanup.on("event1", () => {});
      eventCleanup.on("event2", () => {});
      eventCleanup.on("event3", () => {});

      expect(eventCleanup.getListenerCount("event1")).toBe(1);
      expect(eventCleanup.getListenerCount("event2")).toBe(1);
      expect(eventCleanup.getListenerCount("event3")).toBe(1);
      expect(eventCleanup.getTrackedListenerCount()).toBe(3);
    });
  });

  describe("event emission", () => {
    it("should emit events to registered listeners", () => {
      let callCount = 0;
      const listener = () => {
        callCount++;
      };

      eventCleanup.on("test", listener);
      eventCleanup.emit("test", {});

      expect(callCount).toBe(1);
    });

    it("should pass event data to listeners", () => {
      let receivedData: any = null;
      const listener = (data: any) => {
        receivedData = data;
      };

      eventCleanup.on("test", listener);
      eventCleanup.emit("test", { foo: "bar" });

      expect(receivedData).toEqual({ foo: "bar" });
    });

    it("should support multiple emissions", () => {
      let callCount = 0;
      const listener = () => {
        callCount++;
      };

      eventCleanup.on("test", listener);
      eventCleanup.emit("test", {});
      eventCleanup.emit("test", {});
      eventCleanup.emit("test", {});

      expect(callCount).toBe(3);
    });
  });

  describe("listener removal", () => {
    it("should remove specific listener", () => {
      const listener1 = () => {};
      const listener2 = () => {};

      eventCleanup.on("test", listener1);
      eventCleanup.on("test", listener2);
      eventCleanup.off("test", listener1);

      expect(eventCleanup.getListenerCount("test")).toBe(1);
    });

    it("should remove all listeners for event type", () => {
      eventCleanup.on("test", () => {});
      eventCleanup.on("test", () => {});
      eventCleanup.off("test");

      expect(eventCleanup.getListenerCount("test")).toBe(0);
    });

    it("should remove all listeners", () => {
      eventCleanup.on("event1", () => {});
      eventCleanup.on("event2", () => {});
      eventCleanup.off();

      expect(eventCleanup.getListenerCount()).toBe(0);
    });
  });

  describe("periodic cleanup", () => {
    it("should start and stop periodic cleanup", () => {
      expect(eventCleanup.getIsRunning()).toBe(false);

      eventCleanup.startPeriodicCleanup();

      expect(eventCleanup.getIsRunning()).toBe(true);

      eventCleanup.stopPeriodicCleanup();

      expect(eventCleanup.getIsRunning()).toBe(false);
    });

    it("should not start if already running", () => {
      eventCleanup.startPeriodicCleanup();
      eventCleanup.startPeriodicCleanup();

      expect(eventCleanup.getIsRunning()).toBe(true);

      eventCleanup.stopPeriodicCleanup();
    });

    it("should not stop if not running", () => {
      eventCleanup.stopPeriodicCleanup();

      expect(eventCleanup.getIsRunning()).toBe(false);
    });
  });

  describe("destroy", () => {
    it("should stop cleanup and remove all listeners", () => {
      eventCleanup.on("test", () => {});
      eventCleanup.startPeriodicCleanup();

      eventCleanup.destroy();

      expect(eventCleanup.getListenerCount()).toBe(0);
      expect(eventCleanup.getTrackedListenerCount()).toBe(0);
      expect(eventCleanup.getIsRunning()).toBe(false);
    });
  });

  describe("config", () => {
    it("should use custom interval", () => {
      const cleanup = new EventCleanup({ intervalMs: 60000 });
      const config = cleanup.getConfig();

      expect(config.intervalMs).toBe(60000);
    });

    it("should use custom max listeners", () => {
      const cleanup = new EventCleanup({ maxListeners: 50 });
      const config = cleanup.getConfig();

      expect(config.maxListeners).toBe(50);
    });

    it("should use default values for unset config", () => {
      const cleanup = new EventCleanup({});
      const config = cleanup.getConfig();

      expect(config.intervalMs).toBe(300000);
      expect(config.maxListeners).toBe(100);
    });
  });

  describe("default config helper", () => {
    it("should return correct default values", () => {
      const config = getDefaultEventCleanupConfig();

      expect(config.intervalMs).toBe(300000);
      expect(config.maxListeners).toBe(100);
    });
  });

  describe("unsubscribe cleanup", () => {
    it("should clean up tracked listener on unsubscribe", () => {
      const listener = () => {};
      eventCleanup.on("test", listener);

      expect(eventCleanup.getTrackedListenerCount()).toBe(1);

      const unsubscribe = eventCleanup.on("test", listener);
      unsubscribe();

      expect(eventCleanup.getTrackedListenerCount()).toBe(1);
    });

    it("should handle multiple unsubscribes gracefully", () => {
      const listener = () => {};
      const unsubscribe = eventCleanup.on("test", listener);

      unsubscribe();
      unsubscribe();

      expect(eventCleanup.getListenerCount("test")).toBe(0);
    });
  });
});
