import "@mixlab/ui-foundation/tokens.css";
import "@mixlab/ui-foundation/layout.css";
import "./styles.css";
import { createRoot } from "react-dom/client";
import { AdminFixture } from "./AdminFixture.tsx";
import { CutterFixture } from "./CutterFixture.tsx";
import { V1AdminFixture, V1CutterFixture } from "./V1Fixture.tsx";

const root = document.querySelector<HTMLDivElement>("#root");

if (!root) {
  throw new Error("root element not found");
}

function FixtureApp() {
  const hash = window.location.hash.replace("#/", "");
  const surface = hash || "v1-cutter";

  return (
    <div data-ml-fixture-ready="true" data-surface={surface}>
      {surface === "admin" ? <AdminFixture /> : null}
      {surface === "cutter" ? <CutterFixture /> : null}
      {surface === "v1-admin" ? <V1AdminFixture /> : null}
      {surface === "v1-cutter" ? <V1CutterFixture /> : null}
    </div>
  );
}

createRoot(root).render(<FixtureApp />);
