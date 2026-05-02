import "@mixlab/ui-foundation/tokens.css";
import "@mixlab/ui-foundation/layout.css";
import "./styles.css";
import { createRoot } from "react-dom/client";
import { CutterApp } from "./app/CutterApp.tsx";

const root = document.querySelector<HTMLDivElement>("#root");

if (!root) {
  throw new Error("cutter root not found");
}

createRoot(root).render(<CutterApp />);
