import { App as AntApp, ConfigProvider } from "antd";
import { antdLabTheme } from "./theme.ts";
import { useHashRoute } from "./routing.ts";
import { AdminSurface, ComparisonHome, CutterSurface, DesktopSurface } from "../surfaces/ZeroSurfaces.tsx";

export function AntdLabRoot() {
  const route = useHashRoute();

  return (
    <ConfigProvider theme={antdLabTheme}>
      <AntApp>
        {route.surface === "admin" ? <AdminSurface page={route.page} /> : null}
        {route.surface === "cutter-web" ? <CutterSurface page={route.page} /> : null}
        {route.surface === "cutter-desktop" ? <DesktopSurface page={route.page} /> : null}
        {route.surface === "comparison" ? <ComparisonHome /> : null}
      </AntApp>
    </ConfigProvider>
  );
}
