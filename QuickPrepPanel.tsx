import React from "react";
import { useAppData } from "@/state/useAppData";

export const QuickPrepPanel: React.FC = () => {
  const { activeLayout, data, save } = useAppData();

  if (!activeLayout) return null;

  const togglePrep = (sceneId: string) => {
    const newScenes = activeLayout.scenes.map(s =>
      s.id === sceneId ? { ...s, quickPrep: !s.quickPrep } : s
    );

    const newLayout = { ...activeLayout, scenes: newScenes };
    save({
      ...data!,
      layouts: data!.layouts.map(l => (l.id === newLayout.id ? newLayout : l))
    });
  };

  return (
    <div style={{ padding: 16 }}>
      <h3>Quick Prep</h3>
      <p>Select scenes you plan to use tonight.</p>

      <ul>
        {activeLayout.scenes.map(scene => (
          <li key={scene.id}>
            <label>
              <input
                type="checkbox"
                checked={scene.quickPrep ?? false}
                onChange={() => togglePrep(scene.id)}
              />
              {scene.label}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
};