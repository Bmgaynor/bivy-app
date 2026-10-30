/**
 * One JSON object per line on stdout/stderr. The homelab's Alloy collects
 * container output into Loki, where `| json` makes these fields queryable:
 *   {container="bivy"} | json | level="error"
 */
type Fields = Record<string, unknown>;

function serialize(value: unknown): unknown {
  // Error properties are non-enumerable, so JSON.stringify would emit {}
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

function write(
  level: "info" | "warn" | "error",
  message: string,
  fields: Fields,
) {
  const entry: Fields = { time: new Date().toISOString(), level, message };
  for (const [key, value] of Object.entries(fields))
    entry[key] = serialize(value);
  const line = JSON.stringify(entry);
  if (level === "info") console.log(line);
  else console.error(line);
}

export const log = {
  info: (message: string, fields: Fields = {}) =>
    write("info", message, fields),
  warn: (message: string, fields: Fields = {}) =>
    write("warn", message, fields),
  error: (message: string, fields: Fields = {}) =>
    write("error", message, fields),
};
