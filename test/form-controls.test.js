'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AgentService,
  tools,
  validateToolArguments
} = require('../src/main/agent-service');

function toolSchema(name) {
  const definition = tools.find((tool) => tool.function.name === name);
  assert.ok(definition, `Missing ${name} tool`);
  return definition.function.parameters;
}

function createDispatchHarness(overrides = {}) {
  const calls = [];
  const browser = {
    activeTabId: 'tab-forms',
    getTab: () => ({
      id: 'tab-forms',
      url: 'https://forms.example/'
    }),
    setChecked: async (...args) => {
      calls.push({ name: 'setChecked', args });
      return { ok: true, stateMatched: true };
    },
    selectOption: async (...args) => {
      calls.push({ name: 'selectOption', args });
      return { ok: true, stateMatched: true };
    },
    typeText: async (...args) => {
      calls.push({ name: 'typeText', args });
      return { ok: true, fieldEvidence: { expectedLengthMatched: true } };
    },
    setStructuredValue: async (...args) => {
      calls.push({ name: 'setStructuredValue', args });
      return { ok: true, stateMatched: true };
    },
    setValue: async (...args) => {
      calls.push({ name: 'setValue', args });
      return { ok: true, stateMatched: true };
    },
    ...overrides
  };
  const agent = new AgentService({
    browser,
    settings: {},
    memory: {
      getConversation: () => []
    },
    emit: () => {}
  });
  const run = {
    id: 'form-contract-run',
    scope: 'active',
    currentTabId: 'tab-forms',
    allowedTabIds: new Set(['tab-forms']),
    abortController: new AbortController()
  };
  return { agent, calls, run };
}

test('page_select keeps scalar selection and accepts bounded multi-selection modes', () => {
  const schema = toolSchema('page_select');

  assert.ok(schema.properties.value, 'Scalar value compatibility was removed');
  assert.equal(schema.properties.value.type, 'string');
  assert.equal(schema.properties.values.type, 'array');
  assert.equal(schema.properties.values.items.type, 'string');
  assert.deepEqual(
    schema.properties.mode.enum,
    ['replace', 'add', 'remove']
  );

  assert.deepEqual(
    validateToolArguments('page_select', {
      ref: 's1-e1',
      value: 'Pro'
    }),
    {
      ref: 's1-e1',
      value: 'Pro'
    }
  );
  for (const mode of ['replace', 'add', 'remove']) {
    assert.deepEqual(
      validateToolArguments('page_select', {
        ref: 's1-e1',
        values: ['Email', 'SMS'],
        mode
      }),
      {
        ref: 's1-e1',
        values: ['Email', 'SMS'],
        mode
      }
    );
  }

  assert.throws(
    () => validateToolArguments('page_select', { ref: 's1-e1' }),
    /value|values/i
  );
  assert.throws(
    () => validateToolArguments('page_select', {
      ref: 's1-e1',
      value: 'Email',
      values: ['SMS']
    }),
    /value|values|exactly one/i
  );
  assert.throws(
    () => validateToolArguments('page_select', {
      ref: 's1-e1',
      values: []
    }),
    /too few|values/i
  );
  assert.throws(
    () => validateToolArguments('page_select', {
      ref: 's1-e1',
      values: ['Email'],
      mode: 'toggle'
    }),
    /mode is invalid/i
  );
});

test('page_select forwards scalar and multi-value intent to the browser broker', async () => {
  const scalar = createDispatchHarness();
  await scalar.agent.executeTool(scalar.run, 'page_select', {
    ref: 's1-e1',
    value: 'Pro'
  });
  assert.equal(scalar.calls.length, 1);
  assert.equal(scalar.calls[0].name, 'selectOption');
  assert.equal(scalar.calls[0].args[0], 'tab-forms');
  assert.equal(scalar.calls[0].args[1], 's1-e1');
  assert.ok(
    scalar.calls[0].args.slice(2).some((argument) => (
      argument === 'Pro' ||
      (
        argument &&
        typeof argument === 'object' &&
        (
          argument.value === 'Pro' ||
          argument.values?.includes?.('Pro')
        )
      )
    )),
    'Scalar selection was not forwarded'
  );

  const multiple = createDispatchHarness();
  await multiple.agent.executeTool(multiple.run, 'page_select', {
    ref: 's2-e3',
    values: ['Email', 'SMS'],
    mode: 'add'
  });
  assert.equal(multiple.calls.length, 1);
  assert.equal(multiple.calls[0].name, 'selectOption');
  assert.equal(multiple.calls[0].args[0], 'tab-forms');
  assert.equal(multiple.calls[0].args[1], 's2-e3');
  const forwarded = JSON.stringify(multiple.calls[0].args.slice(2));
  assert.match(forwarded, /Email/);
  assert.match(forwarded, /SMS/);
  assert.match(forwarded, /add/);
});

test('contenteditable and ARIA checked controls retain deterministic tool routes', async () => {
  const harness = createDispatchHarness();

  await harness.agent.executeTool(harness.run, 'page_type', {
    ref: 's3-e1',
    text: 'Editable response',
    clear: true
  });
  await harness.agent.executeTool(harness.run, 'page_set_checked', {
    ref: 's3-e2',
    checked: true
  });

  assert.deepEqual(harness.calls[0], {
    name: 'typeText',
    args: [
      'tab-forms',
      's3-e1',
      'Editable response',
      { clear: true, submit: false }
    ]
  });
  assert.deepEqual(harness.calls[1], {
    name: 'setChecked',
    args: ['tab-forms', 's3-e2', true]
  });
});

test('page_set_value validates and forwards structured native input values', async () => {
  const schema = toolSchema('page_set_value');
  assert.equal(schema.properties.ref.type, 'string');
  assert.equal(schema.properties.value.type, 'string');

  assert.deepEqual(
    validateToolArguments('page_set_value', {
      ref: 's4-e1',
      value: '2026-08-10'
    }),
    {
      ref: 's4-e1',
      value: '2026-08-10'
    }
  );
  assert.throws(
    () => validateToolArguments('page_set_value', {
      ref: 's4-e1',
      value: 42
    }),
    /value must be a string/i
  );

  const harness = createDispatchHarness();
  await harness.agent.executeTool(harness.run, 'page_set_value', {
    ref: 's4-e1',
    value: '2026-08-10'
  });
  assert.equal(harness.calls.length, 1);
  assert.ok(
    ['setStructuredValue', 'setValue'].includes(harness.calls[0].name),
    'Structured input did not use the browser value broker'
  );
  assert.equal(harness.calls[0].args[0], 'tab-forms');
  assert.equal(harness.calls[0].args[1], 's4-e1');
  assert.ok(
    JSON.stringify(harness.calls[0].args.slice(2)).includes('2026-08-10')
  );
});
