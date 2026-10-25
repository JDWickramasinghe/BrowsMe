'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PROVIDERS,
  getProvider,
  buildChatRequest,
  parseChatResponse,
  toAnthropicMessages,
  toGeminiContents,
  sanitizeGeminiSchema
} = require('../src/main/providers');

const SAMPLE_MESSAGES = [
  { role: 'system', content: 'You are BrowsMe.' },
  { role: 'user', content: 'Open example.com' },
  { role: 'assistant', content: 'Opening it.', tool_calls: [
    { id: 'call_1', type: 'function', function: { name: 'browser_open_tab', arguments: '{"url":"https://example.com"}' } }
  ] },
  { role: 'tool', tool_call_id: 'call_1', content: '{"ok":true,"tabId":"tab-1"}' }
];

const SAMPLE_TOOLS = [
  { type: 'function', function: { name: 'browser_open_tab', description: 'Open a tab', parameters: { type: 'object', properties: { url: { type: 'string' } }, additionalProperties: false } } }
];

const baseParams = (overrides) => ({
  model: 'm', apiKey: 'k', messages: SAMPLE_MESSAGES, tools: SAMPLE_TOOLS,
  maxTokens: 1000, temperature: 0.1, thinking: 'enabled', reasoningEffort: 'medium',
  ...overrides
});

test('OpenAI adapter: DeepSeek sends thinking, generic endpoints do not', () => {
  const deepseek = buildChatRequest(getProvider('deepseek'), baseParams({ baseUrl: 'https://api.deepseek.com' }));
  assert.equal(deepseek.url, 'https://api.deepseek.com/chat/completions');
  assert.deepEqual(deepseek.body.thinking, { type: 'enabled' });
  assert.equal(deepseek.headers.Authorization, 'Bearer k');

  const ollama = buildChatRequest(getProvider('ollama'), baseParams({ baseUrl: 'http://localhost:11434/v1', apiKey: '' }));
  assert.equal(ollama.url, 'http://localhost:11434/v1/chat/completions');
  assert.equal(ollama.body.thinking, undefined, 'must not send DeepSeek thinking to a generic endpoint');
  assert.equal(ollama.body.reasoning_effort, undefined);
  assert.equal(ollama.body.temperature, 0.1);
  assert.equal(ollama.headers.Authorization, undefined, 'no Authorization header without a key');
});

test('OpenAI adapter: parses tool calls and content', () => {
  const parsed = parseChatResponse(getProvider('openai'), {
    choices: [{ finish_reason: 'tool_calls', message: { content: 'hi', tool_calls: [{ id: 'c', type: 'function', function: { name: 'x', arguments: '{}' } }] } }]
  });
  assert.equal(parsed.content, 'hi');
  assert.equal(parsed.tool_calls[0].function.name, 'x');
});

test('Anthropic adapter: splits system, converts tool_use/tool_result, reshapes tools', () => {
  const req = buildChatRequest(getProvider('anthropic'), baseParams({ baseUrl: 'https://api.anthropic.com' }));
  assert.equal(req.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(req.headers['x-api-key'], 'k');
  assert.equal(req.headers['anthropic-version'], '2023-06-01');
  assert.equal(req.body.system, 'You are BrowsMe.');
  assert.equal(req.body.messages[0].role, 'user');

  const assistant = req.body.messages.find((m) => m.role === 'assistant');
  assert.equal(assistant.content.find((b) => b.type === 'tool_use').name, 'browser_open_tab');

  const toolResult = req.body.messages.reverse().find((m) => m.role === 'user' && m.content[0].type === 'tool_result');
  assert.equal(toolResult.content[0].tool_use_id, 'call_1');

  assert.equal(req.body.tools[0].name, 'browser_open_tab');
  assert.ok(req.body.tools[0].input_schema);
});

test('Anthropic adapter: merges consecutive tool results into one user message', () => {
  const messages = [
    { role: 'assistant', content: '', tool_calls: [
      { id: 'a', type: 'function', function: { name: 'x', arguments: '{}' } },
      { id: 'b', type: 'function', function: { name: 'y', arguments: '{}' } }
    ] },
    { role: 'tool', tool_call_id: 'a', content: '1' },
    { role: 'tool', tool_call_id: 'b', content: '2' }
  ];
  const converted = toAnthropicMessages(messages);
  const userMsgs = converted.filter((m) => m.role === 'user');
  assert.equal(userMsgs.length, 1);
  assert.equal(userMsgs[0].content.length, 2);
});

test('Anthropic adapter: parses text + tool_use into common shape', () => {
  const parsed = parseChatResponse(getProvider('anthropic'), {
    content: [
      { type: 'text', text: 'working' },
      { type: 'tool_use', id: 'tu_1', name: 'page_click', input: { ref: 'e1' } }
    ],
    stop_reason: 'tool_use'
  });
  assert.equal(parsed.content, 'working');
  assert.equal(parsed.tool_calls[0].id, 'tu_1');
  assert.equal(parsed.tool_calls[0].function.name, 'page_click');
  assert.equal(parsed.tool_calls[0].function.arguments, '{"ref":"e1"}');
});

test('Gemini adapter: systemInstruction, role mapping, functionResponse name resolution', () => {
  const req = buildChatRequest(getProvider('gemini'), baseParams({ baseUrl: 'https://generativelanguage.googleapis.com' }));
  assert.match(req.url, /\/v1beta\/models\/m:generateContent$/);
  assert.equal(req.headers['x-goog-api-key'], 'k');
  assert.equal(req.body.systemInstruction.parts[0].text, 'You are BrowsMe.');
  const modelTurn = req.body.contents.find((c) => c.role === 'model');
  assert.equal(modelTurn.parts.find((p) => p.functionCall).functionCall.name, 'browser_open_tab');

  const fnResp = req.body.contents.find((c) => c.parts[0].functionResponse);
  assert.equal(fnResp.parts[0].functionResponse.name, 'browser_open_tab');

  assert.equal(req.body.tools[0].functionDeclarations[0].parameters.additionalProperties, undefined);
});

test('Gemini adapter: parses functionCall parts into tool_calls', () => {
  const parsed = parseChatResponse(getProvider('gemini'), {
    candidates: [{ content: { parts: [{ text: 'ok' }, { functionCall: { name: 'page_scroll', args: { direction: 'down' } } }] }, finishReason: 'STOP' }]
  });
  assert.equal(parsed.content, 'ok');
  assert.equal(parsed.tool_calls[0].function.name, 'page_scroll');
  assert.equal(parsed.tool_calls[0].function.arguments, '{"direction":"down"}');
  assert.ok(parsed.tool_calls[0].id, 'a synthetic id is assigned');
});

test('sanitizeGeminiSchema strips additionalProperties recursively, keeps the rest', () => {
  const cleaned = sanitizeGeminiSchema({
    type: 'object', additionalProperties: false,
    properties: { a: { type: 'string', enum: ['x'] }, b: { type: 'object', additionalProperties: false, properties: {} } },
    required: ['a']
  });
  assert.equal(cleaned.additionalProperties, undefined);
  assert.equal(cleaned.properties.b.additionalProperties, undefined);
  assert.deepEqual(cleaned.properties.a.enum, ['x']);
  assert.deepEqual(cleaned.required, ['a']);
});

test('provider catalog marks local providers key-optional', () => {
  assert.equal(PROVIDERS.ollama.keyRequired, false);
  assert.equal(PROVIDERS.lmstudio.local, true);
  assert.equal(PROVIDERS.deepseek.keyRequired, true);
  assert.equal(getProvider('nonsense').label, PROVIDERS.deepseek.label, 'unknown provider falls back to DeepSeek');
});
