import React from "react";
import { Scene, SceneView, SceneClip } from "@/types/layout";
import { v4 as uuid } from "uuid";

interface Props {
  scene: Scene;
  scenes: Scene[];
  onChange: (partial: Partial<Scene>) => void;
}

export const SceneEditor: React.FC<Props> = ({ scene, scenes, onChange }) => {
  const updateOptions = (partial: NonNullable<Scene["options"]>) => {
    onChange({ options: { ...scene.options, ...partial } });
  };

  const pickFileFor = async (onPath: (p: string) => void) => {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const filePath = window.electronAPI.getFilePath(file);
      const normalized = normalizeMediaPath(filePath);
      if (normalized.startsWith("/assets/")) {
        onPath(normalized);
      } else {
        const webPath = await window.electronAPI.copyAsset(filePath);
        onPath(webPath);
      }
    };
    input.click();
  };

  const pickFile = () => pickFileFor(p => onChange({ mediaPath: p }));

  return (
    <div style={{ marginTop: 16 }}>
      <h3>Edit Scene</h3>

      <label>
        Label:
        <input
          value={scene.label}
          onChange={e => onChange({ label: e.target.value })}
        />
      </label>

      {scene.type !== "text" && (
        <div>
          <button onClick={pickFile}>Choose File</button>
          <div>
            Media Path:
            <input
              style={{ width: "100%" }}
              value={scene.mediaPath ?? ""}
              onChange={e => onChange({ mediaPath: e.target.value })}
              placeholder="/assets/maps/example.png"
            />
          </div>
          <div>Path: {scene.mediaPath ?? "(none)"}</div>
        </div>
      )}

      {scene.type === "text" && (
        <textarea
          value={scene.textContent ?? ""}
          onChange={e => onChange({ textContent: e.target.value })}
        />
      )}

      <label>
        DM Notes:
        <textarea
          style={{ width: "100%", height: 120 }}
          value={scene.notes ?? ""}
          onChange={e => onChange({ notes: e.target.value })}
        />
      </label>

      {(scene.type === "video" || scene.type === "audio") && (
        <label>
          Loop:
          <input
            type="checkbox"
            checked={scene.options?.loop ?? false}
            onChange={e => updateOptions({ loop: e.target.checked })}
          />
        </label>
      )}

      {scene.type === "audio" && (
        <label>
          Audio Type:
          <select
            value={scene.options?.audioType ?? "ambience"}
            onChange={e =>
              updateOptions({
                audioType: e.target.value as "ambience" | "music" | "sfx"
              })
            }
          >
            <option value="ambience">Ambience</option>
            <option value="music">Music</option>
            <option value="sfx">SFX</option>
          </select>
        </label>
      )}

      {scene.type === "map" || scene.type === "video" || scene.type === "text" || scene.type === "utility" ? (
        <label>
          Linked Ambience:
          <select
            value={scene.options?.linkedAmbienceId ?? ""}
            onChange={e =>
              updateOptions({ linkedAmbienceId: e.target.value || undefined })
            }
          >
            <option value="">(none)</option>
            {scenes
              .filter(s => s.type === "audio" && (s.options?.audioType ?? "ambience") === "ambience")
              .map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))
            }
          </select>
        </label>
      ) : null}

      {(scene.type === "map" || scene.type === "video" || scene.type === "text" || scene.type === "utility") && (
        <label>
          Transition:
          <select
            value={scene.options?.transition ?? "fade"}
            onChange={e =>
              updateOptions({
                transition: e.target.value as "fade" | "slide" | "zoom" | "none"
              })
            }
          >
            <option value="fade">Fade</option>
            <option value="slide">Slide</option>
            <option value="zoom">Zoom</option>
            <option value="none">None</option>
          </select>
        </label>
      )}

      {(scene.type === "map" || scene.type === "utility") && (
        <label>
          Fit:
          <select
            value={scene.options?.fit ?? "contain"}
            onChange={e => updateOptions({ fit: e.target.value })}
          >
            <option value="contain">Contain</option>
            <option value="cover">Cover</option>
            <option value="fill">Fill</option>
            <option value="scale-down">Scale Down</option>
          </select>
        </label>
      )}

      {scene.type === "map" && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={scene.fogEnabled ?? false}
              onChange={e => onChange({ fogEnabled: e.target.checked })}
            />
            Enable Fog of War overlay
          </label>
          {scene.fogEnabled && (
            <div style={{ display: "flex", gap: 16, paddingLeft: 24 }}>
              <label>
                Columns:
                <input
                  type="number"
                  min={2}
                  max={30}
                  value={scene.fogCols ?? 10}
                  onChange={e => onChange({ fogCols: Math.max(2, Math.min(30, +e.target.value)) })}
                  style={{ width: 60, marginLeft: 6 }}
                />
              </label>
              <label>
                Rows:
                <input
                  type="number"
                  min={2}
                  max={30}
                  value={scene.fogRows ?? 8}
                  onChange={e => onChange({ fogRows: Math.max(2, Math.min(30, +e.target.value)) })}
                  style={{ width: 60, marginLeft: 6 }}
                />
              </label>
            </div>
          )}
        </div>
      )}

      {scene.type !== "audio" && scene.type !== "text" && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            Alternate Views
            <button
              style={{ marginLeft: 8, fontSize: "0.8rem", padding: "2px 8px" }}
              onClick={() => {
                const newView: SceneView = { id: uuid(), label: "New View", mediaPath: "" };
                onChange({ views: [...(scene.views ?? []), newView] });
              }}
            >
              + Add View
            </button>
          </div>

          {(scene.views ?? []).map((view, i) => (
            <div key={view.id} style={{ border: "1px solid #444", borderRadius: 4, padding: 8, marginBottom: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                <input
                  style={{ flex: 1 }}
                  value={view.label}
                  placeholder="View label"
                  onChange={e => {
                    const updated = scene.views!.map((v, idx) => idx === i ? { ...v, label: e.target.value } : v);
                    onChange({ views: updated });
                  }}
                />
                <button
                  style={{ background: "#600", border: "none", color: "white", cursor: "pointer", padding: "2px 8px", borderRadius: 3 }}
                  onClick={() => onChange({ views: scene.views!.filter((_, idx) => idx !== i) })}
                >
                  ✕
                </button>
              </div>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <input
                  style={{ flex: 1 }}
                  value={view.mediaPath}
                  placeholder="/assets/maps/example.png"
                  onChange={e => {
                    const updated = scene.views!.map((v, idx) => idx === i ? { ...v, mediaPath: e.target.value } : v);
                    onChange({ views: updated });
                  }}
                />
                <button onClick={() => pickFileFor(p => {
                  const updated = scene.views!.map((v, idx) => idx === i ? { ...v, mediaPath: p } : v);
                  onChange({ views: updated });
                })}>
                  Browse
                </button>
              </div>
              <label style={{ marginTop: 4, display: "block", fontSize: "0.85rem" }}>
                Fit:&nbsp;
                <select
                  value={view.fit ?? ""}
                  onChange={e => {
                    const updated = scene.views!.map((v, idx) => idx === i ? { ...v, fit: e.target.value || undefined } : v);
                    onChange({ views: updated });
                  }}
                >
                  <option value="">(same as scene)</option>
                  <option value="contain">Contain</option>
                  <option value="cover">Cover</option>
                  <option value="fill">Fill</option>
                  <option value="scale-down">Scale Down</option>
                </select>
              </label>
              <label style={{ marginTop: 4, display: "block", fontSize: "0.85rem" }}>
                Linked Ambience:&nbsp;
                <select
                  value={
                    !('linkedAmbienceId' in view) || view.linkedAmbienceId === undefined ? "" :
                    view.linkedAmbienceId === null ? "__NONE__" :
                    view.linkedAmbienceId
                  }
                  onChange={e => {
                    const val = e.target.value;
                    const updated = scene.views!.map((v, idx) => {
                      if (idx !== i) return v;
                      if (val === "") {
                        // remove key entirely — inherit scene default
                        const { linkedAmbienceId: _, ...rest } = v;
                        return rest as typeof v;
                      }
                      return { ...v, linkedAmbienceId: val === "__NONE__" ? null : val };
                    });
                    onChange({ views: updated });
                  }}
                >
                  <option value="">(inherit from scene)</option>
                  <option value="__NONE__">None (silence)</option>
                  {scenes
                    .filter(s => s.type === "audio" && (s.options?.audioType ?? "ambience") === "ambience")
                    .map(s => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))
                  }
                </select>
              </label>
            </div>
          ))}
        </div>
      )}

      {scene.type !== "audio" && scene.type !== "text" && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            Clips (one-shot video overlays)
            <button
              style={{ marginLeft: 8, fontSize: "0.8rem", padding: "2px 8px" }}
              onClick={() => {
                const newClip: SceneClip = { id: uuid(), label: "New Clip", videoPath: "" };
                onChange({ clips: [...(scene.clips ?? []), newClip] });
              }}
            >
              + Add Clip
            </button>
          </div>

          {(scene.clips ?? []).map((clip, i) => (
            <div key={clip.id} style={{ border: "1px solid #553377", borderRadius: 4, padding: 8, marginBottom: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                <input
                  style={{ flex: 1 }}
                  value={clip.label}
                  placeholder="Clip label"
                  onChange={e => {
                    const updated = scene.clips!.map((c, idx) => idx === i ? { ...c, label: e.target.value } : c);
                    onChange({ clips: updated });
                  }}
                />
                <button
                  style={{ background: "#600", border: "none", color: "white", cursor: "pointer", padding: "2px 8px", borderRadius: 3 }}
                  onClick={() => onChange({ clips: scene.clips!.filter((_, idx) => idx !== i) })}
                >
                  ✕
                </button>
              </div>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <input
                  style={{ flex: 1 }}
                  value={clip.videoPath}
                  placeholder="/assets/video/skeletons.mp4"
                  onChange={e => {
                    const updated = scene.clips!.map((c, idx) => idx === i ? { ...c, videoPath: e.target.value } : c);
                    onChange({ clips: updated });
                  }}
                />
                <button onClick={() => pickFileFor(p => {
                  const updated = scene.clips!.map((c, idx) => idx === i ? { ...c, videoPath: p } : c);
                  onChange({ clips: updated });
                })}>
                  Browse
                </button>
              </div>
              <label style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem" }}>
                <input
                  type="checkbox"
                  checked={clip.chainToScene ?? false}
                  onChange={e => {
                    const updated = scene.clips!.map((c, idx) => idx === i ? { ...c, chainToScene: e.target.checked } : c);
                    onChange({ clips: updated });
                  }}
                />
                Show scene after clip ends
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

function normalizeMediaPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const publicIndex = normalized.lastIndexOf("/public/");

  if (publicIndex >= 0) {
    return normalized.slice(publicIndex + "/public".length);
  }

  return normalized;
}