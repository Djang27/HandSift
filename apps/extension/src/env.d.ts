// Build-time environment variables (see wxt.config.ts and .env.* files).
interface ImportMetaEnv {
  /** Base URL of the HandSift Worker. */
  readonly WXT_WORKER_URL: string;
}
