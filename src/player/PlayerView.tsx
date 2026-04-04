import React, { useEffect, useState } from "react";
import { Scene } from "../../shared/types/layout";

interface Props {
  scenes: Scene[];
  currentSceneId: string | null;
  mediaPathOverride: string | null;
  fitOverride: string | null;
  cutsceneVideo: string | null;
  fogGrid: boolean[][] | null;
  onCutsceneEnded: () => void;
}

export const PlayerView: React.FC<Props> = ({ scenes, currentSceneId, mediaPathOverride, fitOverride, cutsceneVideo, fogGrid, onCutsceneEnded }) => {
  const [visibleSceneId, setVisibleSceneId] = useState<string | null>(null);
  const [visibleMediaPath, setVisibleMediaPath] = useState<string | null>(null);
  const [visibleFit, setVisibleFit] = useState<string | null>(null);
  const [transition, setTransition] = useState<"fade" | "slide" | "zoom" | "none">("none");
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!currentSceneId) {
      setFading(true);
      setTimeout(() => {
        setVisibleSceneId(null);
        setVisibleMediaPath(null);
        setVisibleFit(null);
        setFading(false);
      }, 300);
      return;
    }

    const scene = scenes.find(s => s.id === currentSceneId);
    if (!scene) return;

    const t = scene.options?.transition ?? "fade";
    setTransition(t);

    setFading(true);
    setTimeout(() => {
      setVisibleSceneId(scene.id);
      setVisibleMediaPath(mediaPathOverride);
      setVisibleFit(fitOverride);
      setFading(false);
    }, 300);
  }, [currentSceneId, mediaPathOverride, fitOverride, scenes]);

  const scene = visibleSceneId ? scenes.find(s => s.id === visibleSceneId) : null;

  const opacity = fading ? 0 : 1;

  if (!scene) {
    return (
      <>
        <div style={styles.blackScreen} />
        {cutsceneVideo && <CutsceneOverlay src={cutsceneVideo} onEnded={onCutsceneEnded} />}
      </>
    );
  }

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <div
        style={{
          ...styles.container,
          opacity,
          transition: "opacity 0.3s ease",
          animation: transitionAnimation(transition)
        }}
      >
        {renderScene(scene, visibleMediaPath, visibleFit, fogGrid)}
      </div>
      {cutsceneVideo && <CutsceneOverlay src={cutsceneVideo} onEnded={onCutsceneEnded} />}
    </div>
  );
};

function renderScene(scene: Scene, mediaPathOverride: string | null, fitOverride: string | null, fogGrid: boolean[][] | null) {
  const mediaPath = mediaPathOverride ?? scene.mediaPath;
  const fit = fitOverride ?? scene.options?.fit ?? "contain";
  const src = mediaPath?.startsWith("/") ? mediaPath : "/" + mediaPath;

  switch (scene.type) {
    case "utility":
      return <div style={{ width: "100%", height: "100%", background: "#000" }} />;

    case "map":
      return (
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
          <img
            src={src}
            style={{
              width: "100%",
              height: "100%",
              objectFit: fit as React.CSSProperties["objectFit"]
            }}
          />
          {fogGrid && <FogOverlay fogGrid={fogGrid} />}
        </div>
      );

    case "video":
      return (
        <video
          src={src}
          autoPlay
          loop={scene.options?.loop ?? false}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      );

    case "text":
      return (
        <div style={styles.textScene}>
          {scene.textContent}
        </div>
      );

    default:
      return <div style={styles.blackScreen} />;
  }
}

function transitionAnimation(type: "fade" | "slide" | "zoom" | "none") {
  switch (type) {
    case "slide":
      return "slideIn 0.4s ease";
    case "zoom":
      return "zoomIn 0.4s ease";
    case "fade":
      return "fadeIn 0.3s ease";
    default:
      return "none";
  }
}

const styles = {
  container: {
    width: "100vw",
    height: "100vh",
    background: "black"
  },
  blackScreen: {
    width: "100vw",
    height: "100vh",
    background: "black"
  },
  textScene: {
    width: "100vw",
    height: "100vh",
    background: "black",
    color: "white",
    fontSize: "3rem",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    textAlign: "center" as const
  }
};

function CutsceneOverlay({ src, onEnded }: { src: string; onEnded: () => void }) {
  const videoSrc = src.startsWith("/") ? src : "/" + src;
  return (
    <div style={{
      position: "absolute",
      inset: 0,
      zIndex: 100,
      background: "black",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}>
      <video
        key={videoSrc}
        src={videoSrc}
        autoPlay
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
        onEnded={onEnded}
      />
    </div>
  );
}

function FogOverlay({ fogGrid }: { fogGrid: boolean[][] }) {
  const rows = fogGrid.length;
  const cols = fogGrid[0]?.length ?? 0;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        pointerEvents: "none"
      }}
    >
      {fogGrid.map((rowArr, r) =>
        rowArr.map((revealed, c) => (
          <div
            key={`${r}-${c}`}
            style={{
              background: revealed ? "transparent" : "black",
              transition: "background 0.3s ease"
            }}
          />
        ))
      )}
    </div>
  );
}