import React, { useEffect, useState } from "react";

interface LogEntry {
  timestamp: number;
  type?: string;
  action?: string;
  sceneId?: string;
}

export const SessionLogView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [entries, setEntries] = useState<LogEntry[]>([]);

  useEffect(() => {
    window.electronAPI.getSessionLog().then(setEntries);
  }, []);

  return (
    <div style={styles.container}>
      <h2>Session Log</h2>

      <div style={styles.list}>
        {entries.map((e, i) => (
          <div key={i} style={styles.entry}>
            <span style={styles.time}>
              {new Date(e.timestamp).toLocaleTimeString()} —
            </span>
            <span>
              {e.type || e.action} {e.sceneId ? `(${e.sceneId})` : ""}
            </span>
          </div>
        ))}
      </div>

      <button onClick={onBack}>Back</button>
    </div>
  );
};

const styles = {
  container: {
    height: "100vh",
    background: "#1a1a1a",
    color: "white",
    padding: 16,
    display: "flex",
    flexDirection: "column" as const
  },
  list: {
    flex: 1,
    overflowY: "auto" as const,
    marginBottom: 16
  },
  entry: {
    padding: "4px 0",
    borderBottom: "1px solid #333"
  },
  time: {
    color: "#aaa",
    marginRight: 8
  }
};