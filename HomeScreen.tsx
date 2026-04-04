import React, { useEffect, useRef, useState } from "react";
import { useAppData } from "@/state/useAppData";
import { Scene } from "@/types/layout";
import { TopBar } from "./TopBar";

interface Props {
  onCustomize: () => void;
  onViewLogs: () => void;
}

export const HomeScreen: React.FC<Props> = ({ onCustomize, onViewLogs }) => {
  const { activeLayout } = useAppData();
  const layoutRef = useRef(activeLayout);
  layoutRef.current = activeLayout;

  const [uniformSize, setUniformSize] = useState(() =>
    localStorage.getItem("layoutGridUniform") !== "false"
  );

  // Sync when LayoutGrid toggles the setting
  useEffect(() => {
    const onStorage = () => setUniformSize(localStorage.getItem("layoutGridUniform") !== "false");
    window.addEventListener("layoutGridUniformChanged", onStorage);
    return () => window.removeEventListener("layoutGridUniformChanged", onStorage);
  }, []);

  // track which scene is active per audio channel
  const [activeAudio, setActiveAudio] = useState<{
    ambience: string | null;
    music: string | null;
    sfx: string | null;
  }>({ ambience: null, music: null, sfx: null });

  // track active view index per scene (0 = primary mediaPath, 1+ = views[n-1])
  const [activeViews, setActiveViews] = useState<Record<string, number>>({});

  // track if a clip is currently playing (label for display)
  const [activeClipLabel, setActiveClipLabel] = useState<string | null>(null);

  // fog of war
  const [activeMapSceneId, setActiveMapSceneId] = useState<string | null>(null);
  const [fogGrids, setFogGrids] = useState<Record<string, boolean[][]>>({});

  // initiative tracker
  const [initiative, setInitiative] = useState<{ name: string; roll: number; hp?: number; maxHp?: number }[]>([]);
  const [initTurn, setInitTurn] = useState(0);
  const [initName, setInitName] = useState("");
  const [initRoll, setInitRoll] = useState("");
  const [initHp, setInitHp] = useState("");
  const [initMaxHp, setInitMaxHp] = useState("");

  // party items
  const [items, setItems] = useState<{ id: string; name: string; qty: number; notes?: string }[]>([]);
  const [itemName, setItemName] = useState("");
  const [itemQty, setItemQty] = useState("1");
  const [itemNotes, setItemNotes] = useState("");

  const getViewCount = (scene: Scene) => 1 + (scene.views?.length ?? 0);

  // Load initiative + items on mount, listen for remote updates
  useEffect(() => {
    window.electronAPI.getInitiative().then(data => {
      setInitiative(data.list);
      setInitTurn(data.currentTurn);
    });
    window.electronAPI.getItems().then(setItems);

    window.electronAPI.onInitiativeUpdated((data) => {
      setInitiative(data.list);
      setInitTurn(data.currentTurn);
    });
    window.electronAPI.onItemsUpdated((updatedItems) => {
      setItems(updatedItems);
    });
  }, []);

  const getActiveViewIndex = (scene: Scene) => activeViews[scene.id] ?? 0;

  const getActiveMediaPath = (scene: Scene): string | undefined => {
    const idx = getActiveViewIndex(scene);
    if (idx === 0 || !scene.views?.length) return scene.mediaPath;
    return scene.views[idx - 1]?.mediaPath ?? scene.mediaPath;
  };

  const getActiveFit = (scene: Scene): string | undefined => {
    const idx = getActiveViewIndex(scene);
    if (idx === 0 || !scene.views?.length) return scene.options?.fit;
    return scene.views[idx - 1]?.fit ?? scene.options?.fit;
  };

  const getActiveViewLabel = (scene: Scene): string => {
    const idx = getActiveViewIndex(scene);
    if (idx === 0) return "Default";
    return scene.views?.[idx - 1]?.label ?? `View ${idx + 1}`;
  };

  const cycleView = (sceneId: string, dir: 1 | -1, e: React.MouseEvent) => {
    e.stopPropagation();
    const scene = layoutRef.current?.scenes.find(s => s.id === sceneId);
    if (!scene) return;
    const total = getViewCount(scene);
    if (total <= 1) return;
    setActiveViews(prev => {
      const cur = prev[sceneId] ?? 0;
      return { ...prev, [sceneId]: (cur + dir + total) % total };
    });
  };

  const stopAudio = (audioType: "ambience" | "music" | "sfx") => {
    const cmd =
      audioType === "music" ? "STOP_MUSIC" :
      audioType === "sfx"   ? "STOP_SFX"   :
                              "STOP_AMBIENCE";
    window.electronAPI.sendDMCommand({ type: cmd });
    setActiveAudio(a => ({ ...a, [audioType]: null }));
  };

  const send = (sceneId: string | null) => {
    if (!layoutRef.current) return;
    if (!sceneId) {
      window.electronAPI.sendDMCommand({ type: "BLACKOUT" });
      return;
    }
    const scene = layoutRef.current.scenes.find(s => s.id === sceneId);
    if (scene?.type === "audio") {
      const audioType = scene.options?.audioType ?? "ambience";
      const cmd =
        audioType === "music" ? "PLAY_MUSIC" :
        audioType === "sfx"   ? "PLAY_SFX"   :
                                "PLAY_AMBIENCE";
      window.electronAPI.sendDMCommand({ type: cmd, sceneId });
      setActiveAudio(a => ({ ...a, [audioType]: sceneId }));
    } else {
      // send active view's mediaPath so player uses the correct image
      const mediaPath = getActiveMediaPath(scene!);
      const fit = getActiveFit(scene!);
      window.electronAPI.sendDMCommand({ type: "SHOW_SCENE", sceneId, mediaPath, fit });
      // track active map for fog control
      if (scene!.type === "map") {
        setActiveMapSceneId(sceneId);
        // load existing fog grid for this scene if available
        if (scene!.fogEnabled && !fogGrids[sceneId]) {
          window.electronAPI.getFog(sceneId).then(grid => {
            if (grid) setFogGrids(prev => ({ ...prev, [sceneId]: grid }));
          });
        }
      } else {
        setActiveMapSceneId(null);
      }
      // resolve linked ambience: check active view first, then fall back to scene default
      const activeViewIdx = getActiveViewIndex(scene!);
      const activeView = activeViewIdx > 0 && scene!.views?.length ? scene!.views[activeViewIdx - 1] : null;
      let linkedId: string | null | undefined;
      if (activeView && 'linkedAmbienceId' in activeView) {
        linkedId = activeView.linkedAmbienceId; // null = silence, string = play specific
      } else {
        linkedId = scene?.options?.linkedAmbienceId; // scene-level default
      }
      if (linkedId) {
        const ambienceScene = layoutRef.current.scenes.find(s => s.id === linkedId);
        if (ambienceScene) {
          window.electronAPI.sendDMCommand({ type: "PLAY_AMBIENCE", sceneId: linkedId });
          setActiveAudio(a => ({ ...a, ambience: linkedId as string }));
        }
      } else if (linkedId === null) {
        // explicitly silenced for this view
        window.electronAPI.sendDMCommand({ type: "STOP_AMBIENCE" });
        setActiveAudio(a => ({ ...a, ambience: null }));
      }
    }
  };

  // Hotkeys 1–9, 0, -, =
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const layout = layoutRef.current;
      if (!layout) return;
      const keys = ["1","2","3","4","5","6","7","8","9","0","-","="];
      const index = keys.indexOf(e.key);
      if (index === -1) return;

      const btn = layout.buttons[index];
      if (!btn) return;

      const scene = layout.scenes.find(s => s.id === btn.sceneId);
      if (!scene) return;

      send(scene.id);
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!activeLayout) return <div>Loading...</div>;

  const quickPrepScenes = activeLayout.scenes.filter(s => s.quickPrep);

  // Split buttons into visual / audio / utility buckets
  const sceneButtons = activeLayout.buttons.filter(btn => {
    const scene = activeLayout.scenes.find(s => s.id === btn.sceneId);
    return scene && scene.type !== "audio" && scene.type !== "utility";
  });
  const audioButtons = activeLayout.buttons.filter(btn => {
    const scene = activeLayout.scenes.find(s => s.id === btn.sceneId);
    return scene?.type === "audio";
  });
  const utilityButtons = activeLayout.buttons.filter(btn => {
    const scene = activeLayout.scenes.find(s => s.id === btn.sceneId);
    return scene?.type === "utility";
  });

  const renderButton = (btn: typeof activeLayout.buttons[0]) => {
    const scene = activeLayout.scenes.find(s => s.id === btn.sceneId);
    if (!scene) return null;
    const audioType = scene.type === "audio" ? (scene.options?.audioType ?? "ambience") : null;
    const isPlaying = audioType && activeAudio[audioType] === scene.id;
    const viewCount = getViewCount(scene);
    const viewIdx = getActiveViewIndex(scene);
    const hasViews = viewCount > 1;
    const activeMediaPath = getActiveMediaPath(scene);

    return (
      <div key={btn.id} style={{ position: "relative", display: "flex", flexDirection: "column", height: "100%" }}>
        <button
          style={{ ...styles.button, ...typeColors[scene.type], ...(isPlaying ? styles.activePulse : {}), flex: 1, width: "100%" }}
          onClick={() => send(scene.id)}
        >
          <div style={styles.label}>{scene.label}</div>
          {renderScenePreview(scene, activeMediaPath)}
        </button>
        {/* Fog of War overlay on active map card */}
        {scene.id === activeMapSceneId && scene.fogEnabled && fogGrids[scene.id] && (
          <FogGridOverlay
            sceneId={scene.id}
            fogGrid={fogGrids[scene.id]}
            onToggleCell={(row, col, revealed) => {
              window.electronAPI.toggleFogCell(scene.id, row, col, revealed);
              setFogGrids(prev => {
                const grid = prev[scene.id].map(r => [...r]);
                grid[row][col] = revealed;
                return { ...prev, [scene.id]: grid };
              });
            }}
            onRevealAll={() => {
              window.electronAPI.setFogAll(scene.id, true);
              setFogGrids(prev => ({
                ...prev,
                [scene.id]: prev[scene.id].map(r => r.map(() => true))
              }));
            }}
            onHideAll={() => {
              window.electronAPI.setFogAll(scene.id, false);
              setFogGrids(prev => ({
                ...prev,
                [scene.id]: prev[scene.id].map(r => r.map(() => false))
              }));
            }}
          />
        )}
        {isPlaying && audioType && (
          <button
            style={styles.stopBadge}
            onClick={e => { e.stopPropagation(); stopAudio(audioType); }}
            title="Stop"
          >
            ■
          </button>
        )}
        {hasViews && (
          <div style={styles.viewControls}>
            <button style={styles.viewBtn} onClick={e => cycleView(scene.id, -1, e)} title="Previous view">‹</button>
            <span style={styles.viewLabel}>{getActiveViewLabel(scene)}</span>
            <button style={styles.viewBtn} onClick={e => cycleView(scene.id, 1, e)} title="Next view">›</button>
          </div>
        )}
        {scene.clips && scene.clips.length > 0 && (
          <div style={styles.clipRow}>
            {scene.clips.map(clip => (
              <button
                key={clip.id}
                style={styles.clipBtn}
                title={clip.label}
                onClick={e => {
                  e.stopPropagation();
                  setActiveClipLabel(clip.label);
                  if (clip.chainToScene) {
                    const mediaPath = getActiveMediaPath(scene);
                    const fit = getActiveFit(scene);
                    window.electronAPI.sendDMCommand({
                      type: "PLAY_CLIP",
                      videoPath: clip.videoPath,
                      chainSceneId: scene.id,
                      chainMediaPath: mediaPath,
                      chainFit: fit
                    });
                  } else {
                    window.electronAPI.sendDMCommand({ type: "PLAY_CLIP", videoPath: clip.videoPath });
                  }
                }}
              >
                ▶ {clip.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={styles.container}>
      <TopBar onCustomize={onCustomize} onViewLogs={onViewLogs} />

      {activeClipLabel && (
        <div style={styles.clipBanner}>
          <span>▶ Playing clip: <strong>{activeClipLabel}</strong></span>
          <button
            style={styles.clipBannerStop}
            onClick={() => {
              window.electronAPI.sendDMCommand({ type: "STOP_CLIP" });
              setActiveClipLabel(null);
            }}
          >
            ■ Stop Clip
          </button>
        </div>
      )}

      {quickPrepScenes.length > 0 && (
        <div style={styles.quickPrepRow}>
          {quickPrepScenes.map(scene => (
            <button
              key={scene.id}
              style={{ ...styles.quickButton, ...typeColors[scene.type] }}
              onClick={() => send(scene.id)}
            >
              {scene.label}
            </button>
          ))}
        </div>
      )}

      <div style={{ ...styles.grid, ...(uniformSize ? { gridAutoRows: "240px" } : {}) }}>
        {sceneButtons.map(renderButton)}
      </div>

      {audioButtons.length > 0 && (
        <>
          <div style={styles.sectionDivider}>— Audio —</div>
          <div style={styles.audioRow}>
            {audioButtons.map(renderButton)}
          </div>
        </>
      )}

      {utilityButtons.length > 0 && (
        <>
          <div style={styles.sectionDivider}>— Utility —</div>
          <div style={styles.audioRow}>
            {utilityButtons.map(renderButton)}
          </div>
        </>
      )}

      {/* ── Initiative Tracker ── */}
      <div style={styles.sectionDivider}>— Initiative Tracker —</div>
      <div style={panelStyles.panel}>
        <div style={panelStyles.addRow}>
          <input style={panelStyles.input} placeholder="Name" value={initName} onChange={e => setInitName(e.target.value)} />
          <input style={{ ...panelStyles.input, width: 60 }} placeholder="Roll" type="number" value={initRoll} onChange={e => setInitRoll(e.target.value)} />
          <input style={{ ...panelStyles.input, width: 60 }} placeholder="HP" type="number" value={initHp} onChange={e => setInitHp(e.target.value)} />
          <input style={{ ...panelStyles.input, width: 60 }} placeholder="Max" type="number" value={initMaxHp} onChange={e => setInitMaxHp(e.target.value)} />
          <button style={panelStyles.addBtn} onClick={() => {
            if (!initName || !initRoll) return;
            window.electronAPI.addInitiative({
              name: initName, roll: Number(initRoll),
              hp: initHp ? Number(initHp) : undefined,
              maxHp: initMaxHp ? Number(initMaxHp) : undefined
            });
            setInitName(""); setInitRoll(""); setInitHp(""); setInitMaxHp("");
          }}>+ Add</button>
        </div>
        {initiative.length > 0 && (
          <>
            <div style={panelStyles.list}>
              {initiative.map((entry, i) => (
                <div key={i} style={{ ...panelStyles.entry, ...(i === initTurn ? panelStyles.activeEntry : {}) }}>
                  <span style={panelStyles.rollBadge}>{entry.roll}</span>
                  <span style={{ flex: 1 }}>{entry.name}</span>
                  {entry.hp != null && (
                    <span style={panelStyles.hpBadge}>
                      {entry.hp}{entry.maxHp != null ? `/${entry.maxHp}` : ""} HP
                    </span>
                  )}
                  <button style={panelStyles.removeBtn} onClick={() => window.electronAPI.removeInitiative(i)}>✕</button>
                </div>
              ))}
            </div>
            <div style={panelStyles.actionRow}>
              <button style={panelStyles.actionBtn} onClick={() => window.electronAPI.nextInitiative()}>Next Turn ▶</button>
              <button style={{ ...panelStyles.actionBtn, background: "rgba(192,57,43,0.3)", borderColor: "rgba(192,57,43,0.6)" }} onClick={() => window.electronAPI.clearInitiative()}>Clear All</button>
            </div>
          </>
        )}
        {initiative.length === 0 && <div style={{ color: "#666", fontSize: "0.85rem", padding: "8px 0" }}>No entries — add characters above</div>}
      </div>

      {/* ── Party Items ── */}
      <div style={styles.sectionDivider}>— Party Items —</div>
      <div style={panelStyles.panel}>
        <div style={panelStyles.addRow}>
          <input style={{ ...panelStyles.input, flex: 2 }} placeholder="Item name" value={itemName} onChange={e => setItemName(e.target.value)} />
          <input style={{ ...panelStyles.input, width: 50 }} placeholder="Qty" type="number" value={itemQty} onChange={e => setItemQty(e.target.value)} />
          <input style={{ ...panelStyles.input, flex: 1 }} placeholder="Notes" value={itemNotes} onChange={e => setItemNotes(e.target.value)} />
          <button style={panelStyles.addBtn} onClick={() => {
            if (!itemName) return;
            window.electronAPI.addItem({ name: itemName, qty: Number(itemQty) || 1, notes: itemNotes || undefined });
            setItemName(""); setItemQty("1"); setItemNotes("");
          }}>+ Add</button>
        </div>
        {items.length > 0 && (
          <div style={panelStyles.list}>
            {items.map(item => (
              <div key={item.id} style={panelStyles.entry}>
                <span style={{ ...panelStyles.rollBadge, background: "rgba(200,168,75,0.2)", color: "#c8a84b" }}>{item.qty}×</span>
                <span style={{ flex: 1 }}>{item.name}</span>
                {item.notes && <span style={{ fontSize: "0.75rem", color: "#888", marginRight: 8 }}>{item.notes}</span>}
                <button style={panelStyles.removeBtn} onClick={() => {
                  window.electronAPI.updateItem(item.id, { qty: item.qty + 1 });
                }} title="Add one">+</button>
                <button style={panelStyles.removeBtn} onClick={() => {
                  if (item.qty <= 1) {
                    window.electronAPI.removeItem(item.id);
                  } else {
                    window.electronAPI.updateItem(item.id, { qty: item.qty - 1 });
                  }
                }} title="Remove one">−</button>
                <button style={panelStyles.removeBtn} onClick={() => window.electronAPI.removeItem(item.id)}>✕</button>
              </div>
            ))}
          </div>
        )}
        {items.length === 0 && <div style={{ color: "#666", fontSize: "0.85rem", padding: "8px 0" }}>No items — add loot above</div>}
      </div>
    </div>
  );
};

// ── Fog of War overlay component ─────────────────────────────────────────────
interface FogGridOverlayProps {
  sceneId: string;
  fogGrid: boolean[][];
  onToggleCell: (row: number, col: number, revealed: boolean) => void;
  onRevealAll: () => void;
  onHideAll: () => void;
}

function FogGridOverlay({ fogGrid, onToggleCell, onRevealAll, onHideAll }: FogGridOverlayProps) {
  const rows = fogGrid.length;
  const cols = fogGrid[0]?.length ?? 0;
  return (
    <div style={{ marginTop: 4 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 1,
          background: "#111",
          padding: 2,
          borderRadius: 4,
          border: "1px solid rgba(255,255,255,0.15)"
        }}
      >
        {fogGrid.map((rowArr, r) =>
          rowArr.map((revealed, c) => (
            <div
              key={`${r}-${c}`}
              title={revealed ? "Revealed — click to hide" : "Hidden — click to reveal"}
              onClick={() => onToggleCell(r, c, !revealed)}
              style={{
                aspectRatio: "1",
                minWidth: 8,
                background: revealed ? "rgba(80,200,80,0.35)" : "rgba(0,0,0,0.85)",
                border: "1px solid rgba(255,255,255,0.08)",
                cursor: "pointer",
                borderRadius: 2
              }}
            />
          ))
        )}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        <button
          style={fogBtnStyle}
          onClick={e => { e.stopPropagation(); onRevealAll(); }}
          title="Reveal all cells"
        >
          Reveal All
        </button>
        <button
          style={fogBtnStyle}
          onClick={e => { e.stopPropagation(); onHideAll(); }}
          title="Hide all cells"
        >
          Hide All
        </button>
      </div>
    </div>
  );
}

const fogBtnStyle: React.CSSProperties = {
  flex: 1,
  background: "rgba(255,255,255,0.1)",
  border: "1px solid rgba(255,255,255,0.25)",
  color: "white",
  borderRadius: 4,
  padding: "3px 6px",
  fontSize: "0.72rem",
  cursor: "pointer"
};

function renderScenePreview(scene: Scene, activeMediaPath?: string) {
  if (scene.type === "audio") {
    const audioType = scene.options?.audioType ?? "ambience";
    const label =
      audioType === "music" ? "Music" :
      audioType === "sfx" ? "SFX" :
      "Ambience";

    return (
      <div style={styles.audioThumb}>
        <div style={styles.audioIcon}>AUDIO</div>
        <div style={styles.audioMeta}>{label}</div>
      </div>
    );
  }

  if (scene.type === "utility") {
    return <div style={{ ...styles.utilityThumb, background: "#000" }} />;
  }

  const path = activeMediaPath ?? scene.mediaPath;
  if (path) {
    const thumbStyle = scene.type === "utility" ? styles.utilityThumb : styles.thumb;
    return (
      <img
        src={path.startsWith("/") ? path : "/" + path}
        style={thumbStyle}
      />
    );
  }

  return <div style={styles.emptyThumb}>No Preview</div>;
}

const typeColors: Record<Scene["type"], React.CSSProperties> = {
  map: { background: "#2d4f8b" },
  video: { background: "#8b2d2d" },
  audio: { background: "#2d8b4f" },
  text: { background: "#8b7a2d" },
  utility: { background: "#444" }
};

const styles = {
  container: {
    height: "100vh",
    background: "#1a1a1a",
    color: "white",
    padding: 16
  },
  quickPrepRow: {
    display: "flex",
    gap: 12,
    marginBottom: 16
  },
  quickButton: {
    padding: "12px 16px",
    borderRadius: 8,
    border: "2px solid #333",
    cursor: "pointer",
    fontSize: "1.1rem"
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: 16
  },
  sectionDivider: {
    margin: "20px 0 10px",
    textAlign: "center" as const,
    color: "#888",
    fontSize: "0.85rem",
    letterSpacing: "0.12em"
  },
  audioRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 16
  },
  utilityThumb: {
    width: "100%",
    height: 48,
    borderRadius: 4,
    objectFit: "cover" as const
  },
  button: {
    padding: 12,
    borderRadius: 8,
    border: "2px solid #333",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column" as const,
    justifyContent: "space-between"
  },
  label: {
    fontSize: "1.2rem",
    marginBottom: 8
  },
  thumb: {
    width: "100%",
    height: 100,
    objectFit: "cover" as const,
    borderRadius: 4
  },
  audioThumb: {
    width: "100%",
    height: 100,
    borderRadius: 4,
    border: "1px solid rgba(255, 255, 255, 0.25)",
    background: "linear-gradient(135deg, rgba(12, 44, 26, 0.55), rgba(6, 24, 14, 0.9))",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: 8
  },
  audioIcon: {
    fontSize: "0.8rem",
    letterSpacing: "0.16em",
    fontWeight: 700,
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(255, 255, 255, 0.12)",
    border: "1px solid rgba(255, 255, 255, 0.15)"
  },
  audioMeta: {
    fontSize: "0.95rem",
    opacity: 0.9
  },
  emptyThumb: {
    width: "100%",
    height: 100,
    borderRadius: 4,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0, 0, 0, 0.18)",
    border: "1px dashed rgba(255, 255, 255, 0.25)",
    fontSize: "0.9rem",
    opacity: 0.8
  },
  blackout: {
    display: "none"
  },
  activePulse: {
    outline: "3px solid #7fff7f",
    outlineOffset: 2
  },
  viewControls: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 4
  },
  viewBtn: {
    background: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.25)",
    color: "white",
    borderRadius: 4,
    width: 24,
    height: 24,
    cursor: "pointer",
    fontSize: 16,
    lineHeight: "22px",
    padding: 0,
    textAlign: "center" as const
  },
  viewLabel: {
    fontSize: "0.75rem",
    opacity: 0.8,
    minWidth: 60,
    textAlign: "center" as const
  },
  clipRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 4,
    marginTop: 4
  },
  clipBtn: {
    flex: "1 1 auto",
    background: "rgba(160, 80, 220, 0.25)",
    border: "1px solid rgba(160, 80, 220, 0.6)",
    color: "white",
    borderRadius: 4,
    padding: "3px 6px",
    fontSize: "0.72rem",
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "100%"
  },
  clipBanner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "rgba(160, 80, 220, 0.3)",
    border: "1px solid rgba(160, 80, 220, 0.7)",
    borderRadius: 6,
    padding: "6px 12px",
    margin: "4px 0",
    fontSize: "0.85rem",
    color: "white"
  },
  clipBannerStop: {
    background: "#7b2d8b",
    border: "none",
    color: "white",
    borderRadius: 4,
    padding: "4px 12px",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: "0.85rem"
  },
  stopBadge: {
    position: "absolute" as const,
    top: 6,
    right: 6,
    background: "#c0392b",
    color: "white",
    border: "none",
    borderRadius: 4,
    width: 24,
    height: 24,
    fontSize: 14,
    cursor: "pointer",
    lineHeight: "24px",
    textAlign: "center" as const,
    padding: 0
  }
};

const panelStyles = {
  panel: {
    background: "#222",
    borderRadius: 8,
    border: "1px solid #333",
    padding: 12,
    margin: "0 0 16px"
  },
  addRow: {
    display: "flex",
    gap: 6,
    marginBottom: 8,
    flexWrap: "wrap" as const,
    alignItems: "center"
  },
  input: {
    background: "#111",
    border: "1px solid #444",
    color: "white",
    borderRadius: 4,
    padding: "6px 8px",
    fontSize: "0.85rem",
    flex: 1,
    minWidth: 0
  },
  addBtn: {
    background: "rgba(39,174,96,0.25)",
    border: "1px solid rgba(39,174,96,0.6)",
    color: "#7fff7f",
    borderRadius: 4,
    padding: "6px 12px",
    fontSize: "0.85rem",
    cursor: "pointer",
    fontWeight: 600,
    whiteSpace: "nowrap" as const
  },
  list: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 4
  },
  entry: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 8px",
    background: "#1a1a1a",
    borderRadius: 4,
    border: "1px solid #333",
    fontSize: "0.9rem"
  },
  activeEntry: {
    background: "rgba(200,168,75,0.15)",
    border: "1px solid rgba(200,168,75,0.5)"
  },
  rollBadge: {
    background: "rgba(41,128,185,0.25)",
    color: "#5dade2",
    borderRadius: 4,
    padding: "2px 8px",
    fontWeight: 700,
    fontSize: "0.85rem",
    minWidth: 32,
    textAlign: "center" as const
  },
  hpBadge: {
    fontSize: "0.75rem",
    color: "#e74c3c",
    background: "rgba(231,76,60,0.15)",
    padding: "2px 6px",
    borderRadius: 4
  },
  removeBtn: {
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.2)",
    color: "#999",
    borderRadius: 4,
    width: 24,
    height: 24,
    cursor: "pointer",
    fontSize: 14,
    lineHeight: "22px",
    padding: 0,
    textAlign: "center" as const
  },
  actionRow: {
    display: "flex",
    gap: 8,
    marginTop: 8
  },
  actionBtn: {
    flex: 1,
    background: "rgba(41,128,185,0.2)",
    border: "1px solid rgba(41,128,185,0.5)",
    color: "white",
    borderRadius: 4,
    padding: "8px",
    fontSize: "0.85rem",
    cursor: "pointer",
    fontWeight: 600
  }
};