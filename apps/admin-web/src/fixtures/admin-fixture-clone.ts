import type {
  AdminCutterUser,
  AdminDashboardMetrics,
  AdminDataLoadingPlan,
  AdminRuntimeSettings,
  AdminSettingsConfig,
  AdminSourceFolder,
  UsageMetrics
} from "../api.ts";

export function cloneSettings(value: AdminSettingsConfig): AdminSettingsConfig {
  return {
    ...value,
    source_folders: value.source_folders.map((folder) => ({ ...folder })),
    artifact_library: { ...value.artifact_library },
    runtime_policy: { ...value.runtime_policy }
  };
}

export function cloneRuntimeSettings(value: AdminRuntimeSettings): AdminRuntimeSettings {
  return {
    ffmpeg: { ...value.ffmpeg },
    ffprobe: { ...value.ffprobe },
    asr: { ...value.asr, language_hints: [...value.asr.language_hints] }
  };
}

export function nextSourceFolderId(sourceFolders: AdminSourceFolder[]): string {
  let maxSuffix = BigInt(sourceFolders.length);

  for (const folder of sourceFolders) {
    const match = /^src_(\d+)$/.exec(folder.id);
    if (match) {
      const suffix = BigInt(match[1] ?? "0");
      if (suffix > maxSuffix) {
        maxSuffix = suffix;
      }
    }
  }

  return `src_${String(maxSuffix + 1n).padStart(3, "0")}`;
}

export function normalizeFixtureSourceFolder(
  previous: AdminSourceFolder | undefined,
  next: AdminSourceFolder
): AdminSourceFolder {
  if (!previous || previous.path === next.path) {
    return next;
  }

  return {
    ...next,
    last_scanned_at: "",
    discovered_video_count: 0,
    new_unprocessed_count: 0
  };
}

export function cloneUsageMetrics(value: UsageMetrics): UsageMetrics {
  return {
    ...value,
    recent_keywords: [...value.recent_keywords],
    most_used_source_video_ids: [...value.most_used_source_video_ids],
    users: value.users.map((user) => ({ ...user })),
    event_store: {
      ...value.event_store,
      malformed_lines: [...value.event_store.malformed_lines]
    }
  };
}

export function cloneDashboardMetrics(value: AdminDashboardMetrics): AdminDashboardMetrics {
  return {
    material: { ...value.material },
    transcript: { ...value.transcript },
    production: { ...value.production },
    usage: cloneUsageMetrics(value.usage),
    risk: { ...value.risk },
    runtime_load: {
      overall_status: value.runtime_load.overall_status,
      cpu: { ...value.runtime_load.cpu },
      memory: { ...value.runtime_load.memory },
      disk: { ...value.runtime_load.disk },
      network: { ...value.runtime_load.network },
      service: { ...value.runtime_load.service }
    },
    sources: {
      material: { ...value.sources.material },
      transcript: { ...value.sources.transcript },
      production: { ...value.sources.production },
      usage: { ...value.sources.usage },
      risk: { ...value.sources.risk },
      runtime_load: { ...value.sources.runtime_load }
    }
  };
}

export function cloneDataLoadingPlan(value: AdminDataLoadingPlan): AdminDataLoadingPlan {
  return {
    ...value,
    endpoints: value.endpoints.map((endpoint) => ({ ...endpoint })),
    routes: value.routes.map((route) => ({
      ...route,
      endpoints: [...route.endpoints]
    }))
  };
}

export function cloneCutterUser(user: AdminCutterUser): AdminCutterUser {
  return {
    ...user,
    devices: user.devices.map((device) => ({ ...device }))
  };
}
