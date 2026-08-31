"use client";

import { useEffect, useState } from "react";

import { SrulyChat } from "./sruly-chat";
import { useAgentStatus } from "./use-agent-status";

const STORAGE_KEY = "shulstack.sruly-panel-open";

/**
 * Sruly as a collapsible side panel, available on every workspace page.
 * Rendered only when the bundled agent is actually running.
 */
export function SrulyPanel() {
  const status = useAgentStatus("sruly");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      setOpen(window.localStorage.getItem(STORAGE_KEY) === "true");
    } catch {
      // Storage unavailable: start closed.
    }
  }, []);

  if (status !== "running") {
    return null;
  }

  const toggle = (next: boolean) => {
    setOpen(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Ignore storage failures.
    }
  };

  return (
    <>
      {open ? (
        <aside aria-label="Sruly assistant" className="sruly-panel">
          <header className="sruly-panel-header">
            <strong>Sruly</strong>
            <button
              aria-label="Close Sruly"
              className="nav-link sruly-panel-close"
              onClick={() => toggle(false)}
              type="button"
            >
              ✕
            </button>
          </header>
          <SrulyChat compact />
        </aside>
      ) : (
        <button className="sruly-toggle" onClick={() => toggle(true)} type="button">
          Ask Sruly
        </button>
      )}
    </>
  );
}
