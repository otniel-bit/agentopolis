import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeCommand, redactHookPayload } from "../src/redact.js";

test("sanitizeCommand masks key=value and key: value secrets", () => {
  const exported = sanitizeCommand("export API_KEY=sk-live-abc123");
  assert.ok(exported.includes("API_KEY=•••"));
  assert.ok(!exported.includes("sk-live-abc123"));

  const token = sanitizeCommand("export MY_SECRET_TOKEN=deadbeef42");
  assert.ok(!token.includes("deadbeef42"));
  assert.ok(token.includes("•••"));

  const colon = sanitizeCommand("PASSWORD: hunter2");
  assert.ok(!colon.includes("hunter2"));
});

test("sanitizeCommand masks bearer tokens", () => {
  const header = sanitizeCommand('curl -H "Authorization: Bearer eyJhbGciOi.token"');
  assert.ok(!header.includes("eyJhbGciOi.token"));
  assert.ok(header.includes("Authorization: •••"));

  const bare = sanitizeCommand('curl -H "Bearer shhh-token"');
  assert.ok(!bare.includes("shhh-token"));
  assert.ok(bare.includes("Bearer •••"));
});

test("sanitizeCommand masks URL credentials", () => {
  const s = sanitizeCommand("psql postgres://admin:hunter2@db.example.com:5432/app");
  assert.ok(!s.includes("hunter2"));
  assert.ok(!s.includes("admin"));
  assert.ok(s.includes("postgres://•••@db.example.com"));
});

test("sanitizeCommand masks mysql-like passwords, leaves other -p flags alone", () => {
  const spaced = sanitizeCommand("mysql -u root -p hunter2 appdb");
  assert.ok(!spaced.includes("hunter2"));
  assert.ok(spaced.includes("-p •••"));

  const eq = sanitizeCommand("mysqldump --password=hunter2 appdb");
  assert.ok(!eq.includes("hunter2"));
  assert.ok(eq.includes("--password=•••"));

  assert.equal(sanitizeCommand("mkdir -p src/deep/dir"), "mkdir -p src/deep/dir");
});

test("sanitizeCommand masks base64-ish runs but keeps long paths", () => {
  const blob = "QWxhZGRpbjpvcGVuIHNlc2FtZQ==QWxhZGRpbjpvcGVuIHNlc2FtZQ==";
  const masked = sanitizeCommand(`echo ${blob}`);
  assert.ok(!masked.includes(blob));
  assert.ok(masked.includes("•••"));

  const alnum = "A1b2".repeat(12); // 48-char slashless run
  assert.ok(!sanitizeCommand(`echo ${alnum}`).includes(alnum));

  const path = "cat /Users/otniel/Developer/agentopolis/src/redact.js";
  assert.equal(sanitizeCommand(path), path);
});

test("sanitizeCommand truncates heredocs", () => {
  const s = sanitizeCommand("cat > notes.txt <<EOF\nsuper secret body\nEOF");
  assert.equal(s, "cat > notes.txt <<…");
  assert.ok(!s.includes("secret body"));
});

test("sanitizeCommand collapses newlines", () => {
  assert.equal(
    sanitizeCommand("git add .\ngit commit -m x\ngit push"),
    "git add .; git commit -m x; git push",
  );
  assert.equal(sanitizeCommand("echo a\r\necho b"), "echo a; echo b");
});

test("sanitizeCommand truncates to 80 chars", () => {
  const long = "ls " + "file ".repeat(30);
  const s = sanitizeCommand(long);
  assert.equal(s.length, 80);
  assert.ok(s.endsWith("…"));

  assert.equal(sanitizeCommand("npm test"), "npm test");
});

test("sanitizeCommand tolerates garbage input", () => {
  assert.equal(sanitizeCommand(null), "");
  assert.equal(sanitizeCommand(undefined), "");
  assert.equal(sanitizeCommand(42), "");
  assert.equal(sanitizeCommand({ cmd: "ls" }), "");
});

const fullPayload = {
  hook_event_name: "PreToolUse",
  session_id: "abc-123",
  prompt_id: "p-1",
  agent_id: "a-9",
  agent_type: "Explore",
  cwd: "/Users/x/repo",
  permission_mode: "default",
  tool_name: "Edit",
  tool_use_id: "tu-1",
  timestamp: 1723580000000,
  __agentopolis_ts: 1723580000042,
  prompt: "the raw user prompt",
  message: "assistant message body",
  last_assistant_message: "assistant said things",
  env: { AWS_SECRET_ACCESS_KEY: "leak" },
  todos: [{ content: "todo body" }],
  tool_response: { output: "file contents here" },
  tool_input: {
    file_path: "/Users/x/repo/auth.js",
    notebook_path: "/Users/x/repo/nb.ipynb",
    content: "SECRET FILE BODY",
    new_string: "after",
    old_string: "before",
    old_str: "before2",
    new_str: "after2",
    prompt: "nested prompt",
    pattern: "x".repeat(60),
    url: "https://api.example.com/v1/users?token=abc#frag",
    description: "d".repeat(100),
    command: "export TOKEN=abc\nnpm test",
    subject: "s".repeat(100),
  },
};

test("redactHookPayload keeps only the allowlist", () => {
  const out = redactHookPayload(fullPayload);

  for (const key of [
    "hook_event_name", "session_id", "agent_id", "agent_type",
    "cwd", "permission_mode", "tool_name", "tool_use_id",
    "timestamp", "__agentopolis_ts",
  ]) {
    assert.equal(out[key], fullPayload[key], `allowlisted ${key} kept`);
  }

  for (const key of [
    "prompt_id", "prompt", "message", "last_assistant_message", "env", "todos", "tool_response",
  ]) {
    assert.ok(!(key in out), `dangerous top-level ${key} absent`);
  }

  for (const key of [
    "content", "new_string", "old_string", "old_str", "new_str", "prompt",
  ]) {
    assert.ok(!(key in out.tool_input), `dangerous tool_input ${key} absent`);
  }
});

test("redactHookPayload rebuilds tool_input safe fields", () => {
  const out = redactHookPayload(fullPayload);
  const ti = out.tool_input;

  assert.equal(ti.file_path, "/Users/x/repo/auth.js");
  assert.equal(ti.notebook_path, "/Users/x/repo/nb.ipynb");

  assert.equal(ti.pattern.length, 40);
  assert.ok(ti.pattern.endsWith("…"));

  assert.equal(ti.url, "api.example.com"); // host only per contract
  assert.ok(!ti.url.includes("?"));
  assert.ok(!ti.url.includes("token"));

  assert.equal(ti.description.length, 80);
  assert.equal(ti.subject.length, 80);

  assert.equal(ti.command, "export TOKEN=•••; npm test");
});

test("redactHookPayload strips URL credentials", () => {
  const out = redactHookPayload({
    tool_input: { url: "https://user:pass@h.io/a/b?x=1" },
  });
  assert.equal(out.tool_input.url, "h.io");
  assert.ok(!out.tool_input.url.includes("pass"));
});

test("redactHookPayload returns a new object", () => {
  const out = redactHookPayload(fullPayload);
  assert.notEqual(out, fullPayload);
  assert.notEqual(out.tool_input, fullPayload.tool_input);
});

test("redactHookPayload never throws on garbage", () => {
  assert.deepEqual(redactHookPayload(null), {});
  assert.deepEqual(redactHookPayload(undefined), {});
  assert.deepEqual(redactHookPayload("a string"), {});
  assert.deepEqual(redactHookPayload(42), {});
  assert.deepEqual(redactHookPayload([1, 2, 3]), {});
  assert.deepEqual(redactHookPayload(true), {});

  // wrong-typed fields are dropped, not copied or crashed on
  const weird = redactHookPayload({
    session_id: { evil: "object" },
    tool_input: { url: 12, command: null, pattern: 5, file_path: ["x"] },
  });
  assert.ok(!("session_id" in weird));
  assert.deepEqual(weird.tool_input, {});

  const stringInput = redactHookPayload({ tool_input: "rm -rf /" });
  assert.ok(!("tool_input" in stringInput));

  const badUrl = redactHookPayload({ tool_input: { url: "not a url?secret=1" } });
  assert.ok(!badUrl.tool_input.url.includes("secret=1"));
});
