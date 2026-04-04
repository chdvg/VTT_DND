import React, { useEffect, useRef } from "react";
import { Scene } from "../../shared/types/layout";

interface Props {
  scenes: Scene[];
  bus: {
    ambienceId: string | null;
    musicId: string | null;
    sfxId: string | null;
  };
}

export const PlayerAudioBus: React.FC<Props> = ({ scenes, bus }) => {
  const ambienceRef = useRef<HTMLAudioElement | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const sfxRef = useRef<HTMLAudioElement | null>(null);

  const getScene = (id: string | null) =>
    id ? scenes.find(s => s.id === id && s.type === "audio") ?? null : null;

  const ambience = getScene(bus.ambienceId);
  const music = getScene(bus.musicId);
  const sfx = getScene(bus.sfxId);

  useEffect(() => {
    const el = ambienceRef.current;
    if (!el) return;
    if (ambience?.mediaPath) {
      el.src = ambience.mediaPath;
      el.loop = ambience.options?.loop ?? true;
      el.play().catch(() => {});
    } else {
      el.pause();
      el.currentTime = 0;
    }
  }, [bus.ambienceId]);

  useEffect(() => {
    const el = musicRef.current;
    if (!el) return;
    if (music?.mediaPath) {
      el.src = music.mediaPath;
      el.loop = music.options?.loop ?? true;
      el.play().catch(() => {});
    } else {
      el.pause();
      el.currentTime = 0;
    }
  }, [bus.musicId]);

  useEffect(() => {
    const el = sfxRef.current;
    if (!el) return;
    if (sfx?.mediaPath) {
      el.src = sfx.mediaPath;
      el.loop = false;
      el.play().catch(() => {});
    } else {
      el.pause();
      el.currentTime = 0;
    }
  }, [bus.sfxId]);

  return (
    <>
      <audio ref={ambienceRef} />
      <audio ref={musicRef} />
      <audio ref={sfxRef} />
    </>
  );
};