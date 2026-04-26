export function log(scope: string, msg: string, extra?: Record<string, unknown>) {
  const ts = new Date().toISOString().slice(11, 23);
  const tail = extra ? ` ${JSON.stringify(extra)}` : "";
  console.log(`${ts} [${scope}] ${msg}${tail}`);
}

export function logError(scope: string, err: unknown) {
  const ts = new Date().toISOString().slice(11, 23);
  if (err instanceof Error) {
    console.error(`${ts} [${scope}] ERROR: ${err.message}`);
    // postgres.js attaches { code, severity, detail, hint, where, cause } —
    // include them so DB errors aren't opaque "Failed query" wrappers.
    const extra: Record<string, unknown> = {};
    for (const k of ["code", "severity", "detail", "hint", "where", "table", "column", "constraint"]) {
      const v = (err as unknown as Record<string, unknown>)[k];
      if (v !== undefined) extra[k] = v;
    }
    if (Object.keys(extra).length > 0) {
      console.error(`${ts} [${scope}] cause: ${JSON.stringify(extra)}`);
    }
    if (err.cause) console.error(`${ts} [${scope}] err.cause:`, err.cause);
    if (err.stack) console.error(err.stack);
  } else {
    console.error(`${ts} [${scope}] ERROR:`, err);
  }
}
