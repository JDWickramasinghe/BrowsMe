'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AgentService,
  MAX_TOOL_RESULT_CHARS,
  parseToolArguments,
  requiredEvidenceTypes,
  safeUrlForModel,
  serializeToolResult,
  summarizeArguments,
  tools,
  validateToolArguments
} = require('../src/main/agent-service');

function createAgentForCompletionTest() {
  return new AgentService({
    browser: {},
    settings: {
      getApiKey: () => 'test-key',
      getPublicSettings: () => ({
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-v4-flash'
      })
    },
    memory: {
      getConversation: () => []
    },
    emit: () => {}
  });
}

function toolMessage(id, name, args = {}) {
  return {
    role: 'assistant',
    content: '',
    tool_calls: [{
      id,
      type: 'function',
      function: {
        name,
        arguments: JSON.stringify(args)
      }
    }]
  };
}

function createLoopHarness(responses) {
  const events = [];
  const observedMessages = [];
  let clickCount = 0;
  let snapshotSequence = 0;
  const browser = {
    activeTabId: 'tab-1',
    listTabsForAgent: () => [{
      id: 'tab-1',
      active: true,
      title: 'Test',
      url: 'https://example.com/',
      loading: false
    }],
    beginAgentApprovalRun: () => {},
    endAgentApprovalRun: () => {},
    includeAgentApprovalTab: () => {},
    invalidateAgentRefs: () => {},
    getTab: () => ({ id: 'tab-1', url: 'https://example.com/' }),
    snapshot: async (tabId) => ({
      ok: true,
      tabId,
      title: 'Test',
      url: 'https://example.com/',
      text: 'Ready',
      elements: [{
        ref: `s${++snapshotSequence}-e1`,
        role: 'button',
        name: 'Continue'
      }]
    }),
    click: async () => {
      clickCount += 1;
      return {
        ok: true,
        clicked: 'Continue',
        evidence: { observed: true, changed: true }
      };
    },
    navigate: async () => 'https://example.com/next',
    listDownloadsForAgent: () => []
  };
  const memory = {
    getConversation: () => [],
    getStatus: () => ({
      persistent: true,
      encrypted: true,
      conversationMessages: 0,
      rememberedFacts: 0
    }),
    listFacts: () => [],
    appendConversation: () => {}
  };
  const settings = {
    getApiKey: () => 'test-key',
    getPublicSettings: () => ({
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      approvalMode: 'full',
      agentReliability: 'reliable'
    })
  };
  const agent = new AgentService({
    browser,
    settings,
    memory,
    emit: (event) => events.push(event)
  });
  agent.requestCompletion = async (messages) => {
    observedMessages.push(structuredClone(messages));
    const response = responses.shift();
    if (!response) {
      throw new Error('The test model ran out of responses.');
    }
    return response;
  };
  return {
    agent,
    events,
    observedMessages,
    get clickCount() {
      return clickCount;
    }
  };
}

test('BrowsMe keeps its JD-created operational identity and truthful self-state', () => {
  const agent = new AgentService({
    browser: {
      listTabsForAgent: () => [{
        id: 'tab-1',
        active: true,
        title: 'Example',
        url: 'https://example.com/private?token=secret',
        loading: false
      }]
    },
    settings: {},
    memory: {
      getConversation: () => [],
      getStatus: () => ({
        persistent: true,
        encrypted: true,
        conversationMessages: 4,
        rememberedFacts: 2
      }),
      listFacts: () => []
    },
    emit: () => {}
  });
  const run = {
    scope: 'active',
    currentTabId: 'tab-1',
    allowedTabIds: new Set(['tab-1'])
  };

  const selfState = agent.buildSelfState(run);
  assert.equal(selfState.name, 'BrowsMe');
  assert.equal(selfState.creator, 'J.D. Wickramasinghe');
  assert.equal(selfState.provider, 'DeepSeek');
  assert.equal(selfState.conscious, false);
  assert.equal(selfState.availableTabs[0].url, 'https://example.com/private');
  assert.equal(selfState.memory.persistent, true);
  assert.match(agent.buildSystemPrompt(run), /Your name is BrowsMe/);
  assert.match(agent.buildSystemPrompt(run), /created by J\.D\. Wickramasinghe/);
});

test('all tool names are unique and schemas reject unspecified properties', () => {
  const names = tools.map((tool) => tool.function.name);
  assert.equal(new Set(names).size, names.length);
  for (const tool of tools) {
    assert.equal(tool.type, 'function');
    assert.equal(tool.function.parameters.additionalProperties, false);
  }
});

test('parseToolArguments accepts objects and rejects malformed payloads', () => {
  const parsed = parseToolArguments({
    function: { name: 'page_click', arguments: '{"ref":"e1"}' }
  });
  assert.deepEqual(parsed, { ref: 'e1' });
  assert.throws(
    () => parseToolArguments({ function: { name: 'page_click', arguments: '{' } }),
    /invalid JSON/
  );
  assert.throws(
    () => parseToolArguments({ function: { name: 'page_click', arguments: '[]' } }),
    /invalid JSON/
  );
});

test('validateToolArguments enforces known schemas, required fields, and types', () => {
  assert.deepEqual(
    validateToolArguments('page_scroll', { direction: 'down', amount: 650 }),
    { direction: 'down', amount: 650 }
  );
  assert.throws(
    () => validateToolArguments('missing_tool', {}),
    /UNKNOWN_TOOL/
  );
  assert.throws(
    () => validateToolArguments('page_click', {}),
    /ref is required/
  );
  assert.throws(
    () => validateToolArguments('page_click', { ref: 'e1', unexpected: true }),
    /does not accept unexpected/
  );
  assert.throws(
    () => validateToolArguments('browser_open_tab', { background: 'yes' }),
    /background must be a boolean/
  );
  assert.throws(
    () => validateToolArguments('page_scroll', { direction: 'diagonal' }),
    /direction is invalid/
  );
  assert.throws(
    () => validateToolArguments('page_wait', { milliseconds: 99 }),
    /milliseconds is too small/
  );
  assert.throws(
    () => validateToolArguments('page_wait', { milliseconds: 5001 }),
    /milliseconds is too large/
  );
  assert.throws(
    () => validateToolArguments('page_wait', { milliseconds: Number.NaN }),
    /milliseconds must be a number/
  );
  assert.deepEqual(
    validateToolArguments('task_plan', {
      goal: 'Check a page',
      steps: ['Inspect', 'Verify']
    }),
    {
      goal: 'Check a page',
      steps: ['Inspect', 'Verify']
    }
  );
  assert.throws(
    () => validateToolArguments('task_update', { step: 1.5, status: 'completed' }),
    /step must be a integer/
  );
  assert.throws(
    () => validateToolArguments('task_plan', { goal: 'x', steps: [] }),
    /too few items/
  );
});

test('type tool logs redact text content', () => {
  assert.deepEqual(
    summarizeArguments('page_type', { ref: 'e2', text: 'secret' }),
    { ref: 'e2', text: '[6 characters]' }
  );
});

test('model-facing URL export redacts sensitive URL components', () => {
  assert.equal(
    safeUrlForModel('https://user:pass@example.com/account?session=secret#token'),
    'https://example.com/account'
  );
});

test('tool result truncation remains bounded valid JSON', () => {
  const small = { ok: true, value: 'small' };
  assert.equal(serializeToolResult(small), JSON.stringify(small));

  const large = {
    ok: false,
    error: `${'quoted "\\ value '.repeat(2200)}${'\u0000'.repeat(4000)}${'😀'.repeat(4000)}`
  };
  const serialized = serializeToolResult(large);
  const parsed = JSON.parse(serialized);

  assert.ok(serialized.length <= MAX_TOOL_RESULT_CHARS);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.truncated, true);
  assert.equal(typeof parsed.preview, 'string');
  assert.ok(parsed.preview.length > 0);
});

test('large page snapshots retain complete structured element records', () => {
  const snapshot = {
    ok: true,
    tabId: 'tab-1',
    title: 'Large page',
    text: 'page text '.repeat(3000),
    elements: Array.from({ length: 400 }, (_, index) => ({
      ref: `s7-e${index + 1}`,
      role: 'button',
      name: `Control ${index} ${'label '.repeat(40)}`,
      bounds: { x: 1, y: index, width: 100, height: 30 }
    }))
  };

  const serialized = serializeToolResult(snapshot);
  const parsed = JSON.parse(serialized);
  assert.ok(serialized.length <= MAX_TOOL_RESULT_CHARS);
  assert.ok(Array.isArray(parsed.elements));
  assert.ok(parsed.elements.length > 0);
  assert.equal(parsed.elements[0].ref, 's7-e1');
  assert.equal(typeof parsed.elements[0].bounds, 'object');
  assert.equal(parsed.truncated, true);
  assert.ok(parsed.omittedElements > 0);
});

test('DeepSeek V4 request omits incompatible tool_choice and preserves reasoning content', async () => {
  const originalFetch = global.fetch;
  let requestBody;
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          content: '',
          reasoning_content: 'checked the page state',
          tool_calls: [{
            id: 'call-1',
            type: 'function',
            function: { name: 'browser_list_tabs', arguments: '{}' }
          }]
        }
      }]
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const message = await createAgentForCompletionTest().requestCompletion(
      [{ role: 'user', content: 'list tabs' }],
      { abortController: new AbortController() }
    );
    assert.equal(Object.hasOwn(requestBody, 'tool_choice'), false);
    assert.equal(requestBody.model, 'deepseek-v4-flash');
    assert.deepEqual(requestBody.thinking, { type: 'enabled' });
    assert.equal(requestBody.reasoning_effort, 'high');
    assert.equal(requestBody.max_tokens, 8192);
    assert.equal(Object.hasOwn(requestBody, 'temperature'), false);
    assert.equal(message.reasoning_content, 'checked the page state');
    assert.equal(message.tool_calls[0].id, 'call-1');
  } finally {
    global.fetch = originalFetch;
  }
});

test('run loop permits only one mutation per model response and requires later verification', async () => {
  const harness = createLoopHarness([
    toolMessage('snapshot-1', 'page_snapshot'),
    {
      role: 'assistant',
      content: '',
      tool_calls: [
        toolMessage('click-1', 'page_click', { ref: 's1-e1' }).tool_calls[0],
        toolMessage('click-2', 'page_click', { ref: 's1-e1' }).tool_calls[0]
      ]
    },
    toolMessage('snapshot-2', 'page_snapshot'),
    toolMessage('finish-1', 'task_finish', {
      status: 'succeeded',
      summary: 'The requested control was activated and the resulting page was verified.'
    })
  ]);

  const result = await harness.agent.run({
    prompt: 'Click Continue and verify the result.',
    scope: 'active'
  });

  assert.equal(harness.clickCount, 1);
  assert.equal(result.status, 'succeeded');
  assert.equal(result.actions, 1);
  const rejectedMutation = harness.events.find(
    (event) => event.type === 'tool-result' && event.toolCallId === 'click-2'
  );
  assert.equal(rejectedMutation.ok, false);
  assert.match(rejectedMutation.summary, /ONE_MUTATION_PER_TURN/);
});

test('a later model turn cannot mutate again before the prior action is observed', async () => {
  const harness = createLoopHarness([
    toolMessage('snapshot-before', 'page_snapshot'),
    toolMessage('click-first', 'page_click', { ref: 's1-e1' }),
    toolMessage('click-next-turn', 'page_click', { ref: 's1-e1' }),
    toolMessage('snapshot-after', 'page_snapshot'),
    toolMessage('finish-after-observation', 'task_finish', {
      status: 'succeeded',
      summary: 'The single click was freshly observed.'
    })
  ]);

  const result = await harness.agent.run({
    prompt: 'Click Continue once and verify the page.',
    scope: 'active'
  });

  assert.equal(harness.clickCount, 1);
  assert.equal(result.status, 'succeeded');
  const rejected = harness.events.find(
    (event) => event.type === 'tool-result' &&
      event.toolCallId === 'click-next-turn'
  );
  assert.equal(rejected.ok, false);
  assert.match(rejected.summary, /PENDING_ACTION_VERIFICATION/);
});

test('a plan step cannot claim completion while its browser action is unobserved', async () => {
  const harness = createLoopHarness([
    toolMessage('plan', 'task_plan', {
      goal: 'Click and verify',
      steps: ['Activate the control']
    }),
    toolMessage('snapshot-before', 'page_snapshot'),
    toolMessage('click', 'page_click', { ref: 's1-e1' }),
    toolMessage('premature-step-complete', 'task_update', {
      step: 1,
      status: 'completed'
    }),
    toolMessage('snapshot-after', 'page_snapshot'),
    toolMessage('verified-step-complete', 'task_update', {
      step: 1,
      status: 'completed'
    }),
    toolMessage('finish', 'task_finish', {
      status: 'succeeded',
      summary: 'The control was activated and freshly observed.'
    })
  ]);

  const result = await harness.agent.run({
    prompt: 'Click Continue and verify it.',
    scope: 'active'
  });

  const premature = harness.events.find(
    (event) => event.type === 'tool-result' &&
      event.toolCallId === 'premature-step-complete'
  );
  assert.equal(premature.ok, false);
  assert.match(premature.summary, /STEP_VERIFICATION_REQUIRED/);
  assert.equal(result.status, 'succeeded');
});

test('task_finish must be the last call and later calls in that response never execute', async () => {
  const harness = createLoopHarness([
    {
      role: 'assistant',
      content: '',
      tool_calls: [
        toolMessage('misplaced-finish', 'task_finish', {
          status: 'succeeded',
          summary: 'Finished.'
        }).tool_calls[0],
        toolMessage('forbidden-click', 'page_click', {
          ref: 's1-e1'
        }).tool_calls[0]
      ]
    },
    toolMessage('snapshot', 'page_snapshot'),
    toolMessage('valid-finish', 'task_finish', {
      status: 'succeeded',
      summary: 'The current page was observed without changing it.'
    })
  ]);

  const result = await harness.agent.run({
    prompt: 'Confirm this page without changing it.',
    scope: 'active'
  });

  assert.equal(harness.clickCount, 0);
  assert.match(
    harness.events.find(
      (event) => event.type === 'tool-result' &&
        event.toolCallId === 'misplaced-finish'
    ).summary,
    /TASK_FINISH_MUST_BE_LAST/
  );
  assert.match(
    harness.events.find(
      (event) => event.type === 'tool-result' &&
        event.toolCallId === 'forbidden-click'
    ).summary,
    /TASK_ALREADY_FINISHED/
  );
  assert.equal(result.status, 'succeeded');
});

test('evidence requirements preserve composite tasks and avoid Remember me false positives', () => {
  assert.deepEqual(
    Array.from(requiredEvidenceTypes('Who are you and summarize this page?')).sort(),
    ['page', 'self']
  );
  assert.deepEqual(
    Array.from(requiredEvidenceTypes('List my memories and inspect this page.')).sort(),
    ['memory', 'page']
  );
  assert.deepEqual(
    Array.from(requiredEvidenceTypes('List tabs and tell me what the active page says.')).sort(),
    ['page', 'tabs']
  );
  assert.deepEqual(
    Array.from(requiredEvidenceTypes('Click the Remember me checkbox.')),
    ['page']
  );
  assert.deepEqual(
    Array.from(requiredEvidenceTypes('Tell me your current state.')),
    ['self']
  );
  assert.deepEqual(
    Array.from(requiredEvidenceTypes('Who are you and open https://example.com?')).sort(),
    ['page', 'self']
  );
  assert.deepEqual(
    Array.from(requiredEvidenceTypes('List my memories and go to example.com.')).sort(),
    ['memory', 'page']
  );
  assert.deepEqual(
    Array.from(requiredEvidenceTypes('Who are you and search for weather.')).sort(),
    ['page', 'self']
  );
});

test('unrelated memory evidence cannot satisfy a page task', async () => {
  const harness = createLoopHarness([
    toolMessage('memory-only', 'memory_list'),
    toolMessage('finish-with-memory', 'task_finish', {
      status: 'succeeded',
      summary: 'The current page was confirmed.'
    }),
    toolMessage('page-evidence', 'page_snapshot'),
    toolMessage('finish-with-page', 'task_finish', {
      status: 'succeeded',
      summary: 'The current page was freshly confirmed.'
    })
  ]);

  const result = await harness.agent.run({
    prompt: 'Confirm the current page.',
    scope: 'active'
  });

  const rejected = harness.events.find(
    (event) => event.type === 'tool-result' &&
      event.toolCallId === 'finish-with-memory'
  );
  assert.equal(rejected.ok, false);
  assert.match(rejected.summary, /fresh page evidence/);
  assert.equal(result.status, 'succeeded');
});

test('composite identity and page tasks require both kinds of evidence', async () => {
  const harness = createLoopHarness([
    toolMessage('self-evidence', 'browsme_self_state'),
    toolMessage('finish-with-self-only', 'task_finish', {
      status: 'succeeded',
      summary: 'Identity and page were summarized.'
    }),
    toolMessage('page-evidence', 'page_snapshot'),
    toolMessage('finish-with-both', 'task_finish', {
      status: 'succeeded',
      summary: 'BrowsMe identity and the current page were both freshly observed.'
    })
  ]);

  const result = await harness.agent.run({
    prompt: 'Who are you and summarize this page?',
    scope: 'active'
  });

  const rejected = harness.events.find(
    (event) => event.type === 'tool-result' &&
      event.toolCallId === 'finish-with-self-only'
  );
  assert.equal(rejected.ok, false);
  assert.match(rejected.summary, /fresh page evidence/);
  assert.equal(result.status, 'succeeded');
});

test('successful finish is rejected until a later model turn observes the mutation', async () => {
  const harness = createLoopHarness([
    toolMessage('navigate-1', 'browser_navigate', {
      url: 'https://example.com/next'
    }),
    toolMessage('finish-too-early', 'task_finish', {
      status: 'succeeded',
      summary: 'Navigation completed.'
    }),
    toolMessage('snapshot-after', 'page_snapshot'),
    toolMessage('finish-after-check', 'task_finish', {
      status: 'succeeded',
      summary: 'Navigation completed and the destination page was inspected.'
    })
  ]);

  const result = await harness.agent.run({
    prompt: 'Go to the next page.',
    scope: 'active'
  });

  assert.equal(result.status, 'succeeded');
  const earlyFinish = harness.events.find(
    (event) => event.type === 'tool-result' &&
      event.toolCallId === 'finish-too-early'
  );
  assert.equal(earlyFinish.ok, false);
  assert.match(earlyFinish.summary, /TASK_(?:EVIDENCE_REQUIRED|NOT_VERIFIED)/);
});

test('a failed correlated side effect prevents false success and is shown in the receipt', async () => {
  const harness = createLoopHarness([
    toolMessage('snapshot-before', 'page_snapshot'),
    toolMessage('click-with-failed-navigation', 'page_click', { ref: 's1-e1' }),
    toolMessage('snapshot-after', 'page_snapshot'),
    toolMessage('false-success', 'task_finish', {
      status: 'succeeded',
      summary: 'The requested navigation completed.'
    }),
    toolMessage('truthful-partial', 'task_finish', {
      status: 'partial',
      summary: 'The control was clicked, but its navigation did not complete.',
      remaining: 'The destination still needs to be opened.'
    })
  ]);
  harness.agent.browser.click = async () => ({
    ok: true,
    tabId: 'tab-1',
    clicked: 'Continue',
    evidence: { observed: true, changed: true },
    sideEffects: [{
      ok: true,
      value: {
        kind: 'navigation',
        navigated: false,
        code: 'APPROVAL_DENIED',
        tabId: 'tab-1'
      }
    }]
  });

  const result = await harness.agent.run({
    prompt: 'Click Continue and open its destination.',
    scope: 'active'
  });

  const action = harness.events.find(
    (event) => event.type === 'tool-result' &&
      event.toolCallId === 'click-with-failed-navigation'
  );
  assert.deepEqual(action.sideEffectWarnings, ['APPROVAL_DENIED']);
  const rejected = harness.events.find(
    (event) => event.type === 'tool-result' &&
      event.toolCallId === 'false-success'
  );
  assert.equal(rejected.ok, false);
  assert.match(rejected.summary, /UNRESOLVED_SIDE_EFFECT/);
  const receipt = harness.events.find((event) => event.type === 'receipt').receipt;
  assert.equal(receipt.status, 'partial');
  assert.equal(receipt.unresolvedSideEffects, 1);
  assert.equal(result.status, 'partial');
});

test('an unrelated later success cannot erase an earlier side-effect failure', async () => {
  const harness = createLoopHarness([
    toolMessage('snapshot-first', 'page_snapshot'),
    toolMessage('click-failed-effect', 'page_click', { ref: 's1-e1' }),
    toolMessage('snapshot-second', 'page_snapshot'),
    toolMessage('click-successful-effect', 'page_click', { ref: 's2-e1' }),
    toolMessage('snapshot-third', 'page_snapshot'),
    toolMessage('still-not-success', 'task_finish', {
      status: 'succeeded',
      summary: 'Both click effects completed.'
    }),
    toolMessage('partial-after-unresolved', 'task_finish', {
      status: 'partial',
      summary: 'A later click worked, but the first navigation remained unresolved.',
      remaining: 'The first destination still needs review.'
    })
  ]);
  let click = 0;
  harness.agent.browser.click = async () => {
    click += 1;
    return {
      ok: true,
      tabId: 'tab-1',
      clicked: `Click ${click}`,
      evidence: { observed: true, changed: true },
      sideEffects: click === 1
        ? [{
            ok: true,
            value: {
              kind: 'navigation',
              navigated: false,
              code: 'APPROVAL_DENIED',
              tabId: 'tab-1'
            }
          }]
        : [{
            ok: true,
            value: {
              kind: 'navigation',
              navigated: true,
              tabId: 'tab-1'
            }
          }]
    };
  };

  const result = await harness.agent.run({
    prompt: 'Perform both clicks and verify every destination.',
    scope: 'active'
  });

  const rejected = harness.events.find(
    (event) => event.type === 'tool-result' &&
      event.toolCallId === 'still-not-success'
  );
  assert.equal(rejected.ok, false);
  assert.match(rejected.summary, /UNRESOLVED_SIDE_EFFECT/);
  assert.equal(result.status, 'partial');
});

test('a deterministic control-state mismatch cannot be cleared by a generic snapshot', async () => {
  const harness = createLoopHarness([
    toolMessage('snapshot-before-select', 'page_snapshot'),
    toolMessage('select-reverted', 'page_select', {
      ref: 's1-e1',
      value: 'Pro'
    }),
    toolMessage('snapshot-after-select', 'page_snapshot'),
    toolMessage('false-select-success', 'task_finish', {
      status: 'succeeded',
      summary: 'The requested option remained selected.'
    }),
    toolMessage('partial-select-result', 'task_finish', {
      status: 'partial',
      summary: 'The site reverted the requested option.',
      remaining: 'The requested option is not selected.'
    })
  ]);
  harness.agent.browser.selectOption = async () => ({
    ok: true,
    tabId: 'tab-1',
    selected: 'Basic',
    selectedIndex: 0,
    stateMatched: false,
    mutated: true,
    sideEffects: [],
    evidence: {
      observed: true,
      changed: true,
      stateMatched: false
    }
  });

  const result = await harness.agent.run({
    prompt: 'Select the Pro plan and verify it stays selected.',
    scope: 'active'
  });

  const action = harness.events.find(
    (event) => event.type === 'tool-result' &&
      event.toolCallId === 'select-reverted'
  );
  assert.deepEqual(action.sideEffectWarnings, ['SELECT_STATE_NOT_REACHED']);
  const rejected = harness.events.find(
    (event) => event.type === 'tool-result' &&
      event.toolCallId === 'false-select-success'
  );
  assert.equal(rejected.ok, false);
  assert.match(rejected.summary, /UNRESOLVED_SIDE_EFFECT/);
  assert.equal(result.status, 'partial');
});

test('popup IDs from correlated side effects enter scope and require their own observation', async () => {
  const harness = createLoopHarness([
    toolMessage('snapshot-before', 'page_snapshot'),
    toolMessage('click-popup', 'page_click', { ref: 's1-e1' }),
    toolMessage('snapshot-parent', 'page_snapshot', { tab_id: 'tab-1' }),
    toolMessage('finish-before-popup-check', 'task_finish', {
      status: 'succeeded',
      summary: 'The popup task completed.'
    }),
    toolMessage('snapshot-popup', 'page_snapshot', { tab_id: 'tab-2' }),
    toolMessage('finish-after-popup-check', 'task_finish', {
      status: 'succeeded',
      summary: 'The parent page and its popup were both freshly observed.'
    })
  ]);
  harness.agent.browser.listTabsForAgent = () => [
    {
      id: 'tab-1',
      active: true,
      title: 'Parent',
      url: 'https://example.com/',
      loading: false
    },
    {
      id: 'tab-2',
      active: false,
      title: 'Popup',
      url: 'https://example.com/popup',
      loading: false
    }
  ];
  harness.agent.browser.getTab = (tabId) => ({
    id: tabId,
    url: tabId === 'tab-2'
      ? 'https://example.com/popup'
      : 'https://example.com/'
  });
  harness.agent.browser.click = async () => ({
    ok: true,
    tabId: 'tab-1',
    clicked: 'Open popup',
    evidence: { observed: true, changed: true },
    sideEffects: [{
      ok: true,
      value: {
        kind: 'popup',
        runId: 'test-run',
        initiatorTabId: 'tab-1',
        newTabId: 'tab-2'
      }
    }]
  });

  const result = await harness.agent.run({
    prompt: 'Open the popup and verify it.',
    scope: 'active'
  });

  const earlyFinish = harness.events.find(
    (event) => event.type === 'tool-result' &&
      event.toolCallId === 'finish-before-popup-check'
  );
  assert.equal(earlyFinish.ok, false);
  assert.match(earlyFinish.summary, /tab-2/);
  assert.equal(result.status, 'succeeded');
});

test('a navigation that settles during task_finish invalidates earlier evidence', async () => {
  const harness = createLoopHarness([
    toolMessage('snapshot-before', 'page_snapshot'),
    toolMessage('click-delayed-navigation', 'page_click', { ref: 's1-e1' }),
    toolMessage('snapshot-too-soon', 'page_snapshot'),
    toolMessage('finish-during-navigation', 'task_finish', {
      status: 'succeeded',
      summary: 'The page was verified.'
    }),
    toolMessage('snapshot-after-navigation', 'page_snapshot'),
    toolMessage('finish-after-navigation', 'task_finish', {
      status: 'succeeded',
      summary: 'The final navigated page was freshly verified.'
    })
  ]);
  let settlement = 0;
  harness.agent.browser.settleAgentSideEffects = async () => {
    settlement += 1;
    return settlement === 1
      ? [{
          ok: true,
          value: {
            kind: 'navigation',
            navigated: true,
            tabId: 'tab-1'
          }
        }]
      : [];
  };
  harness.agent.browser.hasPendingAgentSideEffects = () => false;

  const result = await harness.agent.run({
    prompt: 'Click Continue and verify the final page.',
    scope: 'active'
  });

  const rejected = harness.events.find(
    (event) => event.type === 'tool-result' &&
      event.toolCallId === 'finish-during-navigation'
  );
  assert.equal(rejected.ok, false);
  assert.match(rejected.summary, /TASK_REFLECTION_REQUIRED|TASK_NOT_VERIFIED/);
  assert.equal(result.status, 'succeeded');
});

test('succeeded finish requires current-run broker evidence', async () => {
  const harness = createLoopHarness([
    toolMessage('finish-without-evidence', 'task_finish', {
      status: 'succeeded',
      summary: 'The browser task is complete.'
    }),
    toolMessage('snapshot-evidence', 'page_snapshot'),
    toolMessage('finish-with-evidence', 'task_finish', {
      status: 'succeeded',
      summary: 'The current page was observed before reporting completion.'
    })
  ]);

  const result = await harness.agent.run({
    prompt: 'Confirm the current browser page.',
    scope: 'active'
  });

  const rejected = harness.events.find(
    (event) => event.type === 'tool-result' &&
      event.toolCallId === 'finish-without-evidence'
  );
  assert.equal(rejected.ok, false);
  assert.match(rejected.summary, /TASK_EVIDENCE_REQUIRED/);
  assert.equal(result.status, 'succeeded');
});

test('timed-out waits do not clear a browser mutation verification', async () => {
  const harness = createLoopHarness([
    toolMessage('snapshot-before', 'page_snapshot'),
    toolMessage('navigate-before-wait', 'browser_navigate', {
      url: 'https://example.com/next'
    }),
    toolMessage('wait-timeout', 'page_wait_for', {
      condition: 'text',
      value: 'never appears',
      timeout_ms: 250
    }),
    toolMessage('finish-after-timeout', 'task_finish', {
      status: 'succeeded',
      summary: 'Navigation is complete.'
    }),
    toolMessage('snapshot-after-timeout', 'page_snapshot'),
    toolMessage('finish-after-snapshot', 'task_finish', {
      status: 'succeeded',
      summary: 'The destination page was freshly observed.'
    })
  ]);
  harness.agent.browser.waitForCondition = async () => ({
    ok: true,
    condition: 'text',
    matched: false,
    timedOut: true,
    elapsedMs: 250
  });

  const result = await harness.agent.run({
    prompt: 'Navigate and verify the result.',
    scope: 'active'
  });

  const rejected = harness.events.find(
    (event) => event.type === 'tool-result' &&
      event.toolCallId === 'finish-after-timeout'
  );
  assert.equal(rejected.ok, false);
  assert.match(rejected.summary, /TASK_NOT_VERIFIED/);
  assert.equal(result.status, 'succeeded');
  assert.ok(harness.events.some(
    (event) => event.type === 'action-verification' &&
      event.toolCallId === 'navigate-before-wait' &&
      event.reobserved === true
  ));
});

test('a partial mutation failure requires fresh observation before another mutation', async () => {
  const harness = createLoopHarness([
    toolMessage('partial-type', 'page_type', {
      ref: 's1-e1',
      text: 'partially applied',
      submit: true
    }),
    toolMessage('blocked-next-click', 'page_click', {
      ref: 's1-e1'
    }),
    toolMessage('observe-partial-change', 'page_snapshot'),
    toolMessage('finish-partial', 'task_finish', {
      status: 'partial',
      summary: 'The partial field change was observed safely.',
      remaining: 'The requested submission still needs to be completed.'
    })
  ]);
  let fieldValue = '';
  const invalidatedTabs = [];
  harness.agent.browser.typeText = async (tabId, _ref, text) => {
    fieldValue = text;
    const error = new Error('INJECTED_ENTER_FAILURE');
    error.mutationMayHaveOccurred = true;
    error.tabId = tabId;
    throw error;
  };
  harness.agent.browser.settleAgentSideEffects = async () => [];
  harness.agent.browser.invalidateAgentRefs = (tabId) => {
    invalidatedTabs.push(tabId);
  };

  const result = await harness.agent.run({
    prompt: 'Type and submit this form safely.',
    scope: 'active'
  });

  assert.equal(fieldValue, 'partially applied');
  assert.equal(harness.clickCount, 0);
  assert.equal(result.status, 'partial');
  assert.equal(result.actions, 1);
  assert.deepEqual(invalidatedTabs, ['tab-1']);
  const partialFailure = harness.events.find(
    (event) => event.type === 'tool-result' &&
      event.toolCallId === 'partial-type'
  );
  assert.equal(partialFailure.ok, false);
  assert.equal(partialFailure.executed, true);
  const blockedMutation = harness.events.find(
    (event) => event.type === 'tool-result' &&
      event.toolCallId === 'blocked-next-click'
  );
  assert.match(blockedMutation.summary, /PENDING_ACTION_VERIFICATION/);
  assert.ok(harness.events.some(
    (event) => event.type === 'action-verification' &&
      event.toolCallId === 'partial-type' &&
      event.reobserved === true
  ));
});

test('an unmarked action denial does not create false mutation verification', async () => {
  const harness = createLoopHarness([
    toolMessage('denied-click-one', 'page_click', { ref: 's1-e1' }),
    toolMessage('denied-click-two', 'page_click', { ref: 's1-e1' }),
    toolMessage('finish-denied', 'task_finish', {
      status: 'blocked',
      summary: 'The click was denied.',
      blocker_code: 'approval_denied'
    })
  ]);
  let deniedAttempts = 0;
  harness.agent.browser.click = async () => {
    deniedAttempts += 1;
    throw new Error('The click was denied.');
  };

  const result = await harness.agent.run({
    prompt: 'Click the protected control.',
    scope: 'active'
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.actions, 0);
  assert.equal(deniedAttempts, 2);
  assert.equal(
    harness.events.filter((event) => event.type === 'action-verification').length,
    0
  );
});

test('a popup from a partial mutation enters scope and requires its own observation', async () => {
  const harness = createLoopHarness([
    toolMessage('partial-popup-click', 'page_click', { ref: 's1-e1' }),
    toolMessage('observe-partial-parent', 'page_snapshot', {
      tab_id: 'tab-1'
    }),
    toolMessage('observe-partial-popup', 'page_snapshot', {
      tab_id: 'tab-popup'
    }),
    toolMessage('finish-partial-popup', 'task_finish', {
      status: 'partial',
      summary: 'Both surviving pages were inspected after the uncertain click.',
      remaining: 'The original click outcome remains uncertain.'
    })
  ]);
  let popupVisible = false;
  let sideEffectsDrained = false;
  harness.agent.browser.listTabsForAgent = () => [
    {
      id: 'tab-1',
      active: !popupVisible,
      title: 'Test',
      url: 'https://example.com/',
      loading: false
    },
    ...(popupVisible
      ? [{
          id: 'tab-popup',
          active: true,
          title: 'Popup',
          url: 'https://example.com/popup',
          loading: false
        }]
      : [])
  ];
  harness.agent.browser.click = async (tabId) => {
    const error = new Error('INJECTED_CLICK_COMPLETION_FAILURE');
    error.mutationMayHaveOccurred = true;
    error.tabId = tabId;
    throw error;
  };
  harness.agent.browser.settleAgentSideEffects = async () => {
    if (sideEffectsDrained) {
      return [];
    }
    sideEffectsDrained = true;
    popupVisible = true;
    return [{
      ok: true,
      value: {
        kind: 'popup',
        runId: 'test-run',
        newTabId: 'tab-popup'
      }
    }];
  };

  const result = await harness.agent.run({
    prompt: 'Click the control and inspect any popup.',
    scope: 'active'
  });

  assert.equal(result.status, 'partial');
  assert.equal(result.actions, 1);
  const verifications = harness.events.filter(
    (event) => event.type === 'action-verification' &&
      event.toolCallId === 'partial-popup-click'
  );
  assert.equal(verifications.length, 2);
  assert.equal(verifications[0].reobserved, false);
  assert.equal(verifications[1].reobserved, true);
});

test('invalid tool arguments become repairable tool results instead of aborting the run', async () => {
  const harness = createLoopHarness([
    toolMessage('invalid-click', 'page_click', {}),
    toolMessage('blocked-finish', 'task_finish', {
      status: 'blocked',
      summary: 'The requested target could not be identified safely.',
      blocker_code: 'repeated_error'
    })
  ]);

  const result = await harness.agent.run({
    prompt: 'Click the missing target.',
    scope: 'active'
  });

  assert.equal(result.status, 'blocked');
  assert.equal(harness.clickCount, 0);
  const invalid = harness.events.find(
    (event) => event.type === 'tool-result' &&
      event.toolCallId === 'invalid-click'
  );
  assert.equal(invalid.ok, false);
  assert.match(invalid.summary, /ref is required/);
});

test('bare model text is corrected into a broker-validated task receipt', async () => {
  const harness = createLoopHarness([
    { role: 'assistant', content: 'Done.' },
    toolMessage('self-state-evidence', 'browsme_self_state'),
    toolMessage('finish-receipt', 'task_finish', {
      status: 'succeeded',
      summary: 'The informational request was completed.'
    })
  ]);

  const result = await harness.agent.run({
    prompt: 'Tell me your current state.',
    scope: 'active'
  });

  assert.equal(result.content, 'The informational request was completed.');
  assert.ok(harness.events.some((event) => event.type === 'verification'));
});

test('transient DeepSeek API failures retry without replaying browser actions', async () => {
  const originalFetch = global.fetch;
  let attempts = 0;
  const events = [];
  global.fetch = async () => {
    attempts += 1;
    if (attempts === 1) {
      return new Response('temporarily unavailable', {
        status: 503,
        headers: { 'retry-after': '0.001' }
      });
    }
    return new Response(JSON.stringify({
      choices: [{
        finish_reason: 'stop',
        message: { content: 'ready' }
      }]
    }), { status: 200 });
  };

  const agent = createAgentForCompletionTest();
  agent.emit = (event) => events.push(event);
  try {
    const message = await agent.requestCompletion(
      [{ role: 'user', content: 'hello' }],
      {
        id: 'run-retry',
        retryCount: 0,
        abortController: new AbortController()
      }
    );
    assert.equal(message.content, 'ready');
    assert.equal(attempts, 2);
    assert.equal(events.filter((event) => event.type === 'retry').length, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

function createDispatchAgent(browserExtras = {}) {
  const calls = [];
  const browser = {
    activeTabId: 'tab-1',
    getTab: (id) => ({ id: id || 'tab-1', url: 'https://example.com/' }),
    includeAgentApprovalTab: () => {},
    isAgentApprovalTab: () => true,
    setZoom: (tabId, mode) => { calls.push(['setZoom', tabId, mode]); return 110; },
    setTabMuted: (tabId, muted) => { calls.push(['setTabMuted', tabId, muted]); return muted; },
    findTextForAgent: async (tabId, text, opts) => {
      calls.push(['findTextForAgent', tabId, text, opts]);
      return { matches: 3, activeMatch: 1 };
    },
    duplicateTabForAgent: async (tabId, opts) => {
      calls.push(['duplicateTabForAgent', tabId, opts]);
      return 'tab-2';
    },
    closeOtherTabsForAgent: async (keepId) => {
      calls.push(['closeOtherTabsForAgent', keepId]);
      return ['tab-9'];
    },
    ...browserExtras
  };
  const agent = new AgentService({
    browser,
    settings: {
      getApiKey: () => 'test-key',
      getPublicSettings: () => ({ baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' })
    },
    memory: { getConversation: () => [], listFacts: () => [] },
    emit: () => {}
  });
  return { agent, browser, calls };
}

function dispatchRun() {
  return {
    id: 'run-1',
    scope: 'active',
    currentTabId: 'tab-1',
    allowedTabIds: new Set(['tab-1']),
    abortController: new AbortController()
  };
}

test('newly added Chrome-parity tools are exposed to the model with strict schemas', () => {
  const names = new Set(tools.map((tool) => tool.function.name));
  for (const added of ['page_zoom', 'page_find_text', 'tab_set_muted', 'tab_duplicate', 'tab_close_others']) {
    assert.ok(names.has(added), `expected the agent to expose ${added}`);
  }
  assert.deepEqual(validateToolArguments('page_zoom', { mode: 'in' }), { mode: 'in' });
  assert.throws(() => validateToolArguments('page_zoom', { mode: 'huge' }), /mode is invalid/);
  assert.throws(() => validateToolArguments('page_zoom', {}), /mode is required/);
  assert.deepEqual(validateToolArguments('page_find_text', { text: 'hello' }), { text: 'hello' });
  assert.throws(() => validateToolArguments('page_find_text', {}), /text is required/);
  assert.deepEqual(validateToolArguments('tab_set_muted', { muted: true }), { muted: true });
  assert.throws(() => validateToolArguments('tab_set_muted', { muted: 'yes' }), /muted must be a boolean/);
  assert.throws(() => validateToolArguments('tab_close_others', { nope: 1 }), /does not accept/);
});

test('page_zoom dispatches to the browser broker and returns the percentage', async () => {
  const { agent, calls } = createDispatchAgent();
  const result = await agent.executeTool(dispatchRun(), 'page_zoom', { mode: 'in' });
  assert.deepEqual(result, { ok: true, tabId: 'tab-1', zoom: 110 });
  assert.deepEqual(calls[0], ['setZoom', 'tab-1', 'in']);
});

test('tab_set_muted forwards the explicit desired audio state', async () => {
  const { agent, calls } = createDispatchAgent();
  const result = await agent.executeTool(dispatchRun(), 'tab_set_muted', { muted: true });
  assert.deepEqual(result, { ok: true, tabId: 'tab-1', muted: true });
  assert.deepEqual(calls[0], ['setTabMuted', 'tab-1', true]);
});

test('page_find_text reports match counts as a read-only observation', async () => {
  const { agent } = createDispatchAgent();
  const result = await agent.executeTool(dispatchRun(), 'page_find_text', { text: 'Ready' });
  assert.equal(result.ok, true);
  assert.equal(result.matches, 3);
  assert.equal(result.activeMatch, 1);
});

test('tab_duplicate opens a scoped copy and tracks it as the current tab', async () => {
  const { agent, calls } = createDispatchAgent();
  const run = dispatchRun();
  const result = await agent.executeTool(run, 'tab_duplicate', {});
  assert.equal(result.ok, true);
  assert.equal(result.tabId, 'tab-2');
  assert.ok(run.allowedTabIds.has('tab-2'));
  assert.equal(run.currentTabId, 'tab-2');
  assert.equal(calls[0][0], 'duplicateTabForAgent');
});

test('tab_close_others keeps the target tab and removes the rest from scope', async () => {
  const { agent } = createDispatchAgent();
  const run = dispatchRun();
  run.allowedTabIds.add('tab-9');
  const result = await agent.executeTool(run, 'tab_close_others', {});
  assert.equal(result.ok, true);
  assert.equal(result.keptTabId, 'tab-1');
  assert.deepEqual(result.closedTabIds, ['tab-9']);
  assert.ok(!run.allowedTabIds.has('tab-9'));
  assert.ok(run.allowedTabIds.has('tab-1'));
});

function createLibraryAgent() {
  const store = { bookmarks: [], readingList: [] };
  const historyEntries = [
    { url: 'https://example.com/a', title: 'Alpha', at: 2 },
    { url: 'https://example.com/b', title: 'Beta', at: 1 }
  ];
  const browser = {
    getTab: () => ({ id: 'tab-1', url: 'https://example.com/a', title: 'Alpha' }),
    includeAgentApprovalTab: () => {},
    isAgentApprovalTab: () => true,
    broadcastState: () => {}
  };
  const settings = {
    getApiKey: () => 'test-key',
    getPublicSettings: () => ({
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      bookmarks: store.bookmarks,
      readingList: store.readingList
    }),
    toggleBookmark: ({ url, title }) => {
      const index = store.bookmarks.findIndex((entry) => entry.url === url);
      if (index >= 0) {
        store.bookmarks.splice(index, 1);
      } else {
        store.bookmarks.unshift({ url, title });
      }
      return { bookmarks: store.bookmarks };
    },
    toggleReadingItem: ({ url, title }) => {
      const index = store.readingList.findIndex((entry) => entry.url === url);
      if (index >= 0) {
        store.readingList.splice(index, 1);
      } else {
        store.readingList.unshift({ url, title });
      }
      return { readingList: store.readingList };
    }
  };
  const agent = new AgentService({
    browser,
    settings,
    memory: { getConversation: () => [], listFacts: () => [] },
    history: {
      list: ({ query, limit } = {}) =>
        historyEntries
          .filter((entry) => !query || entry.title.toLowerCase().includes(String(query).toLowerCase()))
          .slice(0, limit || 100)
    },
    emit: () => {}
  });
  return { agent, store };
}

test('library tools validate their arguments', () => {
  assert.deepEqual(validateToolArguments('browser_history', { query: 'x', limit: 10 }), { query: 'x', limit: 10 });
  assert.throws(() => validateToolArguments('browser_history', { limit: 999 }), /limit is too large/);
  assert.deepEqual(validateToolArguments('page_bookmark', { action: 'toggle' }), { action: 'toggle' });
  assert.throws(() => validateToolArguments('page_bookmark', { action: 'star' }), /action is invalid/);
});

test('browser_history returns visited pages with redacted URLs', async () => {
  const { agent } = createLibraryAgent();
  const result = await agent.executeTool(dispatchRun(), 'browser_history', { limit: 10 });
  assert.equal(result.ok, true);
  assert.equal(result.entries.length, 2);
  assert.equal(result.entries[0].title, 'Alpha');
  assert.equal(result.entries[0].url, 'https://example.com/a');
});

test('page_bookmark adds and removes the current tab bookmark', async () => {
  const { agent, store } = createLibraryAgent();
  const run = dispatchRun();
  const added = await agent.executeTool(run, 'page_bookmark', { action: 'add' });
  assert.equal(added.bookmarked, true);
  assert.equal(store.bookmarks.length, 1);
  const again = await agent.executeTool(run, 'page_bookmark', { action: 'add' });
  assert.equal(again.changed, false);
  const removed = await agent.executeTool(run, 'page_bookmark', { action: 'remove' });
  assert.equal(removed.bookmarked, false);
  assert.equal(store.bookmarks.length, 0);
});

test('reading_list_add saves the current tab exactly once', async () => {
  const { agent, store } = createLibraryAgent();
  const run = dispatchRun();
  const result = await agent.executeTool(run, 'reading_list_add', {});
  assert.equal(result.saved, true);
  assert.equal(store.readingList.length, 1);
  await agent.executeTool(run, 'reading_list_add', {});
  assert.equal(store.readingList.length, 1);
});
