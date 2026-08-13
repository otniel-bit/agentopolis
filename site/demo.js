// Demo mode: emits a scripted, looping protocol-v1 story so the city is alive
// without any real Claude Code sessions. See docs/PROTOCOL.md section 4.

const ACTIVITY_KINDS = new Set([
  'planning', 'researching', 'editing', 'creating', 'testing', 'building',
  'running', 'version_control', 'installing', 'delegating', 'unknown',
]);

// type -> data shape check (per catalog); presence in this map = known type
const DATA_CHECKS = {
  'session.started': (d) => typeof d.source === 'string',
  'session.ended': () => true,
  'session.named': (d) =>
    typeof d.name === 'string' && ['explicit', 'generated', 'unknown'].includes(d.origin),
  'session.status': (d) => ['working', 'idle', 'blocked'].includes(d.status),
  'agent.spawned': (d) => typeof d.agentType === 'string',
  'agent.finished': (d) => ['completed', 'failed', 'stopped'].includes(d.outcome),
  'activity.started': (d) =>
    ACTIVITY_KINDS.has(d.kind) &&
    typeof d.label === 'string' &&
    typeof d.tool === 'string' &&
    typeof d.ruleId === 'string',
  'activity.ended': (d) => ['ok', 'fail'].includes(d.outcome) && typeof d.tool === 'string',
  'attention.raised': (d) =>
    ['permission', 'input', 'question'].includes(d.kind) && typeof d.summary === 'string',
  'attention.cleared': () => true,
  'task.created': (d) => typeof d.subject === 'string',
  'task.completed': () => true,
  'turn.completed': () => true,
  'turn.failed': () => true,
};

const isNonEmptyString = (s) => typeof s === 'string' && s.length > 0;

export function validateEvent(evt) {
  const problems = [];
  if (!evt || typeof evt !== 'object') problems.push('event must be an object');
  else {
    if (evt.v !== 1) problems.push('v must be 1');
    if (!isNonEmptyString(evt.id)) problems.push('id must be a non-empty string');
    if (!Object.hasOwn(DATA_CHECKS, evt.type)) problems.push(`unknown type: ${evt.type}`);
    if (typeof evt.at !== 'number' || !Number.isFinite(evt.at)) problems.push('at must be a number');
    if (!isNonEmptyString(evt.provider)) problems.push('provider required');
    if (!isNonEmptyString(evt.session)) problems.push('session required');
    if (!isNonEmptyString(evt.agent)) problems.push('agent required');
    if (!isNonEmptyString(evt.project)) problems.push('project required');
    if (!evt.data || typeof evt.data !== 'object') problems.push('data must be an object');
    else if (Object.hasOwn(DATA_CHECKS, evt.type) && !DATA_CHECKS[evt.type](evt.data)) {
      problems.push(`bad data for ${evt.type}`);
    }
  }
  // Browser copy: `process` doesn't exist here, so validation never throws.
  if (problems.length > 0 && typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
    throw new Error(`invalid demo event: ${problems.join('; ')}`);
  }
  return problems.length === 0;
}

const P1 = '/demo/saturn-api';
const P2 = '/demo/pixel-shop';
const P3 = '/demo/dotfiles';

const LOOP_SECONDS = 95;

// One iteration of the story as [seconds, project, session, agent, type, data].
// Returned sorted by time so speed-0 runs preserve narrative order.
function buildScript({ s1, s2, s3, iteration }) {
  const steps = [];
  const at = (sec, project, session, agent, type, data) =>
    steps.push([sec, project, session, agent, type, data]);
  const activity = (startSec, endSec, project, session, agent, started, end = {}) => {
    at(startSec, project, session, agent, 'activity.started', started);
    at(endSec, project, session, agent, 'activity.ended', {
      outcome: 'ok', tool: started.tool, ...end,
    });
  };

  // --- saturn-api (s1): worksite -> promoted, root cycles, two subagents ---
  at(0, P1, s1, 'root', 'session.started', {
    source: iteration === 1 ? 'startup' : 'resume',
  });
  activity(1, 7.5, P1, s1, 'root', {
    kind: 'researching', label: 'Reading auth.ts', target: 'auth.ts',
    tool: 'Read', ruleId: 'demo.read.v1',
  });
  // promotion moment: same explicit name every loop so the building reopens
  at(6, P1, s1, 'root', 'session.named', { name: 'auth-refactor', origin: 'explicit' });
  activity(8, 15, P1, s1, 'root', {
    kind: 'editing', label: 'Editing auth.ts', target: 'auth.ts',
    tool: 'Edit', ruleId: 'demo.edit.v1',
  });
  at(15, P1, s1, 'a1', 'agent.spawned', { agentType: 'Explore' });
  at(17, P1, s1, 'a2', 'agent.spawned', { agentType: 'general-purpose' });
  at(19, P1, s1, 'a3', 'agent.spawned', { agentType: 'Plan' });
  activity(20, 28.5, P1, s1, 'root', {
    kind: 'testing', label: 'Running tests', target: 'npm test',
    tool: 'Bash', ruleId: 'demo.bash.test.v1',
  });
  activity(31, 38, P1, s1, 'root', {
    kind: 'researching', label: 'Reading middleware.ts', target: 'middleware.ts',
    tool: 'Read', ruleId: 'demo.read.v1',
  });
  activity(40, 48, P1, s1, 'root', {
    kind: 'editing', label: 'Writing refresh.ts', target: 'refresh.ts',
    tool: 'Write', ruleId: 'demo.edit.v1',
  });
  activity(50, 58, P1, s1, 'root', {
    kind: 'testing', label: 'Running tests', target: 'npm test',
    tool: 'Bash', ruleId: 'demo.bash.test.v1',
  });
  at(61, P1, s1, 'root', 'turn.completed', {});
  activity(65, 72, P1, s1, 'root', {
    kind: 'researching', label: 'Reading routes.ts', target: 'routes.ts',
    tool: 'Read', ruleId: 'demo.read.v1',
  });
  activity(75, 82, P1, s1, 'root', {
    kind: 'editing', label: 'Editing routes.ts', target: 'routes.ts',
    tool: 'Edit', ruleId: 'demo.edit.v1',
  });
  activity(84, 91, P1, s1, 'root', {
    kind: 'testing', label: 'Running tests', target: 'npm test',
    tool: 'Bash', ruleId: 'demo.bash.test.v1',
  });

  // a1 (Explore): researching only
  activity(16, 23, P1, s1, 'a1', {
    kind: 'researching', label: 'Searching for token usage', target: 'token',
    tool: 'Grep', ruleId: 'demo.grep.v1',
  });
  activity(25, 33, P1, s1, 'a1', {
    kind: 'researching', label: 'Reading token.ts', target: 'token.ts',
    tool: 'Read', ruleId: 'demo.read.v1',
  });
  activity(35, 43, P1, s1, 'a1', {
    kind: 'researching', label: 'Searching for refresh logic', target: 'refresh',
    tool: 'Grep', ruleId: 'demo.grep.v1',
  });
  at(45, P1, s1, 'a1', 'agent.finished', { outcome: 'completed' });

  // a2 (general-purpose): edits, then runs tests
  activity(18, 26, P1, s1, 'a2', {
    kind: 'editing', label: 'Editing session.ts', target: 'session.ts',
    tool: 'Edit', ruleId: 'demo.edit.v1',
  });
  activity(28, 36, P1, s1, 'a2', {
    kind: 'testing', label: 'Running unit tests', target: 'npm test',
    tool: 'Bash', ruleId: 'demo.bash.test.v1',
  });
  activity(40.5, 47.5, P1, s1, 'a2', {
    kind: 'editing', label: 'Editing auth.test.ts', target: 'auth.test.ts',
    tool: 'Edit', ruleId: 'demo.edit.v1',
  });
  activity(50.5, 58.5, P1, s1, 'a2', {
    kind: 'testing', label: 'Running full suite', target: 'npm test',
    tool: 'Bash', ruleId: 'demo.bash.test.v1',
  });
  at(60, P1, s1, 'a2', 'agent.finished', { outcome: 'completed' });

  // a3 (Plan): plans, reads, hands back
  activity(21.5, 29.5, P1, s1, 'a3', {
    kind: 'planning', label: 'Drafting refactor plan', target: 'todos',
    tool: 'TodoWrite', ruleId: 'demo.plan.v1',
  });
  activity(32, 39, P1, s1, 'a3', {
    kind: 'researching', label: 'Reading auth.ts', target: 'auth.ts',
    tool: 'Read', ruleId: 'demo.read.v1',
  });
  at(41.5, P1, s1, 'a3', 'agent.finished', { outcome: 'completed' });

  // --- pixel-shop (s2): stays a worksite; permission attention self-resolves ---
  at(10, P2, s2, 'root', 'session.started', { source: 'startup' });
  activity(11, 16.5, P2, s2, 'root', {
    kind: 'version_control', label: 'git status', target: 'git status',
    tool: 'Bash', ruleId: 'demo.bash.vcs.v1',
  });
  activity(18.5, 26.5, P2, s2, 'root', {
    kind: 'running', label: 'npm run dev', target: 'npm run dev',
    tool: 'Bash', ruleId: 'demo.bash.run.v1',
  });
  at(30, P2, s2, 'root', 'attention.raised', {
    kind: 'permission', summary: 'Wants to run: npm publish',
  });
  at(55, P2, s2, 'root', 'attention.cleared', {});
  activity(56, 62, P2, s2, 'root', {
    kind: 'version_control', label: 'git commit', target: 'git commit',
    tool: 'Bash', ruleId: 'demo.bash.vcs.v1',
  });
  activity(64, 70, P2, s2, 'root', {
    kind: 'running', label: 'npm run preview', target: 'npm run preview',
    tool: 'Bash', ruleId: 'demo.bash.run.v1',
  });

  // --- dotfiles (s3): fail, then recover, then the building goes dark ---
  at(20, P3, s3, 'root', 'session.started', { source: 'startup' });
  at(20.5, P3, s3, 'root', 'task.created', { taskId: 't1', subject: 'Refresh shell aliases' });
  activity(21, 27, P3, s3, 'root', {
    kind: 'editing', label: 'Editing .zshrc', target: '.zshrc',
    tool: 'Edit', ruleId: 'demo.edit.v1',
  }, { outcome: 'fail', errorCategory: 'exit-1' });
  at(27.5, P3, s3, 'root', 'turn.failed', { errorCategory: 'exit-1' });
  activity(30.5, 36.5, P3, s3, 'root', {
    kind: 'testing', label: 'Linting dotfiles', target: 'shellcheck',
    tool: 'Bash', ruleId: 'demo.bash.test.v1',
  });
  at(37, P3, s3, 'root', 'task.completed', { taskId: 't1' });
  at(37.5, P3, s3, 'root', 'turn.completed', {});
  at(90, P3, s3, 'root', 'session.ended', { reason: 'exit' });

  // wind down s1/s2 just before the loop so their successors reopen cleanly
  at(93, P1, s1, 'root', 'session.ended', { reason: 'idle' });
  at(93.5, P2, s2, 'root', 'session.ended', { reason: 'idle' });

  return steps.sort((a, b) => a[0] - b[0]);
}

export function startDemo(emit, opts = {}) {
  const speed = opts.speed ?? 1;
  const timers = new Set();
  let stopped = false;
  let counter = 0;

  const uid = () => `e-${++counter}-${Math.random().toString(36).slice(2, 8)}`;

  const schedule = (ms, fn) => {
    if (stopped) return;
    // speed 0 collapses everything to 1ms ticks; order survives because
    // steps are registered in chronological order.
    const t = setTimeout(() => {
      timers.delete(t);
      if (!stopped) fn();
    }, Math.max(1, Math.round(ms * speed)));
    timers.add(t);
  };

  const send = (project, session, agent, type, data) => {
    const evt = {
      v: 1, id: uid(), type, at: Date.now(),
      provider: 'demo', project, session, agent, data,
    };
    validateEvent(evt);
    emit(evt);
  };

  const runStory = (iteration) => {
    const sfx = iteration === 1 ? '' : `-${iteration}`;
    const script = buildScript({
      s1: `s1${sfx}`, s2: `s2${sfx}`, s3: `s3${sfx}`, iteration,
    });
    for (const [sec, project, session, agent, type, data] of script) {
      schedule(sec * 1000, () => send(project, session, agent, type, data));
    }
    schedule(LOOP_SECONDS * 1000, () => runStory(iteration + 1));
  };

  runStory(1);

  return {
    stop() {
      stopped = true;
      for (const t of timers) clearTimeout(t);
      timers.clear();
    },
  };
}
