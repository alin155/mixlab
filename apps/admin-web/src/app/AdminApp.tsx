import { useEffect, useMemo, useState } from "react";
import {
  InspectorPanel,
  MacWindow,
  Sidebar,
  UnifiedToolbar
} from "@mixlab/ui-foundation";
import {
  createAdminApiClient,
  createFixtureAdminApiClient,
  loadAdminDashboardData,
  type AdminDashboardData
} from "../api.ts";
import { DashboardPage } from "../features/dashboard/DashboardPage.tsx";
import { DoctorPage } from "../features/doctor/DoctorPage.tsx";
import { IndexPublishPage } from "../features/index-publish/IndexPublishPage.tsx";
import { LibrarySettingsPage } from "../features/library-settings/LibrarySettingsPage.tsx";
import { PreprocessJobsPage } from "../features/preprocess-jobs/PreprocessJobsPage.tsx";
import { SettingsPage } from "../features/settings/SettingsPage.tsx";
import { SourceVideosPage } from "../features/source-videos/SourceVideosPage.tsx";
import {
  ADMIN_NAV_ITEMS,
  routeFromHash,
  routeToHash,
  type AdminRoute
} from "./navigation.ts";

function createRuntimeClient() {
  const baseUrl = import.meta.env.VITE_MIXLAB_ADMIN_API_BASE_URL;

  return baseUrl
    ? createAdminApiClient({ base_url: baseUrl })
    : createFixtureAdminApiClient();
}

function routeTitle(route: AdminRoute): string {
  return ADMIN_NAV_ITEMS.find((item) => item.route === route)?.label ?? "仪表盘";
}

function renderPage(route: AdminRoute, data: AdminDashboardData) {
  if (route === "library-settings") {
    return <LibrarySettingsPage data={data} />;
  }

  if (route === "source-videos") {
    return <SourceVideosPage data={data} />;
  }

  if (route === "preprocess-jobs") {
    return <PreprocessJobsPage data={data} />;
  }

  if (route === "index-publish") {
    return <IndexPublishPage data={data} />;
  }

  if (route === "doctor") {
    return <DoctorPage data={data} />;
  }

  if (route === "settings") {
    return <SettingsPage data={data} />;
  }

  return <DashboardPage data={data} />;
}

export function AdminApp() {
  const [route, setRoute] = useState<AdminRoute>(() => routeFromHash(window.location.hash));
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [error, setError] = useState("");
  const client = useMemo(createRuntimeClient, []);

  useEffect(() => {
    const listener = () => setRoute(routeFromHash(window.location.hash));
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadAdminDashboardData(client)
      .then((result) => {
        if (!cancelled) {
          setData(result);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "管理端数据加载失败");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client]);

  const navItems = ADMIN_NAV_ITEMS.map((item) => ({
    label: item.label,
    icon: item.icon,
    href: routeToHash(item.route)
  }));

  return (
    <main className="admin-app" data-admin-web-ready={data ? "true" : "false"}>
      <MacWindow title={`MixLab V3 - 素材库管理端 / ${routeTitle(route)}`} meta={data?.status.index_status ?? "加载中"}>
        <div className="admin-shell">
          <Sidebar items={navItems} active={routeTitle(route)} />
          <section className="admin-workspace">
            <UnifiedToolbar
              title="MixLab V3 - 素材库管理端"
              libraryLabel={data?.status.root_path ?? "/Volumes/PublicLibrary"}
              healthLabel={data?.doctor.summary.fail ? "需处理" : "健康"}
              actions={[]}
            />
            <section className="admin-content-split">
              {error ? (
                <InspectorPanel title="加载失败">
                  <p>{error}</p>
                </InspectorPanel>
              ) : data ? (
                renderPage(route, data)
              ) : (
                <InspectorPanel title="加载中">
                  <p>正在读取素材库管理端数据</p>
                </InspectorPanel>
              )}
            </section>
          </section>
        </div>
      </MacWindow>
    </main>
  );
}
