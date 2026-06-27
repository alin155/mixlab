import path from "node:path";

export function adminMixlabRoot(libraryRoot: string): string {
  return path.join(libraryRoot, ".mixlab-library");
}

export function adminSourceVideosRoot(libraryRoot: string): string {
  return path.join(libraryRoot, "source-videos");
}

export function adminVideosRoot(libraryRoot: string): string {
  return path.join(adminMixlabRoot(libraryRoot), "videos");
}

export function adminLibraryManifestPath(libraryRoot: string): string {
  return path.join(adminMixlabRoot(libraryRoot), "library.json");
}

export function adminSettingsPath(libraryRoot: string): string {
  return path.join(adminMixlabRoot(libraryRoot), "admin-settings.json");
}

export function adminSourceVideoManifestPath(
  libraryRoot: string,
  sourceVideoId: string
): string {
  return path.join(adminVideosRoot(libraryRoot), sourceVideoId, "source-video.json");
}

export function adminPreprocessJobPath(
  libraryRoot: string,
  sourceVideoId: string
): string {
  return path.join(adminVideosRoot(libraryRoot), sourceVideoId, "preprocess-job.json");
}

export function adminSourceTranscriptIndexRoot(libraryRoot: string): string {
  return path.join(adminMixlabRoot(libraryRoot), "indexes", "source-transcript-index");
}

export function adminSourceTranscriptCurrentPath(libraryRoot: string): string {
  return path.join(adminSourceTranscriptIndexRoot(libraryRoot), "current.json");
}

export function adminSourceTranscriptIndexSqlitePath(
  libraryRoot: string,
  indexVersion: string
): string {
  return path.join(adminSourceTranscriptIndexRoot(libraryRoot), indexVersion, "index.sqlite");
}
