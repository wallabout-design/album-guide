// Structured logs for the Worker: one JSON object per line, so Workers Logs can
// filter on fields. Every line carries `level`, `msg`, `route`, `requestId` and
// `version`, as standards/monitoring.md and site-contract.md name them. Same
// shape as rr's app/lib/log.ts. Code in worker/ gets a logger for the request
// it is answering with logFor(); a caught error goes in as `err` and becomes
// `error` and `stack`.

export type Level = 'debug' | 'info' | 'warn' | 'error';
export type Fields = Record<string, unknown>;

/** The Workers version metadata binding (wrangler.jsonc, `version_metadata`). */
export type VersionEnv = { CF_VERSION_METADATA?: { id?: string; tag?: string } };

export type LogContext = { route: string; requestId: string; version: string };

export type Logger = Record<Level, (msg: string, fields?: Fields) => void>;

/** The deployed version: the upload's tag when one is set, else its id; "dev" when there is no binding (tests, local runs). */
export function versionOf(env: VersionEnv): string {
  const meta = env.CF_VERSION_METADATA;
  return meta?.tag || meta?.id || 'dev';
}

/** Cloudflare's per-request id (cf-ray), so one request's lines can be found together. */
export function requestIdOf(request: Request): string {
  return request.headers.get('cf-ray') ?? crypto.randomUUID();
}

function errorFields(err: unknown): Fields {
  if (err instanceof Error) return { error: err.message, stack: err.stack };
  return err === undefined ? {} : { error: String(err) };
}

export function logLine(level: Level, msg: string, context: LogContext, fields: Fields = {}): string {
  const { err, ...rest } = fields;
  // The standard fields come last, so nothing a call site passes can overwrite them.
  return JSON.stringify({ ...rest, ...errorFields(err), level, msg, ...context });
}

/** A logger for one request, answered by `route` (the name of the handler: admin, collections, event, sentry, api). */
export function logFor(env: VersionEnv, request: Request, route: string): Logger {
  const context: LogContext = { route, requestId: requestIdOf(request), version: versionOf(env) };
  const emit = (level: Level) => (msg: string, fields?: Fields) => {
    const line = logLine(level, msg, context, fields);
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  };
  return { debug: emit('debug'), info: emit('info'), warn: emit('warn'), error: emit('error') };
}
