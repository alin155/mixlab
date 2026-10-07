import React from "react";
import { createRoot } from "react-dom/client";
import { SmartApp } from "./SmartApp.tsx";
import "./styles.css";
createRoot(document.getElementById("root")!).render(<React.StrictMode><SmartApp /></React.StrictMode>);
