import { useEffect, useState } from "react";
import { parseRoute } from "./app/routing";
import { ComparisonHome } from "./surfaces/ComparisonHome";
import { AdminSurface } from "./surfaces/admin/AdminSurface";
import { CutterWebSurface } from "./surfaces/cutter-web/CutterWebSurface";
import { CutterDesktopSurface } from "./surfaces/cutter-desktop/CutterDesktopSurface";

export function App() {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    if (!window.location.hash) window.location.hash = "#/comparison";
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (route.surface === "admin") {
    return <AdminSurface page={route.page} />;
  }

  if (route.surface === "cutter-web") {
    return <CutterWebSurface page={route.page} />;
  }

  if (route.surface === "cutter-desktop") {
    return <CutterDesktopSurface page={route.page} />;
  }

  return <ComparisonHome />;
}
