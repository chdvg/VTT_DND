// src/state/useAppData.ts

import { useEffect, useState } from "react";
import { AppData, LayoutConfig } from "../types/layout";

export function useAppData() {
  const [data, setData] = useState<AppData | null>(null);

  useEffect(() => {
    window.electronAPI.getAppData().then(setData);

    window.electronAPI.onDataUpdated(() => {
      window.electronAPI.getAppData().then(setData);
    });
  }, []);

  const save = (newData: AppData) => {
    setData(newData);
    window.electronAPI.saveAppData(newData);
  };

  const activeLayout: LayoutConfig | null =
    data && data.activeLayoutId
      ? data.layouts.find(l => l.id === data.activeLayoutId) ?? null
      : null;

  return { data, activeLayout, save };
}