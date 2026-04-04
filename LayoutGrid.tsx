import React, { useState } from "react";
import { LayoutConfig, Scene } from "@/types/layout";

interface Props {
  layout: LayoutConfig;
  scenes: Scene[];
  onAssign: (row: number, col: number, sceneId: string) => void;
  onClear: (row: number, col: number) => void;
  onResize: (rows: number, cols: number) => void;
}

export const LayoutGrid: React.FC<Props> = ({ layout, scenes, onAssign, onClear, onResize }) => {
  const [dragSceneId, setDragSceneId] = useState<string | null>(null);
  const [uniformSize, setUniformSize] = useState(() =>
    localStorage.getItem("layoutGridUniform") !== "false"
  );

  const toggleUniform = (val: boolean) => {
    localStorage.setItem("layoutGridUniform", String(val));
    window.dispatchEvent(new Event("layoutGridUniformChanged"));
    setUniformSize(val);
  };

  const rows = layout.gridRows ?? 3;
  const cols = layout.gridCols ?? 4;

  const getButtonFor = (row: number, col: number) =>
    layout.buttons.find(b => b.row === row && b.col === col);

  return (
    <div>
      {/* Resize controls */}
      <div style={resizeBar}>
        <span style={{ color: "#aaa", fontSize: 13 }}>Rows: {rows}</span>
        <button style={resizeBtn} onClick={() => rows > 1 && onResize(rows - 1, cols)}>− Row</button>
        <button style={resizeBtn} onClick={() => onResize(rows + 1, cols)}>+ Row</button>
        <span style={{ color: "#aaa", fontSize: 13, marginLeft: 16 }}>Cols: {cols}</span>
        <button style={resizeBtn} onClick={() => cols > 1 && onResize(rows, cols - 1)}>− Col</button>
        <button style={resizeBtn} onClick={() => onResize(rows, cols + 1)}>+ Col</button>
        <span style={{ color: "#555", marginLeft: 8 }}>|</span>
        <button
          style={{ ...resizeBtn, color: uniformSize ? "#c9a84c" : "#ccc", borderColor: uniformSize ? "#c9a84c" : "#555" }}
          title={uniformSize ? "Switch to auto height" : "Switch to uniform height"}
          onClick={() => toggleUniform(!uniformSize)}
        >
          {uniformSize ? "⇔ Uniform" : "⇕ Auto"}
        </button>
      </div>

      {/* Grid */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, ...(uniformSize ? { gridAutoRows: "140px" } : {}), gap: 8 }}>
        {Array.from({ length: rows }).flatMap((_, r) =>
          Array.from({ length: cols }).map((_, c) => {
            const btn = getButtonFor(r, c);
            const scene = btn ? scenes.find(s => s.id === btn.sceneId) : null;

            return (
              <div
                key={`${r}-${c}`}
                style={cell}
                onDragOver={e => e.preventDefault()}
                onDrop={() => { if (dragSceneId) onAssign(r, c, dragSceneId); }}
              >
                <div style={cellHeader}>
                  <span style={{ color: "#666", fontSize: 11 }}>R{r + 1} C{c + 1}</span>
                  {scene && (
                    <button
                      style={clearBtn}
                      title="Clear slot"
                      onClick={() => onClear(r, c)}
                    >×</button>
                  )}
                </div>

                {scene && (
                  <div
                    draggable
                    onDragStart={() => setDragSceneId(scene.id)}
                    style={scenePill}
                    title="Drag to move"
                  >
                    {scene.label}
                  </div>
                )}

                <select
                  value={scene?.id ?? ""}
                  onChange={e => {
                    if (e.target.value) onAssign(r, c, e.target.value);
                    else onClear(r, c);
                  }}
                  style={selectEl}
                >
                  <option value="">— empty —</option>
                  {scenes.map(s => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

const resizeBar: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 6, marginBottom: 12, flexWrap: "wrap"
};
const resizeBtn: React.CSSProperties = {
  padding: "4px 10px", background: "#222", border: "1px solid #555",
  color: "#ccc", borderRadius: 4, cursor: "pointer", fontSize: 13
};
const cell: React.CSSProperties = {
  border: "1px solid #444", borderRadius: 6, padding: 8,
  minHeight: 90, boxSizing: "border-box", overflow: "hidden",
  background: "#161616", display: "flex", flexDirection: "column", gap: 6
};
const cellHeader: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center"
};
const clearBtn: React.CSSProperties = {
  background: "transparent", border: "none", color: "#800",
  cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 2px"
};
const scenePill: React.CSSProperties = {
  background: "#2a2a2a", border: "1px solid #555", borderRadius: 4,
  padding: "4px 8px", fontSize: 13, cursor: "grab", color: "#ddd",
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
};
const selectEl: React.CSSProperties = {
  background: "#111", border: "1px solid #444", color: "#ccc",
  borderRadius: 4, padding: "3px 4px", fontSize: 12, width: "100%"
};
