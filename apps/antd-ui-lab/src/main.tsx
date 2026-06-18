import "antd/dist/reset.css";
import "./styles.css";
import { createRoot } from "react-dom/client";
import { AntdLabRoot } from "./app/AntdLabRoot.tsx";

const root = document.querySelector<HTMLDivElement>("#root");

if (!root) {
  throw new Error("root element not found");
}

createRoot(root).render(<AntdLabRoot />);
