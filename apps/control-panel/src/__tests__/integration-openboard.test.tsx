// @jsxImportSource solid-js
/**
 * Integration test for OpenBoard seam
 *
 * Tests that the control panel can render OpenBoard components
 * through a reversible integration seam.
 */

import { render, screen, cleanup } from "@solidjs/testing-library";
import { describe, expect, test, afterEach, beforeEach } from "vitest";
import {
  OpenBoardSeam,
  OpenBoardRoute,
  isOpenBoardEnabled,
  setOpenBoardEnabled,
} from "../components/openboard-seam";

describe("OpenBoard Integration Seam", () => {
  beforeEach(() => {
    // Reset any localStorage state
    localStorage.removeItem("openboard.enabled");
  });

  afterEach(() => {
    cleanup();
  });

  test("OpenBoardSeam renders without crashing", () => {
    const { container } = render(() => <OpenBoardSeam />);
    expect(container).toBeTruthy();
  });

  test("isOpenBoardEnabled returns false by default", () => {
    expect(isOpenBoardEnabled()).toBe(false);
  });

  test("isOpenBoardEnabled respects localStorage setting", () => {
    localStorage.setItem("openboard.enabled", "true");
    expect(isOpenBoardEnabled()).toBe(true);
  });

  test("setOpenBoardEnabled updates localStorage", () => {
    expect(isOpenBoardEnabled()).toBe(false);
    setOpenBoardEnabled(true);
    expect(isOpenBoardEnabled()).toBe(true);
    expect(localStorage.getItem("openboard.enabled")).toBe("true");
    setOpenBoardEnabled(false);
    expect(isOpenBoardEnabled()).toBe(false);
    expect(localStorage.getItem("openboard.enabled")).toBe("false");
  });

  test("OpenBoardSeam renders placeholder when OpenBoard is not yet available", () => {
    render(() => <OpenBoardSeam />);
    // Should show that OpenBoard features are available via a seam
    const container = screen.queryByTestId("openboard-seam");
    expect(container).toBeTruthy();
  });

  test("OpenBoardSeam shows disabled state by default", () => {
    render(() => <OpenBoardSeam />);
    expect(screen.getByText("Using legacy control panel")).toBeTruthy();
  });
});

describe("OpenBoard Route", () => {
  beforeEach(() => {
    localStorage.removeItem("openboard.enabled");
  });

  afterEach(() => {
    cleanup();
  });

  test("OpenBoardRoute renders fallback when disabled", () => {
    const { container } = render(() => <OpenBoardRoute />);
    expect(container).toBeTruthy();
    expect(screen.getByText("OpenBoard Not Enabled")).toBeTruthy();
  });

  test("OpenBoardRoute shows enable button when disabled", () => {
    render(() => <OpenBoardRoute />);
    expect(screen.getByText("Enable OpenBoard")).toBeTruthy();
  });
});
