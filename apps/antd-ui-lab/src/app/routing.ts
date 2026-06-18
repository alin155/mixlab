import { useEffect, useState } from "react";
import type { SurfaceKey } from "../domain/fixtures.ts";

export function readHash(): { surface: SurfaceKey; page: string } {
  const [surface = "comparison", page = ""] = window.location.hash.replace(/^#\/?/, "").split("/");

  if (surface === "admin" || surface === "cutter-web" || surface === "cutter-desktop") {
    return { surface, page };
  }

  return { surface: "comparison", page: "" };
}

export function setHash(surface: SurfaceKey, page?: string) {
  window.location.hash = page ? `#/${surface}/${page}` : `#/${surface}`;
}

export function useHashRoute() {
  const [route, setRoute] = useState(readHash);

  useEffect(() => {
    const onHashChange = () => setRoute(readHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return route;
}
