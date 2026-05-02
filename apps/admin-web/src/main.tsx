import "@mixlab/ui-foundation/tokens.css";
import "@mixlab/ui-foundation/layout.css";
import "./styles.css";
import { createRoot } from "react-dom/client";
import { AdminApp } from "./app/AdminApp.tsx";

const root = document.querySelector<HTMLDivElement>("#root");

if (!root) {
  throw new Error("admin root not found");
}

createRoot(root).render(<AdminApp />);
