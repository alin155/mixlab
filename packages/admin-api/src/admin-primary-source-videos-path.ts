export interface AdminPrimarySourceVideosPathSourceFolder {
  path: string;
  enabled?: boolean;
}

export interface AdminPrimarySourceVideosPathSettings {
  source_folders: AdminPrimarySourceVideosPathSourceFolder[];
}

export interface ReadAdminPrimarySourceVideosPathInput<
  TSettings extends AdminPrimarySourceVideosPathSettings = AdminPrimarySourceVideosPathSettings
> {
  library_root: string;
  deps: {
    read_settings(libraryRoot: string): Promise<TSettings>;
    source_videos_root(libraryRoot: string): string;
  };
}

export function selectAdminPrimarySourceVideosPath(input: {
  settings: AdminPrimarySourceVideosPathSettings;
  fallback_source_videos_root: string;
}): string {
  const primaryFolder = input.settings.source_folders.find((folder) => folder.enabled)
    ?? input.settings.source_folders[0];

  return primaryFolder?.path ?? input.fallback_source_videos_root;
}

export async function readAdminPrimarySourceVideosPath<
  TSettings extends AdminPrimarySourceVideosPathSettings = AdminPrimarySourceVideosPathSettings
>(input: ReadAdminPrimarySourceVideosPathInput<TSettings>): Promise<string> {
  const settings = await input.deps.read_settings(input.library_root);

  return selectAdminPrimarySourceVideosPath({
    settings,
    fallback_source_videos_root: input.deps.source_videos_root(input.library_root)
  });
}

export function createAdminPrimarySourceVideosPathReader<
  TSettings extends AdminPrimarySourceVideosPathSettings = AdminPrimarySourceVideosPathSettings
>(deps: ReadAdminPrimarySourceVideosPathInput<TSettings>["deps"]) {
  return (libraryRoot: string): Promise<string> =>
    readAdminPrimarySourceVideosPath({
      library_root: libraryRoot,
      deps
    });
}
