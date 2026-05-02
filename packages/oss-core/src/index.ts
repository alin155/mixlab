export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export interface BuildAsrAudioObjectKeyInput {
  prefix: string;
  library_id: string;
  source_video_id: string;
  extension: string;
}

export interface AliyunOssPutOptions {
  headers?: Record<string, string>;
}

export interface AliyunOssSignatureOptions {
  expires?: number;
}

export interface AliyunOssClientLike {
  put(
    objectKey: string,
    localFilePath: string,
    options?: AliyunOssPutOptions
  ): Promise<unknown>;
  signatureUrl(objectKey: string, options?: AliyunOssSignatureOptions): string;
}

export interface AliyunOssRuntimeConfig {
  bucket: string;
  endpoint: string;
  region?: string;
  access_key_id?: string;
  access_key_secret?: string;
  signed_url_expires_seconds?: number;
  public_base_url?: string;
  url_mode?: OssUploadedFileUrlMode;
  object_key_prefix?: string;
}

export interface LiveOssUploadReadinessReport {
  enabled: boolean;
  enable_flag: typeof LIVE_OSS_UPLOAD_ENABLE_FLAG;
  required_env_keys: readonly string[];
  missing_env_keys: string[];
}

export interface CreateAliyunOssUploaderInput extends AliyunOssRuntimeConfig {
  client: AliyunOssClientLike;
}

export interface AliyunOssClientConfig {
  bucket: string;
  endpoint: string;
  region?: string;
  accessKeyId: string;
  accessKeySecret: string;
  secure: true;
}

export interface AliyunOssConstructor {
  new (config: AliyunOssClientConfig): AliyunOssClientLike;
}

export interface CreateAliyunOssUploaderFromRuntimeOptions {
  client_constructor?: AliyunOssConstructor;
}

export type OssUploadedFileUrlMode = "signed-url" | "public-url";

export interface UploadAsrAudioInput {
  local_file_path: string;
  object_key: string;
  content_type?: string;
}

export interface UploadedAsrAudio {
  object_key: string;
  file_url: string;
  url_mode: OssUploadedFileUrlMode;
}

export interface AliyunOssUploader {
  uploadAsrAudio(input: UploadAsrAudioInput): Promise<UploadedAsrAudio>;
}

export const LIVE_OSS_UPLOAD_ENABLE_FLAG = "MIXLAB_ENABLE_LIVE_OSS_UPLOAD";

const ALIYUN_OSS_REQUIRED_ENV_KEYS = [
  "ALIYUN_OSS_BUCKET",
  "ALIYUN_OSS_ENDPOINT",
  "ALIYUN_OSS_ACCESS_KEY_ID",
  "ALIYUN_OSS_ACCESS_KEY_SECRET"
] as const;

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

function optionalTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function requiredEnvValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  return optionalTrimmed(env[key]);
}

function missingRequiredAliyunOssEnvKeys(env: NodeJS.ProcessEnv): string[] {
  return ALIYUN_OSS_REQUIRED_ENV_KEYS.filter((key) => !requiredEnvValue(env, key));
}

function assertSafeIdentifier(name: string, value: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`${name} must contain only letters, numbers, underscores, or hyphens`);
  }
}

export function validateOssObjectKey(objectKey: string): ValidationResult {
  const errors: string[] = [];

  if (objectKey.trim() === "") {
    errors.push("object key is required");
  }

  if (objectKey.startsWith("/")) {
    errors.push("object key must be relative");
  }

  if (objectKey.includes("\\")) {
    errors.push("object key must use forward slashes");
  }

  if (objectKey.split("/").includes("..")) {
    errors.push("object key must not contain traversal segments");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

export function buildAsrAudioObjectKey(input: BuildAsrAudioObjectKeyInput): string {
  const prefix = trimSlashes(input.prefix);
  const extension = input.extension.replace(/^\./, "");

  assertSafeIdentifier("library_id", input.library_id);
  assertSafeIdentifier("source_video_id", input.source_video_id);
  assertSafeIdentifier("extension", extension);

  const objectKey = `${prefix}/${input.library_id}/asr-audio/${input.source_video_id}/audio.${extension}`;
  const validation = validateOssObjectKey(objectKey);

  if (!validation.ok) {
    throw new Error(validation.errors.join("; "));
  }

  return objectKey;
}

function assertValidObjectKey(objectKey: string): void {
  const validation = validateOssObjectKey(objectKey);

  if (!validation.ok) {
    throw new Error(validation.errors.join("; "));
  }
}

function publicUrl(baseUrl: string, objectKey: string): string {
  return `${trimSlashes(baseUrl)}/${objectKey}`;
}

export function createAliyunOssUploader(
  input: CreateAliyunOssUploaderInput
): AliyunOssUploader {
  const urlMode = input.url_mode ?? "signed-url";
  const signedUrlExpiresSeconds = input.signed_url_expires_seconds ?? 900;

  return {
    async uploadAsrAudio(uploadInput) {
      assertValidObjectKey(uploadInput.object_key);

      await input.client.put(uploadInput.object_key, uploadInput.local_file_path, {
        ...(uploadInput.content_type
          ? {
              headers: {
                "Content-Type": uploadInput.content_type
              }
            }
          : {})
      });

      if (urlMode === "public-url") {
        const baseUrl =
          input.public_base_url ?? `https://${input.bucket}.${trimSlashes(input.endpoint)}`;

        return {
          object_key: uploadInput.object_key,
          file_url: publicUrl(baseUrl, uploadInput.object_key),
          url_mode: "public-url"
        };
      }

      return {
        object_key: uploadInput.object_key,
        file_url: input.client.signatureUrl(uploadInput.object_key, {
          expires: signedUrlExpiresSeconds
        }),
        url_mode: "signed-url"
      };
    }
  };
}

export function isLiveOssUploadEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return optionalTrimmed(env[LIVE_OSS_UPLOAD_ENABLE_FLAG]) === "1";
}

export function buildLiveOssUploadReadinessReport(
  env: NodeJS.ProcessEnv = process.env
): LiveOssUploadReadinessReport {
  return {
    enabled: isLiveOssUploadEnabled(env),
    enable_flag: LIVE_OSS_UPLOAD_ENABLE_FLAG,
    required_env_keys: ALIYUN_OSS_REQUIRED_ENV_KEYS,
    missing_env_keys: missingRequiredAliyunOssEnvKeys(env)
  };
}

export function redactUrlQueryForLogging(url: string): string {
  const queryIndex = url.indexOf("?");

  if (queryIndex === -1) {
    return url;
  }

  return `${url.slice(0, queryIndex)}?[redacted-query]`;
}

export function loadAliyunOssRuntimeConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): AliyunOssRuntimeConfig {
  const missingKeys = missingRequiredAliyunOssEnvKeys(env);

  if (missingKeys.length > 0) {
    throw new Error(`missing Aliyun OSS env vars: ${missingKeys.join(", ")}`);
  }

  const urlMode = optionalTrimmed(env.MIXLAB_OSS_URL_MODE);

  if (urlMode && urlMode !== "signed-url" && urlMode !== "public-url") {
    throw new Error("MIXLAB_OSS_URL_MODE must be signed-url or public-url");
  }

  const normalizedUrlMode = urlMode as OssUploadedFileUrlMode | undefined;
  const signedUrlExpiresRaw = optionalTrimmed(env.MIXLAB_OSS_SIGNED_URL_EXPIRES_SECONDS);
  let signedUrlExpiresSeconds: number | undefined;

  if (signedUrlExpiresRaw) {
    const parsedSignedUrlExpiresSeconds = Number.parseInt(signedUrlExpiresRaw, 10);

    if (
      !Number.isFinite(parsedSignedUrlExpiresSeconds) ||
      parsedSignedUrlExpiresSeconds <= 0
    ) {
      throw new Error("MIXLAB_OSS_SIGNED_URL_EXPIRES_SECONDS must be greater than 0");
    }

    signedUrlExpiresSeconds = parsedSignedUrlExpiresSeconds;
  }

  return {
    bucket: requiredEnvValue(env, "ALIYUN_OSS_BUCKET") ?? "",
    endpoint: requiredEnvValue(env, "ALIYUN_OSS_ENDPOINT") ?? "",
    ...(optionalTrimmed(env.ALIYUN_OSS_REGION)
      ? { region: optionalTrimmed(env.ALIYUN_OSS_REGION) }
      : {}),
    access_key_id: requiredEnvValue(env, "ALIYUN_OSS_ACCESS_KEY_ID"),
    access_key_secret: requiredEnvValue(env, "ALIYUN_OSS_ACCESS_KEY_SECRET"),
    ...(normalizedUrlMode ? { url_mode: normalizedUrlMode } : {}),
    ...(optionalTrimmed(env.MIXLAB_OSS_PUBLIC_BASE_URL)
      ? { public_base_url: optionalTrimmed(env.MIXLAB_OSS_PUBLIC_BASE_URL) }
      : {}),
    ...(signedUrlExpiresSeconds
      ? { signed_url_expires_seconds: signedUrlExpiresSeconds }
      : {}),
    ...(optionalTrimmed(env.MIXLAB_OSS_OBJECT_PREFIX)
      ? { object_key_prefix: optionalTrimmed(env.MIXLAB_OSS_OBJECT_PREFIX) }
      : {})
  };
}

export function buildAliyunOssClientConfig(
  config: AliyunOssRuntimeConfig
): AliyunOssClientConfig {
  if (!config.access_key_id || !config.access_key_secret) {
    throw new Error("Aliyun OSS access_key_id and access_key_secret are required");
  }

  return {
    bucket: config.bucket,
    endpoint: config.endpoint,
    ...(config.region ? { region: config.region } : {}),
    accessKeyId: config.access_key_id,
    accessKeySecret: config.access_key_secret,
    secure: true
  };
}

export function createAliyunOssClient(
  config: AliyunOssRuntimeConfig,
  clientConstructor: AliyunOssConstructor
): AliyunOssClientLike {
  return new clientConstructor(buildAliyunOssClientConfig(config));
}

export async function importAliyunOssConstructor(): Promise<AliyunOssConstructor> {
  const module = (await import("ali-oss")) as unknown as {
    default?: AliyunOssConstructor;
  } & AliyunOssConstructor;

  return module.default ?? module;
}

export async function createAliyunOssUploaderFromRuntimeConfig(
  config: AliyunOssRuntimeConfig,
  options: CreateAliyunOssUploaderFromRuntimeOptions = {}
): Promise<AliyunOssUploader> {
  const clientConstructor = options.client_constructor ?? (await importAliyunOssConstructor());

  return createAliyunOssUploader({
    ...config,
    client: createAliyunOssClient(config, clientConstructor)
  });
}

export function redactAliyunOssRuntimeConfig(
  config: AliyunOssRuntimeConfig
): AliyunOssRuntimeConfig {
  return {
    ...config,
    ...(config.access_key_id ? { access_key_id: "***" } : {}),
    ...(config.access_key_secret ? { access_key_secret: "***" } : {})
  };
}
