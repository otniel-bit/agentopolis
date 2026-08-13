/**
 * Activity classification (PROTOCOL.md §4, src/classify.js).
 * Pure and deterministic: maps a tool call to { kind, label, target?, ruleId }.
 * Never throws — malformed input degrades to the fallback result.
 */

const MAX_QUERY = 24;
const MAX_COMMAND = 40;

// Leading noise stripped before matching the first command of a Bash string.
const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=(?:'[^']*'|"[^"]*"|\S*)\s+/;
const CD_PREFIX = /^cd\s+(?:'[^']*'|"[^"]*"|\S+)\s*(?:&&|;)\s*/;
const SUDO_PREFIX = /^sudo\s+/;

// Ordered: first matching rule wins. Patterns run against the whitespace-collapsed
// first command, so single spaces are enough. Kept conservative — no match falls
// through to plain "running".
const BASH_RULES = [
  {
    kind: "testing", label: "Running tests", ruleId: "bash.test.v1",
    patterns: [
      /^(?:npm|pnpm|yarn|bun)(?: run)? test\b/,
      /^(?:npx )?(?:vitest|jest)\b/,
      /^pytest\b/,
      /^python3? -m pytest\b/,
      /^cargo test\b/,
      /^go test\b/,
      /^mvn test\b/,
      /^(?:gradle|\.\/gradlew) test\b/,
      /^dotnet test\b/,
      /^(?:bundle exec )?rspec\b/,
      /^(?:(?:\.\/)?vendor\/bin\/)?phpunit\b/,
    ],
  },
  {
    kind: "building", label: "Building the project", ruleId: "bash.build.v1",
    patterns: [
      /^(?:npm|pnpm|yarn|bun) run build\b/,
      /^(?:npx )?tsc\b/,
      /^cargo build\b/,
      /^go build\b/,
      /^make\b/,
      /^mvn package\b/,
      /^(?:gradle|\.\/gradlew) build\b/,
      /^dotnet build\b/,
      /^(?:npx )?vite build\b/,
      /^(?:npx )?next build\b/,
      /^(?:npx )?webpack\b/,
    ],
  },
  {
    kind: "version_control", label: "Committing code", ruleId: "bash.git.commit.v1",
    patterns: [/^git commit\b/],
  },
  {
    kind: "version_control", label: "Checking git", ruleId: "bash.git.v1",
    patterns: [/^(?:git|gh|glab)\b/],
  },
  {
    kind: "installing", label: "Installing packages", ruleId: "bash.install.v1",
    patterns: [
      /^(?:npm|pnpm|yarn|bun) (?:install|add)\b/,
      /^pip3? install\b/,
      /^uv (?:sync|add|pip)\b/,
      /^cargo add\b/,
      /^bundle install\b/,
      /^brew install\b/,
      /^apt(?:-get)? install\b/,
    ],
  },
];

export function classify(toolName, toolInput) {
  try {
    return classifyTool(toolName, toolInput);
  } catch {
    return fallback(toolName);
  }
}

function classifyTool(toolName, toolInput) {
  const name = typeof toolName === "string" ? toolName : "";
  const input = toolInput && typeof toolInput === "object" ? toolInput : {};

  if (name.startsWith("mcp__")) return classifyMcp(name);

  switch (name) {
    case "Read":
      return fileResult("researching", "Reading", input.file_path, "read.v1");
    case "Glob":
      return withTarget(
        { kind: "researching", label: "Finding files", ruleId: "glob.v1" },
        shorten(str(input.pattern), MAX_QUERY),
      );
    case "Grep":
      return classifyGrep(input);
    case "WebFetch":
      return webResult(hostname(input.url), "webfetch.v1");
    case "WebSearch":
      return webResult(shorten(collapse(str(input.query)), MAX_QUERY), "websearch.v1");
    case "Edit":
      return fileResult("editing", "Editing", input.file_path, "edit.v1");
    case "Write":
      // Writes to brand-new paths are still "editing" per the contract.
      return fileResult("editing", "Editing", input.file_path, "write.v1");
    case "NotebookEdit":
      return fileResult("editing", "Editing", input.notebook_path, "notebookedit.v1");
    case "Task":
    case "Agent":
      return withTarget(
        { kind: "delegating", label: "Delegating work", ruleId: "delegate.v1" },
        str(input.subagent_type),
      );
    case "TodoWrite":
    case "TaskCreate":
      return { kind: "planning", label: "Planning next steps", ruleId: "plan.v1" };
    case "ExitPlanMode":
      return { kind: "planning", label: "Presenting a plan", ruleId: "plan.exit.v1" };
    case "AskUserQuestion":
      return { kind: "planning", label: "Asking a question", ruleId: "ask.v1" };
    case "Bash":
      return classifyBash(input);
    case "BashOutput":
      return { kind: "running", label: "Checking output", ruleId: "bashoutput.v1" };
    case "KillShell":
      return { kind: "running", label: "Stopping a command", ruleId: "killshell.v1" };
    case "SlashCommand":
      return withTarget(
        { kind: "running", label: "Running a command", ruleId: "slash.v1" },
        shorten(collapse(str(input.command)), MAX_COMMAND),
      );
    case "Skill":
      return withTarget(
        { kind: "running", label: "Using a skill", ruleId: "skill.v1" },
        str(input.skill),
      );
    default:
      return fallback(name);
  }
}

function classifyBash(input) {
  const raw = str(input.command);
  const base = { kind: "running", label: "Running a command", ruleId: "bash.run.v1" };
  if (!raw.trim()) return base;

  const head = firstCommand(raw);
  // Command is redacted upstream; still keep the display target short.
  const target = shorten(collapse(raw), MAX_COMMAND);
  for (const rule of BASH_RULES) {
    if (rule.patterns.some((re) => re.test(head))) {
      return withTarget({ kind: rule.kind, label: rule.label, ruleId: rule.ruleId }, target);
    }
  }
  return withTarget(base, target);
}

// First simple command: env assignments, sudo, and `cd X &&`-style prefixes are
// stripped, then the string is cut at the first shell separator.
function firstCommand(raw) {
  let s = raw.trimStart();
  for (;;) {
    const m = s.match(ENV_ASSIGNMENT) || s.match(CD_PREFIX) || s.match(SUDO_PREFIX);
    if (!m) break;
    s = s.slice(m[0].length).trimStart();
  }
  const cut = s.search(/&&|\|\||;|\||\n/);
  if (cut !== -1) s = s.slice(0, cut);
  return collapse(s);
}

function classifyGrep(input) {
  const pattern = shorten(collapse(str(input.pattern)), MAX_QUERY);
  if (!pattern) return { kind: "researching", label: "Searching the code", ruleId: "grep.v1" };
  return {
    kind: "researching",
    label: `Searching for '${pattern}'`,
    target: pattern,
    ruleId: "grep.v1",
  };
}

function classifyMcp(name) {
  const rest = name.slice("mcp__".length);
  const sep = rest.indexOf("__");
  const server = sep === -1 ? rest : rest.slice(0, sep);
  const tool = sep === -1 ? "" : rest.slice(sep + 2);
  return withTarget(
    { kind: "running", label: `Using ${tool || server || "a tool"}`, ruleId: "mcp.v1" },
    server,
  );
}

function fileResult(kind, verb, filePath, ruleId) {
  const base = basename(str(filePath));
  return withTarget(
    { kind, label: base ? `${verb} ${base}` : `${verb} a file`, ruleId },
    base,
  );
}

function hostname(url) {
  const s = str(url);
  try {
    return new URL(s).hostname;
  } catch {
    // Redacted urls arrive as a bare host (no scheme); accept that shape.
    return /^[A-Za-z0-9.-]+(?::\d+)?$/.test(s) ? s.split(":")[0] : "";
  }
}

function webResult(target, ruleId) {
  return withTarget({ kind: "researching", label: "Browsing the web", ruleId }, target);
}

function fallback(toolName) {
  const label = typeof toolName === "string" && toolName ? toolName : "unknown";
  return { kind: "unknown", label, ruleId: "fallback.v1" };
}

function withTarget(result, target) {
  if (target) result.target = target;
  return result;
}

function str(value) {
  return typeof value === "string" ? value : "";
}

function collapse(s) {
  return s.replace(/\s+/g, " ").trim();
}

function shorten(s, max) {
  if (!s) return "";
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function basename(p) {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}
