// Redaction layer per docs/PROTOCOL.md section 4.
// Everything leaving the adapter passes through here; nothing below may throw.

const ELLIPSIS = "…";
const MASK = "•••";
const MAX_COMMAND = 80;

// key[=:]value secrets — keep the key, mask the value. The optional
// "bearer " swallow keeps `Authorization: Bearer xyz` masked as one unit.
const SECRET_KV =
  /(token|secret|password|passwd|pwd|api[_-]?key|authorization|bearer)(\s*[=:]\s*)(?:bearer\s+)?\S+/gi;
// Flag-style secrets separated by whitespace: `vault login --token s.abc`,
// `aws configure set aws_secret_access_key wJalr…`. Over-masking a benign
// word after "token" is an acceptable cost; leaking is not.
const SECRET_FLAG =
  /((?:--?[A-Za-z0-9-]*)?(?:token|secret|password|passwd|api[_-]?key|access[_-]?key)[A-Za-z0-9_-]*)\s+(?!\s*[-•])\S+/gi;
const BARE_BEARER = /\b(bearer)\s+\S+/gi;
const URL_CREDS = /(\/\/)[^/\s@]*:[^/\s@]*@/g;
// curl/wget-style inline credentials: `-u user:pass`, `--user user:pass`.
const USER_PASS_FLAG = /(\s(?:-u|--user)[= ]\s*[^\s:]+):\S+/g;
// MySQL's real password form is ATTACHED (`-pSECRET`); the spaced form is a
// database name. Mask the attached value for db-ish tools.
const MYSQL_LIKE = /\b(mysql|mysqldump|mariadb|psql|pg_dump|pg_restore|mongo|mongosh)\b/;
const ATTACHED_P = /(^|\s)-p(?!\s|$)\S+/g;
const LONG_RUN = /[A-Za-z0-9+/=]{35,}/g;

function truncate(s, max) {
  return s.length <= max ? s : s.slice(0, max - 1) + ELLIPSIS;
}

// File paths are long [A-Za-z0-9/] runs too; keep runs that LOOK like paths
// (leading /, ./, or ~/) — a slash alone is not proof (AWS secret keys
// contain slashes), so everything else gets masked.
function maskLongRun(run) {
  if (/^(\/|\.\/|~\/)/.test(run) && !/[+=]/.test(run)) return run;
  return MASK;
}

export function sanitizeCommand(cmd) {
  if (typeof cmd !== "string") return "";
  let s = cmd;

  // Heredoc bodies are inline documents (often file contents) — drop them.
  const heredoc = s.indexOf("<<");
  if (heredoc !== -1) s = s.slice(0, heredoc).trimEnd() + " <<" + ELLIPSIS;

  // Mask before collapsing newlines so \S+ values stop at line ends
  // instead of swallowing the "; " separator.
  s = s.replace(URL_CREDS, `$1${MASK}@`);
  s = s.replace(SECRET_KV, `$1$2${MASK}`);
  s = s.replace(SECRET_FLAG, `$1 ${MASK}`);
  s = s.replace(USER_PASS_FLAG, `$1:${MASK}`);
  s = s.replace(BARE_BEARER, `$1 ${MASK}`);
  // Attached `-pSECRET` is the real db-password form; the spaced form is
  // usually a database name, but masking it too costs nothing. Only for
  // db-ish tools — `tar -pxf` and `mkdir -p dir` must survive.
  if (MYSQL_LIKE.test(s)) {
    s = s.replace(ATTACHED_P, `$1-p${MASK}`);
    s = s.replace(/(^|\s)-p +\S+/g, `$1-p ${MASK}`);
  }
  s = s.replace(LONG_RUN, maskLongRun);

  s = s.replace(/\s*[\r\n]+\s*/g, "; ");
  return truncate(s.trim(), MAX_COMMAND);
}

// Contract keep-list (PROTOCOL.md §4) plus timestamps: "timestamp" for
// payloads that carry one, "__agentopolis_ts" stamped by the hook bridge.
const TOP_LEVEL_ALLOWLIST = [
  "hook_event_name",
  "session_id",
  "agent_id",
  "agent_type",
  "cwd",
  "permission_mode",
  "tool_name",
  "tool_use_id",
  "timestamp",
  "__agentopolis_ts",
];

// Small provider strings the adapter consumes; validated and capped here so
// the adapter NEVER needs to reach past redaction into the raw payload.
const SOURCE_ENUM = new Set(["startup", "resume", "clear", "compact", "fork", "unknown"]);

function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Host only per the contract ("url host") — paths can embed secrets
// (e.g. webhook URLs). Unparseable input degrades to a best-effort host.
function safeUrl(raw) {
  try {
    return new URL(raw).host;
  } catch {
    return raw
      .split(/[?#]/)[0]
      .replace(URL_CREDS, "$1")
      .replace(/^[A-Za-z][A-Za-z0-9+.-]*:\/\//, "")
      .replace(/^\/\//, "")
      .split("/")[0];
  }
}

// Keep only the tail of a path (basename + parent) — enough for display and
// disambiguation, and what the README's "Stored" list promises.
function trimPath(p) {
  const parts = p.replace(/\/+$/, "").split("/");
  return parts.slice(-2).join("/");
}

function rebuildToolInput(input) {
  const out = {};
  if (typeof input.file_path === "string") out.file_path = trimPath(input.file_path);
  if (typeof input.notebook_path === "string") out.notebook_path = trimPath(input.notebook_path);
  if (typeof input.pattern === "string") out.pattern = truncate(input.pattern, 40);
  if (typeof input.url === "string") out.url = safeUrl(input.url);
  if (typeof input.description === "string") out.description = truncate(input.description, 80);
  if (typeof input.command === "string") out.command = sanitizeCommand(input.command);
  if (typeof input.subject === "string") out.subject = truncate(input.subject, 80);
  return out;
}

export function redactHookPayload(payload) {
  try {
    if (!isPlainObject(payload)) return {};
    const out = {};
    for (const key of TOP_LEVEL_ALLOWLIST) {
      const v = payload[key];
      const t = typeof v;
      if (t === "string" || t === "number" || t === "boolean") out[key] = v;
    }
    if (isPlainObject(payload.tool_input)) {
      out.tool_input = rebuildToolInput(payload.tool_input);
    }
    if (typeof payload.source === "string") {
      out.source = SOURCE_ENUM.has(payload.source) ? payload.source : "unknown";
    }
    if (typeof payload.reason === "string") out.reason = truncate(payload.reason, 40);
    // Notification hint fields — ONLY on Notification payloads, where they
    // are provider-generated UI strings; masked like commands, tightly capped.
    if (payload.hook_event_name === "Notification") {
      for (const k of ["notification_type", "matcher"]) {
        if (typeof payload[k] === "string") out[k] = truncate(payload[k], 40);
      }
      for (const k of ["message", "title"]) {
        if (typeof payload[k] === "string") out[k] = sanitizeCommand(payload[k]);
      }
    }
    return out;
  } catch {
    return {};
  }
}
