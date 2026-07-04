type RuntimeEnvName =
  | "ALLOWED_EMAILS"
  | "AUTH_DISABLED"
  | "URL"
  | "NETLIFY"
  | "AWS_LAMBDA_FUNCTION_NAME"
  | "DATABASE_BACKEND"
  | "GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON"
  | "GOOGLE_APPLICATION_CREDENTIALS"
  | "GOOGLE_CLOUD_PROJECT"
  | "GOOGLE_CLOUD_STORAGE_BUCKET"
  | "OPENAI_API_KEY"
  | "OPENAI_MODEL"
  | "OPENAI_TRANSCRIPTION_MODEL"
  | "SENDGRID_API_KEY"
  | "DIGEST_FROM_EMAIL"
  | "DIGEST_FROM_NAME"
  | "DIGEST_TIMEZONE"
  | "DIGEST_SECRET";

// Split keys so esbuild/Netlify bundlers cannot inline build-time empties.
const RUNTIME_ENV_KEY: Record<RuntimeEnvName, string> = {
  ALLOWED_EMAILS: "ALLOW" + "ED_EMAILS",
  AUTH_DISABLED: "AUTH" + "_DISABLED",
  URL: "UR" + "L",
  NETLIFY: "NET" + "LIFY",
  AWS_LAMBDA_FUNCTION_NAME: "AWS" + "_LAMBDA_FUNCTION_NAME",
  DATABASE_BACKEND: "DATABASE" + "_BACKEND",
  GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON: "GOOGLE_CLOUD_SERVICE_ACCOUNT" + "_JSON",
  GOOGLE_APPLICATION_CREDENTIALS: "GOOGLE_APPLICATION" + "_CREDENTIALS",
  GOOGLE_CLOUD_PROJECT: "GOOGLE_CLOUD" + "_PROJECT",
  GOOGLE_CLOUD_STORAGE_BUCKET: "GOOGLE_CLOUD_STORAGE" + "_BUCKET",
  OPENAI_API_KEY: "OPENAI" + "_API_KEY",
  OPENAI_MODEL: "OPENAI" + "_MODEL",
  OPENAI_TRANSCRIPTION_MODEL: "OPENAI_TRANSCRIPTION" + "_MODEL",
  SENDGRID_API_KEY: "SENDGRID" + "_API_KEY",
  DIGEST_FROM_EMAIL: "DIGEST" + "_FROM_EMAIL",
  DIGEST_FROM_NAME: "DIGEST" + "_FROM_NAME",
  DIGEST_TIMEZONE: "DIGEST" + "_TIMEZONE",
  DIGEST_SECRET: "DIGEST" + "_SECRET"
};

export function readRuntimeEnv(name: RuntimeEnvName) {
  const env = globalThis.process?.env;
  if (!env) {
    return undefined;
  }
  return env[RUNTIME_ENV_KEY[name]];
}

export function isNetlifyRuntime() {
  return readRuntimeEnv("NETLIFY") === "true" || Boolean(readRuntimeEnv("AWS_LAMBDA_FUNCTION_NAME"));
}

export function useGcsBackend() {
  return Boolean(
    isNetlifyRuntime() ||
      readRuntimeEnv("DATABASE_BACKEND") === "gcs" ||
      readRuntimeEnv("GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON")
  );
}

export function storageConfig() {
  const hasServiceAccount = Boolean(readRuntimeEnv("GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON"));
  const hasBucket = Boolean(readRuntimeEnv("GOOGLE_CLOUD_STORAGE_BUCKET"));
  const hasProject = Boolean(readRuntimeEnv("GOOGLE_CLOUD_PROJECT"));
  return {
    storageBackend: useGcsBackend() ? "gcs" : "sqlite",
    hasServiceAccount,
    hasBucket,
    hasProject,
    storageConfigured: hasServiceAccount && hasBucket && hasProject
  };
}
