import {
  getAdminHealth,
  getAdminPreprocessSafety,
  type AdminHealthQueryApiInput
} from "./admin-health-query.ts";

export interface AdminHealthReadServicesApiInput extends AdminHealthQueryApiInput {}

export interface AdminHealthReadServicesStatusReadModel {
  ids_by_status: {
    processing: string[];
  };
}

export interface CreateAdminHealthReadServicesInput<
  TApiInput extends AdminHealthReadServicesApiInput
> {
  read_source_video_status_read_model(libraryRoot: string): Promise<AdminHealthReadServicesStatusReadModel>;
  read_primary_source_videos_path(libraryRoot: string): Promise<string>;
}

export interface AdminHealthReadServices<
  TApiInput extends AdminHealthReadServicesApiInput
> {
  read_processing_source_video_ids(libraryRoot: string): Promise<string[]>;
  read_preprocess_safety(input: {
    api_input: TApiInput;
    include_processing_guard: boolean;
  }): ReturnType<typeof getAdminPreprocessSafety>;
  read_health(input: TApiInput, options: { deep: boolean }): ReturnType<typeof getAdminHealth>;
}

export function createAdminHealthReadServices<
  TApiInput extends AdminHealthReadServicesApiInput
>(
  input: CreateAdminHealthReadServicesInput<TApiInput>
): AdminHealthReadServices<TApiInput> {
  async function readProcessingSourceVideoIds(libraryRoot: string): Promise<string[]> {
    const model = await input.read_source_video_status_read_model(libraryRoot);
    return model.ids_by_status.processing;
  }

  return {
    read_processing_source_video_ids: readProcessingSourceVideoIds,
    read_preprocess_safety(safetyInput) {
      return getAdminPreprocessSafety({
        ...safetyInput,
        deps: {
          read_processing_source_video_ids: readProcessingSourceVideoIds
        }
      });
    },
    read_health(apiInput, options) {
      return getAdminHealth({
        api_input: apiInput,
        deep: options.deep,
        deps: {
          read_primary_source_videos_path: input.read_primary_source_videos_path,
          read_processing_source_video_ids: readProcessingSourceVideoIds
        }
      });
    }
  };
}
