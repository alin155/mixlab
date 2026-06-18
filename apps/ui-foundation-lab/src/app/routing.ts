export type Surface = "comparison" | "admin" | "cutter-web" | "cutter-desktop";

export interface RouteState {
  surface: Surface;
  page: string;
}

const defaultPages: Record<Surface, string> = {
  comparison: "home",
  admin: "dashboard",
  "cutter-web": "project-home",
  "cutter-desktop": "project-home"
};

export function parseRoute(hash: string): RouteState {
  const normalized = hash.replace(/^#\/?/, "").trim();
  if (!normalized || normalized === "comparison") {
    return { surface: "comparison", page: "home" };
  }

  const [surfacePart, pagePart] = normalized.split("/");
  const surface = isSurface(surfacePart) ? surfacePart : "comparison";
  return {
    surface,
    page: pagePart || defaultPages[surface]
  };
}

export function routeTo(surface: Surface, page?: string): string {
  if (surface === "comparison") return "#/comparison";
  return `#/${surface}/${page || defaultPages[surface]}`;
}

function isSurface(value: string): value is Surface {
  return value === "comparison" || value === "admin" || value === "cutter-web" || value === "cutter-desktop";
}
