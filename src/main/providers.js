'use strict';

const PROVIDERS = Object.freeze({
  deepseek: {
    label: 'DeepSeek', protocol: 'openai', baseUrl: 'https://api.deepseek.com',
    keyRequired: true, local: false, deepseekThinking: true, reasoningEffort: true,
    defaultModel: 'deepseek-v4-flash'
  },
  openai: {
    label: 'OpenAI', protocol: 'openai', baseUrl: 'https://api.openai.com/v1',
    keyRequired: true, local: false, reasoningEffort: true, defaultModel: 'gpt-4o'
  },
  openrouter: {
    label: 'OpenRouter', protocol: 'openai', baseUrl: 'https://openrouter.ai/api/v1',
    keyRequired: true, local: false, defaultModel: 'openai/gpt-4o'
  },
  groq: {
    label: 'Groq', protocol: 'openai', baseUrl: 'https://api.groq.com/openai/v1',
    keyRequired: true, local: false, defaultModel: 'llama-3.3-70b-versatile'
  },
  mistral: {
    label: 'Mistral', protocol: 'openai', baseUrl: 'https://api.mistral.ai/v1',
    keyRequired: true, local: false, defaultModel: 'mistral-large-latest'
  },
  anthropic: {
    label: 'Anthropic', protocol: 'anthropic', baseUrl: 'https://api.anthropic.com',
    keyRequired: true, local: false, defaultModel: 'claude-sonnet-4-5'
  },
  gemini: {
    label: 'Google Gemini', protocol: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com',
    keyRequired: true, local: false, defaultModel: 'gemini-2.5-flash'
  },
  ollama: {
    label: 'Ollama (local)', protocol: 'openai', baseUrl: 'http://localhost:11434/v1',
    keyRequired: false, local: true, defaultModel: 'qwen2.5'
  },
  lmstudio: {
    label: 'LM Studio (local)', protocol: 'openai', baseUrl: 'http://localhost:1234/v1',
    keyRequired: false, local: true, defaultModel: ''
  },
  custom: {
    label: 'Custom (OpenAI-compatible)', protocol: 'openai', baseUrl: '',
    keyRequired: false, local: false, defaultModel: ''
  }
});

const PROVIDER_VALUES = new Set(Object.keys(PROVIDERS));

function getProvider(id) {
  return PROVIDERS[id] || PROVIDERS.deepseek;
}

function trimTrailingSlashes(value) {
  return String(value || '').replace(/\/+$/, '');
}

function safeParseJsonObject(value) {
  if (value && typeof value === 'object') {
    return value;
  }
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function splitSystem(messages) {
  const systemParts = [];
  const rest = [];
  for (const message of messages) {
    if (message.role === 'system') {
      systemParts.push(String(message.content || ''));
    } else {
      rest.push(message);
    }
  }
  return { system: systemParts.join('\n\n'), rest };
}

function buildOpenAiRequest(provider, params) {
  const { baseUrl, model, apiKey, messages, tools, maxTokens, temperature, thinking, reasoningEffort } = params;
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  const body = { model, messages, tools, max_tokens: maxTokens };
  if (provider.deepseekThinking && thinking) {
    body.thinking = { type: thinking };
  }
  if (provider.reasoningEffort && reasoningEffort) {
    body.reasoning_effort = reasoningEffort;
  } else {
    body.temperature = typeof temperature === 'number' ? temperature : 0.1;
  }
  return {
    url: `${trimTrailingSlashes(baseUrl)}/chat/completions`,
    headers,
    body
  };
}

function parseOpenAiResponse(payload) {
  const choice = payload?.choices?.[0];
  const message = choice?.message;
  if (choice?.finish_reason === 'insufficient_system_resource') {
    const error = new Error('The model provider temporarily lacked capacity for this step.');
    error.status = 503;
    throw error;
  }
  if (!message || typeof message !== 'object') {
    throw new Error('The model returned an invalid response.');
  }
  if (choice.finish_reason === 'length') {
    throw new Error('The model reached its response limit before completing the action. Try a smaller request.');
  }
  if (choice.finish_reason === 'content_filter') {
    throw new Error('The model could not return this response because it was filtered.');
  }
  return {
    role: 'assistant',
    content: message.content || '',
    ...(typeof message.reasoning_content === 'string' ? { reasoning_content: message.reasoning_content } : {}),
    ...(Array.isArray(message.tool_calls) ? { tool_calls: message.tool_calls } : {})
  };
}

function toAnthropicMessages(rest) {
  const out = [];
  let toolResultBuffer = [];
  const flushToolResults = () => {
    if (toolResultBuffer.length) {
      out.push({ role: 'user', content: toolResultBuffer });
      toolResultBuffer = [];
    }
  };
  for (const message of rest) {
    if (message.role === 'tool') {
      toolResultBuffer.push({
        type: 'tool_result',
        tool_use_id: String(message.tool_call_id || ''),
        content: String(message.content || '')
      });
      continue;
    }
    flushToolResults();
    if (message.role === 'assistant') {
      const content = [];
      if (message.content) {
        content.push({ type: 'text', text: String(message.content) });
      }
      for (const call of message.tool_calls || []) {
        content.push({
          type: 'tool_use',
          id: String(call.id || ''),
          name: call.function?.name || '',
          input: safeParseJsonObject(call.function?.arguments)
        });
      }
      out.push({ role: 'assistant', content: content.length ? content : [{ type: 'text', text: '' }] });
    } else {
      out.push({ role: 'user', content: [{ type: 'text', text: String(message.content || '') }] });
    }
  }
  flushToolResults();
  return out;
}

function buildAnthropicRequest(provider, params) {
  const { baseUrl, model, apiKey, messages, tools, maxTokens, temperature } = params;
  const { system, rest } = splitSystem(messages);
  const body = {
    model,
    max_tokens: maxTokens,
    messages: toAnthropicMessages(rest),
    tools: (tools || []).map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters
    }))
  };
  if (system) {
    body.system = system;
  }
  if (typeof temperature === 'number') {
    body.temperature = temperature;
  }
  return {
    url: `${trimTrailingSlashes(baseUrl)}/v1/messages`,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey || '',
      'anthropic-version': '2023-06-01'
    },
    body
  };
}

function parseAnthropicResponse(payload) {
  if (payload?.type === 'error') {
    throw new Error(payload.error?.message || 'The model returned an error.');
  }
  const blocks = Array.isArray(payload?.content) ? payload.content : [];
  const text = blocks.filter((b) => b.type === 'text').map((b) => b.text || '').join('');
  const toolCalls = blocks
    .filter((b) => b.type === 'tool_use')
    .map((b) => ({
      id: String(b.id || ''),
      type: 'function',
      function: { name: b.name || '', arguments: JSON.stringify(b.input || {}) }
    }));
  if (payload?.stop_reason === 'max_tokens' && !toolCalls.length && !text) {
    throw new Error('The model reached its response limit before completing the action. Try a smaller request.');
  }
  return {
    role: 'assistant',
    content: text,
    ...(toolCalls.length ? { tool_calls: toolCalls } : {})
  };
}

function sanitizeGeminiSchema(schema) {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }
  if (Array.isArray(schema)) {
    return schema.map(sanitizeGeminiSchema);
  }
  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'additionalProperties') {
      continue;
    }
    out[key] = sanitizeGeminiSchema(value);
  }
  return out;
}

function toolCallNamesById(rest) {
  const names = new Map();
  for (const message of rest) {
    if (message.role === 'assistant') {
      for (const call of message.tool_calls || []) {
        names.set(String(call.id || ''), call.function?.name || '');
      }
    }
  }
  return names;
}

function toGeminiContents(rest) {
  const names = toolCallNamesById(rest);
  const contents = [];
  for (const message of rest) {
    if (message.role === 'tool') {
      contents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name: names.get(String(message.tool_call_id || '')) || 'tool',
            response: { result: String(message.content || '') }
          }
        }]
      });
    } else if (message.role === 'assistant') {
      const parts = [];
      if (message.content) {
        parts.push({ text: String(message.content) });
      }
      for (const call of message.tool_calls || []) {
        parts.push({ functionCall: { name: call.function?.name || '', args: safeParseJsonObject(call.function?.arguments) } });
      }
      contents.push({ role: 'model', parts: parts.length ? parts : [{ text: '' }] });
    } else {
      contents.push({ role: 'user', parts: [{ text: String(message.content || '') }] });
    }
  }
  return contents;
}

function buildGeminiRequest(provider, params) {
  const { baseUrl, model, apiKey, messages, tools, maxTokens, temperature } = params;
  const { system, rest } = splitSystem(messages);
  const body = {
    contents: toGeminiContents(rest),
    tools: [{
      functionDeclarations: (tools || []).map((tool) => ({
        name: tool.function.name,
        description: tool.function.description,
        parameters: sanitizeGeminiSchema(tool.function.parameters)
      }))
    }],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: typeof temperature === 'number' ? temperature : 0.1
    }
  };
  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }
  return {
    url: `${trimTrailingSlashes(baseUrl)}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey || ''
    },
    body
  };
}

let geminiCallCounter = 0;

function parseGeminiResponse(payload) {
  if (payload?.error) {
    throw new Error(payload.error?.message || 'The model returned an error.');
  }
  const candidate = payload?.candidates?.[0];
  const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
  const text = parts.filter((p) => typeof p.text === 'string').map((p) => p.text).join('');
  const toolCalls = parts
    .filter((p) => p.functionCall)
    .map((p) => {
      geminiCallCounter += 1;
      return {
        id: `gemini-${Date.now()}-${geminiCallCounter}`,
        type: 'function',
        function: { name: p.functionCall.name || '', arguments: JSON.stringify(p.functionCall.args || {}) }
      };
    });
  if (candidate?.finishReason === 'MAX_TOKENS' && !toolCalls.length && !text) {
    throw new Error('The model reached its response limit before completing the action. Try a smaller request.');
  }
  return {
    role: 'assistant',
    content: text,
    ...(toolCalls.length ? { tool_calls: toolCalls } : {})
  };
}

function buildChatRequest(provider, params) {
  switch (provider.protocol) {
    case 'anthropic':
      return buildAnthropicRequest(provider, params);
    case 'gemini':
      return buildGeminiRequest(provider, params);
    default:
      return buildOpenAiRequest(provider, params);
  }
}

function parseChatResponse(provider, payload) {
  switch (provider.protocol) {
    case 'anthropic':
      return parseAnthropicResponse(payload);
    case 'gemini':
      return parseGeminiResponse(payload);
    default:
      return parseOpenAiResponse(payload);
  }
}

module.exports = {
  PROVIDERS,
  PROVIDER_VALUES,
  getProvider,
  buildChatRequest,
  parseChatResponse,

  toAnthropicMessages,
  toGeminiContents,
  sanitizeGeminiSchema
};
