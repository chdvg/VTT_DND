import React, { useState } from "react";
import { useAppData } from "@/state/useAppData";
import { Scene, LayoutButton, LayoutConfig } from "@/types/layout";
import { v4 as uuid } from "uuid";
import { SceneEditor } from "./SceneEditors";
import { LayoutGrid } from "./LayoutGrid";
import { QuickPrepPanel } from "./QuickPrepPanel";

interface Props {
  onBack: () => void;
}

export const CustomizeScreen: React.FC<Props> = ({ onBack }) => {
  const { data, activeLayout, save } = useAppData();
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [tab, setTab] = useState<"scenes" | "layout" | "prep">("scenes");

  if (!data || !activeLayout) return <div>Loading...</div>;

  const updateLayout = (updater: (layout: LayoutConfig) => LayoutConfig) => {
    const newLayouts = data.layouts.map(l =>
      l.id === activeLayout.id ? updater(l) : l
    );
    save({ ...data, layouts: newLayouts });
  };

  const addScene = (type: Scene["type"]) => {
    const newScene: Scene = {
      id: uuid(),
      label: "New Scene",
      type
    };
    updateLayout(l => ({ ...l, scenes: [...l.scenes, newScene] }));
    setSelectedSceneId(newScene.id);
  };

  const updateScene = (sceneId: string, partial: Partial<Scene>) => {
    updateLayout(l => ({
      ...l,
      scenes: l.scenes.map(s => (s.id === sceneId ? { ...s, ...partial } : s))
    }));
  };

  const deleteScene = (sceneId: string) => {
    updateLayout(l => ({
      ...l,
      scenes: l.scenes.filter(s => s.id !== sceneId),
      buttons: l.buttons.filter(b => b.sceneId !== sceneId)
    }));
    if (selectedSceneId === sceneId) setSelectedSceneId(null);
  };

  const assignSceneToSlot = (row: number, col: number, sceneId: string) => {
    updateLayout(l => {
      const existing = l.buttons.find(b => b.row === row && b.col === col);
      if (existing) {
        return {
          ...l,
          buttons: l.buttons.map(b =>
            b.id === existing.id ? { ...b, sceneId } : b
          )
        };
      }
      const newButton: LayoutButton = { id: uuid(), sceneId, row, col };
      return { ...l, buttons: [...l.buttons, newButton] };
    });
  };

  const removeFromSlot = (row: number, col: number) => {
    updateLayout(l => ({
      ...l,
      buttons: l.buttons.filter(b => !(b.row === row && b.col === col))
    }));
  };

  const resizeGrid = (rows: number, cols: number) => {
    updateLayout(l => ({
      ...l,
      gridRows: rows,
      gridCols: cols,
      // remove buttons outside the new bounds
      buttons: l.buttons.filter(b => b.row < rows && b.col < cols)
    }));
  };

  const scenes = activeLayout.scenes;

  return (
    <div style={styles.container}>
      <div style={styles.sidebar}>
        <h2>Customize</h2>

        <div style={styles.tabs}>
          <button onClick={() => setTab("scenes")}>Scenes</button>
          <button onClick={() => setTab("layout")}>Layout</button>
          <button onClick={() => setTab("prep")}>Quick Prep</button>
        </div>

        {tab === "scenes" && (
          <>
            <button onClick={() => addScene("map")}>+ Map</button>
            <button onClick={() => addScene("video")}>+ Video</button>
            <button onClick={() => addScene("audio")}>+ Audio</button>
            <button onClick={() => addScene("text")}>+ Text</button>
            <button onClick={() => addScene("utility")}>+ Utility</button>

            <ul>
              {scenes.map(scene => (
                <li
                  key={scene.id}
                  style={{
                    cursor: "pointer",
                    fontWeight: scene.id === selectedSceneId ? "bold" : "normal",
                    display: "flex",
                    alignItems: "center",
                    gap: 8
                  }}
                >
                  <span style={{ flex: 1 }} onClick={() => setSelectedSceneId(scene.id)}>
                    {scene.label} ({scene.type})
                  </span>
                  <button
                    onClick={() => deleteScene(scene.id)}
                    style={{ background: "#600", border: "none", color: "white", cursor: "pointer", padding: "2px 6px", borderRadius: 3 }}
                    title="Delete scene"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>

            {selectedSceneId && (
              <SceneEditor
                scene={scenes.find(s => s.id === selectedSceneId)!}
                scenes={scenes}
                onChange={partial => updateScene(selectedSceneId, partial)}
              />
            )}
          </>
        )}

        {tab === "prep" && <QuickPrepPanel />}

        <button onClick={onBack}>Back</button>
      </div>

      {tab === "layout" && (
        <div style={styles.main}>
          <h2>Layout Grid</h2>
          <LayoutGrid
            layout={activeLayout}
            scenes={scenes}
            onAssign={assignSceneToSlot}
            onClear={removeFromSlot}
            onResize={resizeGrid}
          />
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    display: "flex",
    height: "100vh",
    background: "#111",
    color: "white"
  },
  sidebar: {
    width: "30%",
    borderRight: "1px solid #444",
    padding: 16
  },
  main: {
    flex: 1,
    padding: 16
  },
  tabs: {
    display: "flex",
    gap: 8,
    marginBottom: 16
  }
};