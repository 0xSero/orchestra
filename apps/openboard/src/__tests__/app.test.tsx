// @jsxImportSource solid-js
import { render, screen, cleanup } from "@solidjs/testing-library";
import { describe, expect, test, afterEach } from "vitest";
import { App } from "../App";

describe("OpenBoard App", () => {
  afterEach(() => {
    cleanup();
  });

  test("renders without crashing", () => {
    const { container } = render(() => <App />);
    expect(container).toBeTruthy();
  });

  test("displays the OpenBoard heading", () => {
    render(() => <App />);
    const headings = screen.getAllByRole("heading", { name: /OpenBoard/i });
    expect(headings.length).toBeGreaterThan(0);
  });

  test("displays scaffold badge", () => {
    render(() => <App />);
    const scaffoldBadges = screen.getAllByText(/Scaffold/i);
    expect(scaffoldBadges.length).toBeGreaterThan(0);
  });

  test("displays next steps section", () => {
    render(() => <App />);
    const nextSteps = screen.getByText(/Next Steps/i);
    expect(nextSteps).toBeTruthy();
  });

  test("displays action buttons", () => {
    render(() => <App />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });
});
