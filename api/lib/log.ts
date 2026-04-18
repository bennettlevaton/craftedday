export function log(scope: string, msg: string, extra?: Record<string, unknown>) {
  const ts = new Date().toISOString().slice(11, 23);
  const tail = extra ? ` ${JSON.stringify(extra)}` : "";
  console.log(`${ts} [${scope}] ${msg}${tail}`);
}

export function logError(scope: string, err: unknown) {
  const ts = new Date().toISOString().slice(11, 23);
  if (err instanceof Error) {
    console.error(`${ts} [${scope}] ERROR: ${err.message}`);
    if (err.stack) console.error(err.stack);
  } else {
    console.error(`${ts} [${scope}] ERROR:`, err);
  }
}
