import { createPortal } from "react-dom";
import { useEffect, useState, type ReactNode } from "react";

/**
 * Renders page actions into the CutterTopbar actions slot when available.
 * Tests and non-browser renders fall back to inline rendering.
 */
export function TopbarActions({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(() =>
    typeof document === "undefined" ? null : document.getElementById("cutter-topbar-actions")
  );

  useEffect(() => {
    setTarget(document.getElementById("cutter-topbar-actions"));
  }, []);

  return target ? createPortal(children, target) : <>{children}</>;
}
