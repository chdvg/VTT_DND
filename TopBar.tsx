import React from "react";

interface Props {
  onCustomize: () => void;
  onViewLogs: () => void;
}

export const TopBar: React.FC<Props> = ({ onCustomize, onViewLogs }) => (
  <div style={styles.bar}>
    <h1 style={styles.title}>DM Console</h1>

    <div style={styles.buttons}>
      <button style={styles.btn} onClick={onCustomize}>Customize</button>
      <button style={styles.btn} onClick={onViewLogs}>Session Log</button>
    </div>
  </div>
);

const styles = {
  bar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 8,
    borderBottom: "1px solid #333"
  },
  title: {
    margin: 0
  },
  buttons: {
    display: "flex",
    gap: 8
  },
  btn: {
    padding: "8px 16px",
    background: "#333",
    color: "white",
    border: "1px solid #555",
    borderRadius: 6,
    cursor: "pointer"
  }
};