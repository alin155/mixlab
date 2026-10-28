import {
  CutterReleaseBundleCorruptError,
  readCurrentCutterReleaseManifestV2Summary,
  verifyCutterReleaseBundle,
  type CutterReleaseManifestV2Summary,
  type CutterReleaseV2VerifyResult
} from "../../library-fs/src/cutter-release.ts";
import {
  apiError,
  apiOk,
  type AdminApiEnvelope
} from "./admin-route-adapter.ts";

export interface AdminReleaseV2RouteApiInput {
  library_root: string;
}

export interface AdminReleaseV2VerifyInput {
  library_root: string;
  release_id_or_version: string;
  max_files?: number;
}

export interface AdminReleaseV2RouteDeps {
  read_current_release_summary(libraryRoot: string): Promise<CutterReleaseManifestV2Summary>;
  verify_release(input: AdminReleaseV2VerifyInput): Promise<CutterReleaseV2VerifyResult>;
}

export function createAdminReleaseV2RouteDeps(): AdminReleaseV2RouteDeps {
  return {
    read_current_release_summary: readCurrentCutterReleaseManifestV2Summary,
    verify_release: verifyCutterReleaseBundle
  };
}

export type AdminReleaseV2RouteResult =
  | {
      handled: true;
      status_code: number;
      body: AdminApiEnvelope<unknown>;
    }
  | {
      handled: false;
    };

export interface HandleAdminReleaseV2RoutesInput<
  TApiInput extends AdminReleaseV2RouteApiInput
> {
  method: string;
  pathname: string;
  search_params: URLSearchParams;
  api_input: TApiInput;
  deps?: AdminReleaseV2RouteDeps;
}

export function matchAdminReleaseCurrentPath(pathname: string): boolean {
  return pathname === "/api/admin/releases/current";
}

export function matchAdminReleaseVerifyPath(pathname: string): string | null {
  const match = /^\/api\/admin\/releases\/([A-Za-z0-9][A-Za-z0-9._-]{0,199})\/verify$/.exec(pathname);

  return match?.[1] ?? null;
}

function parseVerifyMaxFiles(searchParams: URLSearchParams): number | undefined {
  const rawValue = searchParams.get("max_files")?.trim() ?? "";

  if (rawValue === "") {
    return undefined;
  }

  const parsed = Number.parseInt(rawValue, 10);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20_000) {
    return Number.NaN;
  }

  return parsed;
}

function releaseErrorResult(error: unknown): AdminReleaseV2RouteResult | null {
  if (error instanceof CutterReleaseBundleCorruptError) {
    // Never echo raw paths from the manifest/verification layer to unauthenticated callers.
    return {
      handled: true,
      status_code: 500,
      body: apiError(
        "RELEASE_BUNDLE_CORRUPT",
        "发布制品校验失败，当前发布可能已损坏，请保留现场并重新发布"
      )
    };
  }

  if ((error as NodeJS.ErrnoException).code === "ENOENT") {
    return {
      handled: true,
      status_code: 404,
      body: apiError("RELEASE_NOT_FOUND", "当前没有已发布的版本")
    };
  }

  return null;
}

export async function handleAdminReleaseV2Routes<
  TApiInput extends AdminReleaseV2RouteApiInput
>(
  input: HandleAdminReleaseV2RoutesInput<TApiInput>
): Promise<AdminReleaseV2RouteResult> {
  const deps = input.deps ?? createAdminReleaseV2RouteDeps();

  if (input.method === "GET" && matchAdminReleaseCurrentPath(input.pathname)) {
    try {
      const summary = await deps.read_current_release_summary(input.api_input.library_root);
      return {
        handled: true,
        status_code: 200,
        body: apiOk(summary)
      };
    } catch (error) {
      const mapped = releaseErrorResult(error);
      if (mapped) {
        return mapped;
      }

      throw error;
    }
  }

  const releaseIdOrVersion = matchAdminReleaseVerifyPath(input.pathname);

  if (input.method === "GET" && releaseIdOrVersion) {
    const maxFiles = parseVerifyMaxFiles(input.search_params);

    if (Number.isNaN(maxFiles)) {
      return {
        handled: true,
        status_code: 400,
        body: apiError(
          "VALIDATION_FAILED",
          "max_files 必须是 1 到 20000 之间的整数"
        )
      };
    }

    try {
      const result = await deps.verify_release({
        library_root: input.api_input.library_root,
        release_id_or_version: releaseIdOrVersion,
        ...(maxFiles !== undefined ? { max_files: maxFiles } : {})
      });

      if (!result.found) {
        return {
          handled: true,
          status_code: 404,
          body: apiError("RELEASE_NOT_FOUND", "指定发布版本不存在", {
            release_id_or_version: releaseIdOrVersion
          })
        };
      }

      // Verification executed successfully; "ok: false" is a report, not an HTTP failure.
      return {
        handled: true,
        status_code: 200,
        body: apiOk(result)
      };
    } catch (error) {
      const mapped = releaseErrorResult(error);
      if (mapped) {
        return mapped;
      }

      throw error;
    }
  }

  return { handled: false };
}
