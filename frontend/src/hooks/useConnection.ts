import { useEffect, useState } from "react";

export type ConnectionStatus = "healthy" | "warning" | "offline";

interface ConnectionState {
  failureCount: number;
  status: ConnectionStatus;
}

type ConnectionListener = (state: ConnectionState) => void;

let state: ConnectionState = {
  failureCount: 0,
  status: "healthy"
};

const listeners = new Set<ConnectionListener>();

const setState = (nextState: ConnectionState): void => {
  state = nextState;
  listeners.forEach((listener) => listener(state));
};

export const recordPollSuccess = (): void => {
  if (state.failureCount !== 0 || state.status !== "healthy") {
    setState({ failureCount: 0, status: "healthy" });
  }
};

export const recordPollFailure = (): void => {
  const failureCount = state.failureCount + 1;
  setState({
    failureCount,
    status: failureCount >= 3 ? "offline" : "warning"
  });
};

export const useConnection = (): ConnectionState & { isOffline: boolean } => {
  const [snapshot, setSnapshot] = useState(state);

  useEffect(() => {
    listeners.add(setSnapshot);
    return () => {
      listeners.delete(setSnapshot);
    };
  }, []);

  return {
    ...snapshot,
    isOffline: snapshot.status === "offline"
  };
};
