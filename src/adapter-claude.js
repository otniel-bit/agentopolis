// Claude Code adapter: native hook payloads → protocol v1 events.
// The ONLY module (besides reconcile.js) that knows Claude's shapes.

import crypto from 'node:crypto';
import { classify } from './classify.js';
import { redactHookPayload } from './redact.js';

function evt(type, p, extra = {}) {
  return {
    v: 1,
    id: 'e-' + crypto.randomUUID(),
    type,
    at: Date.now(),
    provider: 'claude-code',
    session: p.session_id,
    agent: p.agent_id || 'root',
    project: p.cwd || '/unknown',
    data: {},
    ...extra,
  };
}

function attentionSummary(p) {
  const tool = p.tool_name || 'a tool';
  const ti = p.tool_input || {};
  if (ti.command) return `Wants to run: ${ti.command}`;
  if (ti.file_path) return `Wants to use ${tool} on ${ti.file_path.split('/').pop()}`;
  return `Wants to use ${tool}`;
}

// Notification payloads vary; sniff conservatively and ignore what we can't read.
function classifyNotification(p) {
  const hint = [p.notification_type, p.matcher, p.message, p.title]
    .filter((x) => typeof x === 'string').join(' ').toLowerCase();
  if (!hint) return null;
  if (hint.includes('permission')) return { kind: 'permission', summary: 'Waiting for permission' };
  if (hint.includes('needs_input') || hint.includes('needs input') || hint.includes('waiting for your input')) {
    return { kind: 'input', summary: 'Waiting for your input' };
  }
  if (hint.includes('idle')) return { kind: 'input', summary: 'Waiting for you' };
  return null;
}

// Returns 0..n protocol events for one native hook payload.
export function normalize(raw) {
  const events = buildEvents(raw);
  // Spooled payloads carry the time the bridge saw them; keep it for ordering.
  const ts = raw && typeof raw.__agentopolis_ts === 'number' ? raw.__agentopolis_ts : null;
  if (ts) for (const e of events) e.at = ts;
  return events;
}

function buildEvents(raw) {
  const p = redactHookPayload(raw);
  if (!p.session_id || !p.hook_event_name) return [];

  switch (p.hook_event_name) {
    case 'SessionStart':
      return [evt('session.started', p, { data: { source: raw?.source || 'unknown' } })];

    case 'SessionEnd':
      return [evt('session.ended', p, { data: { reason: typeof raw?.reason === 'string' ? raw.reason.slice(0, 40) : undefined } })];

    case 'PreToolUse': {
      const c = classify(p.tool_name, p.tool_input);
      return [evt('activity.started', p, {
        data: {
          kind: c.kind, label: c.label, target: c.target,
          tool: p.tool_name, toolUseId: p.tool_use_id, ruleId: c.ruleId,
        },
      })];
    }

    case 'PostToolUse':
      return [evt('activity.ended', p, { data: { outcome: 'ok', tool: p.tool_name, toolUseId: p.tool_use_id } })];

    case 'PostToolUseFailure':
      return [evt('activity.ended', p, {
        data: { outcome: 'fail', tool: p.tool_name, toolUseId: p.tool_use_id, errorCategory: 'tool-error' },
      })];

    case 'PermissionRequest':
      return [evt('attention.raised', p, { data: { kind: 'permission', summary: attentionSummary(p) } })];

    case 'PermissionDenied':
      return [evt('attention.cleared', p)];

    case 'Notification': {
      const n = classifyNotification(raw || {});
      if (!n) return [];
      return [evt('attention.raised', p, { data: n })];
    }

    case 'SubagentStart':
      if (!p.agent_id) return [];
      return [evt('agent.spawned', p, { data: { agentType: p.agent_type || 'agent' } })];

    case 'SubagentStop':
      if (!p.agent_id) return [];
      return [evt('agent.finished', p, { data: { outcome: 'completed' } })];

    case 'TaskCreated':
      return [evt('task.created', p, { data: { subject: p.tool_input?.subject || 'task' } })];

    case 'TaskCompleted':
      return [evt('task.completed', p)];

    case 'Stop':
      // Root turn done → session idle; any input-attention is resolved by the turn ending.
      return [evt('turn.completed', p), evt('attention.cleared', p)];

    case 'StopFailure':
      return [evt('turn.failed', p, { data: { errorCategory: 'turn-error' } })];

    default:
      return []; // unknown hook events are ignored, never fatal
  }
}
