import test from "node:test";
import assert from "node:assert/strict";
import { classify } from "../src/classify.js";

test("Read: researching with basename label and target", () => {
  assert.deepEqual(classify("Read", { file_path: "/Users/x/repo/config.ts" }), {
    kind: "researching",
    label: "Reading config.ts",
    target: "config.ts",
    ruleId: "read.v1",
  });
});

test("Read: undefined toolInput never throws, no target", () => {
  assert.deepEqual(classify("Read", undefined), {
    kind: "researching",
    label: "Reading a file",
    ruleId: "read.v1",
  });
});

test("Glob: researching with truncated pattern target", () => {
  const res = classify("Glob", { pattern: "src/**/*.js" });
  assert.equal(res.kind, "researching");
  assert.equal(res.label, "Finding files");
  assert.equal(res.target, "src/**/*.js");
  assert.equal(res.ruleId, "glob.v1");
});

test("Grep: label quotes the pattern", () => {
  assert.deepEqual(classify("Grep", { pattern: "foo" }), {
    kind: "researching",
    label: "Searching for 'foo'",
    target: "foo",
    ruleId: "grep.v1",
  });
});

test("Grep: pattern truncated to 24 chars", () => {
  const res = classify("Grep", { pattern: "a".repeat(50) });
  assert.equal(res.target.length, 24);
  assert.ok(res.target.endsWith("…"));
  assert.equal(res.label, `Searching for '${"a".repeat(23)}…'`);
});

test("Grep: missing pattern still safe", () => {
  const res = classify("Grep", {});
  assert.equal(res.kind, "researching");
  assert.equal(res.ruleId, "grep.v1");
  assert.equal(res.target, undefined);
});

test("WebFetch: target is hostname only", () => {
  assert.deepEqual(classify("WebFetch", { url: "https://example.com/a/b?q=secret" }), {
    kind: "researching",
    label: "Browsing the web",
    target: "example.com",
    ruleId: "webfetch.v1",
  });
});

test("WebFetch: unparseable url omits target, never throws", () => {
  const res = classify("WebFetch", { url: "not a url" });
  assert.equal(res.label, "Browsing the web");
  assert.equal(res.target, undefined);
});

test("WebSearch: researching with short query target", () => {
  const res = classify("WebSearch", { query: "node test runner docs" });
  assert.equal(res.kind, "researching");
  assert.equal(res.label, "Browsing the web");
  assert.equal(res.target, "node test runner docs");
  assert.equal(res.ruleId, "websearch.v1");
});

test("Edit/Write/NotebookEdit: editing with basename", () => {
  assert.deepEqual(classify("Edit", { file_path: "/repo/src/city.js" }), {
    kind: "editing",
    label: "Editing city.js",
    target: "city.js",
    ruleId: "edit.v1",
  });
  const written = classify("Write", { file_path: "/repo/brand-new.md" });
  assert.equal(written.kind, "editing");
  assert.equal(written.label, "Editing brand-new.md");
  assert.equal(written.ruleId, "write.v1");
  const nb = classify("NotebookEdit", { notebook_path: "/repo/analysis.ipynb" });
  assert.equal(nb.kind, "editing");
  assert.equal(nb.target, "analysis.ipynb");
});

test("Task/Agent: delegating", () => {
  const task = classify("Task", { subagent_type: "Explore", prompt: "secret prompt" });
  assert.equal(task.kind, "delegating");
  assert.equal(task.label, "Delegating work");
  assert.equal(task.target, "Explore");
  const agent = classify("Agent", {});
  assert.equal(agent.kind, "delegating");
  assert.equal(agent.label, "Delegating work");
});

test("TodoWrite/TaskCreate: planning", () => {
  assert.deepEqual(classify("TodoWrite", { todos: [] }), {
    kind: "planning",
    label: "Planning next steps",
    ruleId: "plan.v1",
  });
  assert.equal(classify("TaskCreate", { subject: "x" }).kind, "planning");
});

test("Bash: testing commands", () => {
  for (const command of [
    "npm test",
    "pnpm run test -- --watch=false",
    "bun test",
    "vitest run",
    "npx jest src/",
    "pytest -x",
    "python -m pytest tests/",
    "cargo test",
    "go test ./...",
    "mvn test",
    "./gradlew test",
    "dotnet test",
    "bundle exec rspec",
    "phpunit",
  ]) {
    const res = classify("Bash", { command });
    assert.equal(res.kind, "testing", command);
    assert.equal(res.label, "Running tests", command);
    assert.equal(res.ruleId, "bash.test.v1", command);
  }
});

test("Bash: building commands", () => {
  for (const command of [
    "npm run build",
    "yarn run build",
    "tsc --noEmit",
    "cargo build --release",
    "go build ./cmd/app",
    "make -j4",
    "mvn package",
    "gradle build",
    "dotnet build",
    "vite build",
    "next build",
    "webpack --mode production",
  ]) {
    const res = classify("Bash", { command });
    assert.equal(res.kind, "building", command);
    assert.equal(res.label, "Building the project", command);
    assert.equal(res.ruleId, "bash.build.v1", command);
  }
});

test("Bash: git commit vs other version control", () => {
  assert.deepEqual(classify("Bash", { command: "git commit -m 'fix'" }), {
    kind: "version_control",
    label: "Committing code",
    target: "git commit -m 'fix'",
    ruleId: "bash.git.commit.v1",
  });
  for (const command of ["git status", "git push origin main", "gh pr view 12", "glab mr list"]) {
    const res = classify("Bash", { command });
    assert.equal(res.kind, "version_control", command);
    assert.equal(res.label, "Checking git", command);
    assert.equal(res.ruleId, "bash.git.v1", command);
  }
});

test("Bash: installing commands", () => {
  for (const command of [
    "npm install",
    "pnpm add lodash",
    "yarn add -D vitest",
    "bun install",
    "pip install requests",
    "pip3 install -r requirements.txt",
    "uv sync",
    "uv add httpx",
    "uv pip install flask",
    "cargo add serde",
    "bundle install",
    "brew install jq",
    "apt-get install -y curl",
  ]) {
    const res = classify("Bash", { command });
    assert.equal(res.kind, "installing", command);
    assert.equal(res.label, "Installing packages", command);
    assert.equal(res.ruleId, "bash.install.v1", command);
  }
});

test("Bash: everything else is running", () => {
  const res = classify("Bash", { command: "node server.js --port 3000" });
  assert.equal(res.kind, "running");
  assert.equal(res.label, "Running a command");
  assert.equal(res.ruleId, "bash.run.v1");
  assert.equal(res.target, "node server.js --port 3000");
});

test("Bash: env assignment prefixes are stripped before matching", () => {
  assert.equal(classify("Bash", { command: "CI=true npm test" }).kind, "testing");
  assert.equal(classify("Bash", { command: "A=1 B='two words' pytest" }).kind, "testing");
  assert.equal(
    classify("Bash", { command: "NODE_ENV=production npm run build" }).kind,
    "building",
  );
});

test("Bash: cd prefixes are stripped before matching", () => {
  assert.equal(classify("Bash", { command: "cd /Users/x/repo && npm test" }).kind, "testing");
  assert.equal(classify("Bash", { command: 'cd "my dir" && git status' }).kind, "version_control");
  assert.equal(
    classify("Bash", { command: "cd app && NODE_ENV=test npx jest" }).kind,
    "testing",
  );
  assert.equal(classify("Bash", { command: "FOO=bar cd pkg && cargo test" }).kind, "testing");
});

test("Bash: only the FIRST command decides the kind", () => {
  assert.equal(classify("Bash", { command: "git log --oneline | head -5" }).kind, "version_control");
  assert.equal(classify("Bash", { command: "echo hi && git commit -m x" }).kind, "running");
  assert.equal(classify("Bash", { command: "npm test; rm -rf dist" }).kind, "testing");
});

test("Bash: target truncated to ~40 chars", () => {
  const command = `echo ${"a".repeat(80)}`;
  const res = classify("Bash", { command });
  assert.equal(res.target.length, 40);
  assert.ok(res.target.endsWith("…"));
});

test("Bash: null/missing command never throws", () => {
  assert.deepEqual(classify("Bash", { command: null }), {
    kind: "running",
    label: "Running a command",
    ruleId: "bash.run.v1",
  });
  assert.equal(classify("Bash", undefined).kind, "running");
  assert.equal(classify("Bash", { command: "   " }).target, undefined);
});

test("BashOutput/KillShell: running", () => {
  assert.equal(classify("BashOutput", { bash_id: "b1" }).kind, "running");
  assert.equal(classify("KillShell", { shell_id: "b1" }).kind, "running");
  assert.equal(classify("KillShell", {}).label, "Stopping a command");
});

test("ExitPlanMode/AskUserQuestion: planning", () => {
  assert.equal(classify("ExitPlanMode", { plan: "secret" }).kind, "planning");
  assert.equal(classify("AskUserQuestion", { questions: [] }).kind, "planning");
});

test("SlashCommand/Skill: running with safe target", () => {
  const slash = classify("SlashCommand", { command: "/review" });
  assert.equal(slash.kind, "running");
  assert.equal(slash.target, "/review");
  const skill = classify("Skill", { skill: "dataviz" });
  assert.equal(skill.kind, "running");
  assert.equal(skill.label, "Using a skill");
  assert.equal(skill.target, "dataviz");
});

test("MCP tools: running, label from tool, target is server", () => {
  assert.deepEqual(classify("mcp__linear__create_issue", { title: "x" }), {
    kind: "running",
    label: "Using create_issue",
    target: "linear",
    ruleId: "mcp.v1",
  });
  const res = classify("mcp__claude_ai_Slack__slack_send_message", {});
  assert.equal(res.label, "Using slack_send_message");
  assert.equal(res.target, "claude_ai_Slack");
});

test("unknown tool falls back", () => {
  assert.deepEqual(classify("FooBar", {}), {
    kind: "unknown",
    label: "FooBar",
    ruleId: "fallback.v1",
  });
});

test("garbage input never throws", () => {
  assert.equal(classify(null, null).ruleId, "fallback.v1");
  assert.equal(classify(undefined, undefined).label, "unknown");
  assert.equal(classify(42, "not an object").kind, "unknown");
  assert.equal(classify("Read", "not an object").kind, "researching");
  assert.equal(classify("Edit", { file_path: 123 }).label, "Editing a file");
});

test("pure: same input gives identical result", () => {
  const a = classify("Bash", { command: "cd x && CI=1 npm test" });
  const b = classify("Bash", { command: "cd x && CI=1 npm test" });
  assert.deepEqual(a, b);
});
