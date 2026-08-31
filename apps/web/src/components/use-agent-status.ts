import { useEffect, useState } from "react";

export type AgentStatus = "checking" | "running" | "disabled";

/** Probes a bundled eve agent's public health route. */
export function useAgentStatus(agentName: string): AgentStatus {
  const [status, setStatus] = useState<AgentStatus>("checking");
  useEffect(() => {
    let cancelled = false;
    fetch(`/eve/agents/${agentName}/eve/v1/health`)
      .then((response) => {
        if (!cancelled) {
          setStatus(response.ok ? "running" : "disabled");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("disabled");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [agentName]);
  return status;
}
