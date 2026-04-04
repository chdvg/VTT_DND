import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { HomeScreen } from "../../HomeScreen";
import { CustomizeScreen } from "../../CustomizeScreen";
import { SessionLogView } from "../../SessionLogView";

type View = "home" | "customize" | "logs";

function App() {
  const [view, setView] = useState<View>("home");

  if (view === "customize") return <CustomizeScreen onBack={() => setView("home")} />;
  if (view === "logs") return <SessionLogView onBack={() => setView("home")} />;

  return (
    <HomeScreen
      onCustomize={() => setView("customize")}
      onViewLogs={() => setView("logs")}
    />
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);