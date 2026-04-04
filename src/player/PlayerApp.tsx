import React, { useEffect, useRef, useState } from "react";
import { PlayerView } from "./PlayerView";
import { PlayerAudioBus } from "./PlayerAudioBus";
import { Scene } from "../../shared/types/layout";

export const PlayerApp: React.FC = () => {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [currentSceneId, setCurrentSceneId] = useState<string | null>(null);
  const [currentMediaPath, setCurrentMediaPath] = useState<string | null>(null);
  const [currentFit, setCurrentFit] = useState<string | null>(null);
  const [cutsceneVideo, setCutsceneVideo] = useState<string | null>(null);
  const [fogGrid, setFogGrid] = useState<boolean[][] | null>(null);
  const pendingChain = useRef<{ sceneId: string; mediaPath?: string; fit?: string } | null>(null);

  const [audioBus, setAudioBus] = useState({
    ambienceId: null as string | null,
    musicId: null as string | null,
    sfxId: null as string | null
  });

  useEffect(() => {
    const loadScenes = () => {
      window.electronAPI.getAppData().then(data => {
        const layout = data.layouts.find(l => l.id === data.activeLayoutId);
        if (layout) setScenes(layout.scenes);
      });
    };

    loadScenes();
    window.electronAPI.onDataUpdated(loadScenes);

    window.electronAPI.onPlayerCommand(msg => {
      switch (msg.type) {
        case "SHOW_SCENE":
          setCurrentSceneId(msg.sceneId);
          setCurrentMediaPath(msg.mediaPath ?? null);
          setCurrentFit(msg.fit ?? null);
          setFogGrid(null); // cleared now; UPDATE_FOG will follow immediately for fog-enabled maps
          break;

        case "BLACKOUT":
          setCurrentSceneId(null);
          setCurrentMediaPath(null);
          setCurrentFit(null);
          setFogGrid(null);
          break;

        case "UPDATE_FOG":
          setFogGrid(msg.fogGrid ?? null);
          break;

        case "PLAY_AMBIENCE":
          setAudioBus(bus => ({ ...bus, ambienceId: msg.sceneId }));
          break;

        case "PLAY_MUSIC":
          setAudioBus(bus => ({ ...bus, musicId: msg.sceneId }));
          break;

        case "PLAY_SFX":
          setAudioBus(bus => ({ ...bus, sfxId: msg.sceneId }));
          break;

        case "STOP_AMBIENCE":
          setAudioBus(bus => ({ ...bus, ambienceId: null }));
          break;

        case "STOP_MUSIC":
          setAudioBus(bus => ({ ...bus, musicId: null }));
          break;

        case "STOP_SFX":
          setAudioBus(bus => ({ ...bus, sfxId: null }));
          break;

        case "PLAY_CLIP":
          pendingChain.current = msg.chainSceneId
            ? { sceneId: msg.chainSceneId, mediaPath: msg.chainMediaPath, fit: msg.chainFit }
            : null;
          setCutsceneVideo(msg.videoPath ?? null);
          break;

        case "STOP_CLIP":
          pendingChain.current = null;
          setCutsceneVideo(null);
          break;
      }
    });
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", background: "black" }}>
      <PlayerView scenes={scenes} currentSceneId={currentSceneId} mediaPathOverride={currentMediaPath} fitOverride={currentFit} cutsceneVideo={cutsceneVideo} fogGrid={fogGrid} onCutsceneEnded={() => {
        setCutsceneVideo(null);
        const chain = pendingChain.current;
        pendingChain.current = null;
        if (chain) {
          setCurrentSceneId(chain.sceneId);
          setCurrentMediaPath(chain.mediaPath ?? null);
          setCurrentFit(chain.fit ?? null);
        }
      }} />
      <PlayerAudioBus scenes={scenes} bus={audioBus} />
    </div>
  );
};