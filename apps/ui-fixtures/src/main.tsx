import "@mixlab/ui-foundation/tokens.css";
import "@mixlab/ui-foundation/layout.css";
import "./styles.css";
import { createRoot } from "react-dom/client";
import { AdminFixture } from "./AdminFixture.tsx";
import { CutterFixture } from "./CutterFixture.tsx";

const root = document.querySelector<HTMLDivElement>("#root");

if (!root) {
  throw new Error("root element not found");
}

function FixtureApp() {
  const hash = window.location.hash.replace("#/", "");
  const surface = hash === "admin" ? "admin" : "cutter";

  return (
    <div data-ml-fixture-ready="true" data-surface={surface}>
      {surface === "admin" ? <AdminFixture /> : <CutterFixture />}
    </div>
  );
}

createRoot(root).render(<FixtureApp />);
