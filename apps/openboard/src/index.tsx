/**
 * OpenBoard - Entry point
 *
 * This is a placeholder scaffold for the OpenBoard application.
 * The actual OpenBoard source should be transplanted here when available.
 */

/* @refresh reload */
import { render } from "solid-js/web";
import "@fontsource/geist-sans/400.css";
import "@fontsource/geist-mono/400.css";
import "./index.css";
import { App } from "./App";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

render(() => <App />, root);
