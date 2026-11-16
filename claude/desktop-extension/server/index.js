#!/usr/bin/env node
/*
 * Copyright 2026 Plataine Inc
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Plataine AI Agents - MCP server for Claude Desktop.
 *
 * Exposes one tool, plataine_ai_agent_bridge, that forwards a request to the
 * Plataine AI Agents of a TPO environment and returns their answer.
 *
 * The server signs in to TPO as the configured user, so every request runs
 * with that user's TPO permissions and is recorded in the TPO audit trail.
 *
 *   1. POST {tpo}/users/doLogin              sign in, keep the session cookie
 *   2. POST {tpo}/ai/chatbot/invoke-stream   send the request, read the answer stream
 *
 * Settings are read from environment variables that Claude Desktop fills in
 * from the extension settings. Nothing is hard-coded: the TPO address is
 * provided by Plataine, and the password is kept in the operating system's
 * secure storage.
 *
 * Transport: MCP over stdio, one JSON-RPC message per line. stdout carries
 * protocol messages only; diagnostics go to stderr.
 *
 * Runtime: Node.js 18 or later. No dependencies.
 */
'use strict';

const crypto = require('crypto');
const readline = require('readline');

const SERVER_INFO = { name: 'plataine-ai-agents', version: '1.0.0' };
const TOOL_NAME = 'plataine_ai_agent_bridge';

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

// A setting counts as provided only when it is non-empty and is not an
// unresolved ${...} placeholder left by the host.
function setting(name) {
  const value = (process.env[name] || '').trim();
  return value && !value.includes('${') ? value : '';
}

const TPO_URL = setting('PLATAINE_TPO_URL').replace(/\/+$/, '');
const ORG = setting('PLATAINE_ORG');
const USERNAME = setting('PLATAINE_USERNAME');
const PASSWORD = setting('PLATAINE_PASSWORD');
const TIMEOUT_MS = Number(setting('PLATAINE_TIMEOUT_SECONDS') || 170) * 1000;

class PlataineError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}

function checkSettings() {
  const missing = [
    !TPO_URL && 'TPO address',
    !ORG && 'organization',
    !USERNAME && 'user name',
    !PASSWORD && 'password',
  ].filter(Boolean);
  if (missing.length) {
    throw new PlataineError(
      'PLATAINE_SETTINGS_MISSING',
      `missing ${missing.join(', ')}. Nothing was sent to Plataine. ` +
        'The user must complete the Plataine AI Agents extension settings in Claude Desktop, then try again.',
    );
  }
  let url;
  try { url = new URL(TPO_URL); } catch { url = null; }
  const local = url && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!url || !(url.protocol === 'https:' || (url.protocol === 'http:' && local))) {
    throw new PlataineError(
      'PLATAINE_SETTINGS_INVALID',
      'the TPO address must be the https address provided by Plataine. ' +
        'The user must correct it in the Plataine AI Agents extension settings in Claude Desktop.',
    );
  }
}

const log = (...args) => process.stderr.write(`[plataine-ai-agents] ${args.join(' ')}\n`);

// ---------------------------------------------------------------------------
// TPO session
// ---------------------------------------------------------------------------

const cookies = new Map();
let signedIn = false;
// One conversation id per server process keeps the agents' memory across
// requests. The agent runtime requires at least 33 characters; a UUID has 36.
let conversationId = crypto.randomUUID();

function storeCookies(res) {
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  for (const line of list) {
    const pair = line.split(';')[0];
    const eq = pair.indexOf('=');
    if (eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function cookieHeader() {
  return [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function post(path, body, accept) {
  const headers = { Accept: accept, 'Content-Type': 'application/json' };
  if (cookies.size) headers.Cookie = cookieHeader();
  let res;
  try {
    res = await fetch(`${TPO_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err && err.name === 'TimeoutError') {
      throw new PlataineError('PLATAINE_TIMEOUT', `no answer from TPO within ${TIMEOUT_MS / 1000} seconds.`);
    }
    throw new PlataineError(
      'PLATAINE_UNREACHABLE',
      'could not connect to TPO. Check the network connection and the TPO address in the extension settings.',
    );
  }
  storeCookies(res);
  return res;
}

async function readBody(res) {
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  return { text, json };
}

// Returns the first non-empty string stored under any of `keys`, anywhere in a JSON value.
function findString(value, keys) {
  if (!value || typeof value !== 'object') return null;
  for (const key of keys) {
    if (typeof value[key] === 'string' && value[key].trim()) return value[key];
  }
  for (const child of Object.values(value)) {
    const hit = findString(child, keys);
    if (hit) return hit;
  }
  return null;
}

function serverMessage(body) {
  return findString(body.json, ['message', 'errorMessage', 'error']) || (body.json ? '' : body.text.slice(0, 300));
}

async function signIn() {
  cookies.clear();
  signedIn = false;
  const res = await post('/users/doLogin', {
    org: ORG, username: USERNAME, password: PASSWORD, rememberMe: false,
  }, 'application/json');
  const body = await readBody(res);
  if (res.status === 401 || res.status === 403) {
    throw new PlataineError(
      'PLATAINE_LOGIN_REFUSED',
      `TPO refused the sign-in for user "${USERNAME}" in organization "${ORG}". ${serverMessage(body)} ` +
        'The user must check the organization, user name and password in the Plataine AI Agents extension settings. ' +
        'Accounts that sign in through single sign-on are not supported.',
    );
  }
  if (res.status >= 400 || !cookies.size) {
    throw new PlataineError('PLATAINE_LOGIN_FAILED', `TPO sign-in failed (HTTP ${res.status}). ${serverMessage(body)}`.trim());
  }
  signedIn = true;
  log(`signed in as ${USERNAME}@${ORG}`);
}

// ---------------------------------------------------------------------------
// Request to the agents
// ---------------------------------------------------------------------------

// The answer arrives as a server-sent event stream. Each line is
//   data:{"type":"token","text":"..."}      a piece of the answer
//   data:{"type":"status","message":"..."}  progress, not part of the answer
//   data:{"type":"interrupt", ...}          the agents wait for the user's approval
//   data:[DONE]                             end of the answer
async function streamOnce(prompt) {
  const res = await post('/ai/chatbot/invoke-stream', { prompt, sessionId: conversationId }, 'text/event-stream');
  const type = res.headers.get('content-type') || '';
  if (res.status !== 200 || !type.includes('text/event-stream')) {
    const body = await readBody(res);
    return { status: res.status, body, answer: '', done: false, interrupt: null };
  }

  let answer = '';
  let done = false;
  let interrupt = null;
  const onLine = (line) => {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (data === '[DONE]') { done = true; return; }
    let event;
    try { event = JSON.parse(data); } catch { return; }
    if (event && event.type === 'token' && typeof event.text === 'string') answer += event.text;
    else if (event && event.type === 'interrupt') interrupt = event;
  };

  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      onLine(buffer.slice(0, newline).replace(/\r$/, ''));
      buffer = buffer.slice(newline + 1);
    }
  }
  if (buffer) onLine(buffer.replace(/\r$/, ''));
  return { status: 200, body: { text: '', json: null }, answer, done, interrupt };
}

function sessionRejected(result) {
  if (result.status === 401 || result.status === 403) return true;
  if (result.status >= 300 && result.status < 400) return true;
  if (result.status === 400 && /session not available|log in again/i.test(result.body.text)) return true;
  // An empty stream that never completed is how TPO reports a missing session.
  return result.status === 200 && !result.done && !result.answer && !result.interrupt;
}

async function askAgents(prompt) {
  checkSettings();
  if (!signedIn) await signIn();

  let result = await streamOnce(prompt);
  if (sessionRejected(result)) {
    log('session expired, signing in again');
    await signIn();
    result = await streamOnce(prompt);
    if (sessionRejected(result)) {
      throw new PlataineError(
        'PLATAINE_SIGN_IN_NOT_SUPPORTED',
        'TPO accepted the password but did not open a session for the AI Agents. ' +
          'Accounts that require multi-factor authentication or single sign-on are not supported. ' +
          'The user should contact Plataine.',
      );
    }
  }
  if (result.status !== 200) {
    throw new PlataineError('PLATAINE_REQUEST_FAILED', `TPO returned HTTP ${result.status}. ${serverMessage(result.body)}`.trim());
  }

  const { text, images } = splitImages(result.answer);
  let answer = text;
  if (result.interrupt) {
    answer += '\n\n[The Plataine AI Agents paused and are waiting for the user\'s approval before acting. ' +
      'Show the user what is about to be done and ask for a decision. ' +
      'Send the decision as the next request, as the single word "approve" or "reject". ' +
      `Details: ${JSON.stringify(result.interrupt.payload ?? result.interrupt)}]`;
  } else if (!result.done) {
    answer += '\n\n[The answer ended before the agents finished. The text above may be incomplete.]';
  }
  answer = answer.trim();
  if (!answer && !images.length) throw new PlataineError('PLATAINE_EMPTY_ANSWER', 'the agents returned no answer.');
  return { text: answer, images };
}

// Charts arrive inside the answer text as
//   [[TPO_IMAGE]]data:image/png;base64,...[[/TPO_IMAGE]]
// They are returned to Claude as images, and removed from the text.
const IMAGE_MARKER = /\[\[TPO_IMAGE\]\]\s*data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+?)\s*\[\[\/TPO_IMAGE\]\]/gi;

function splitImages(answer) {
  const images = [];
  const text = answer.replace(IMAGE_MARKER, (_, mimeType, data) => {
    images.push({ mimeType: mimeType.toLowerCase(), data: data.replace(/\s+/g, '') });
    return '';
  });
  return { text: text.replace(/\n{3,}/g, '\n\n'), images };
}

// ---------------------------------------------------------------------------
// MCP (JSON-RPC 2.0 over stdio)
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: TOOL_NAME,
    description:
      'The bridge between Claude and the Plataine AI Agents. Send any request, whether a question, an instruction or an action to carry out, and get the agents\' answer back. ' +
      'The agents work on the live production data of the user\'s Plataine TPO environment: work orders, ' +
      'production schedule, stations and locations, materials, kits, tools, shifts, users, alerts and reports. ' +
      'Pass the user\'s request in plain language, complete and unchanged in meaning. ' +
      'The agents remember earlier requests of the same conversation, so follow-ups can be short. ' +
      'Relay the answer faithfully and show any chart that is returned. Never invent production data.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The request for the Plataine AI Agents, in plain language: a question, an instruction or an action.',
        },
        new_conversation: {
          type: 'boolean',
          description: 'Set to true to start a fresh conversation with no memory of earlier requests. Default false.',
        },
      },
      required: ['prompt'],
    },
  },
];

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

async function callTool(args) {
  if (typeof args.prompt !== 'string' || !args.prompt.trim()) {
    return { content: [{ type: 'text', text: 'A non-empty prompt is required.' }], isError: true };
  }
  if (args.new_conversation === true) conversationId = crypto.randomUUID();
  try {
    const { text, images } = await askAgents(args.prompt.trim());
    const content = [];
    if (text) content.push({ type: 'text', text });
    for (const image of images) content.push({ type: 'image', data: image.data, mimeType: image.mimeType });
    return { content };
  } catch (err) {
    const text = err instanceof PlataineError ? err.message : `PLATAINE_ERROR: ${String((err && err.message) || err)}`;
    log(text);
    return { content: [{ type: 'text', text }], isError: true };
  }
}

async function handle(message) {
  const { id, method, params } = message;
  const isRequest = id !== undefined && id !== null;
  const reply = (result) => { if (isRequest) send({ jsonrpc: '2.0', id, result }); };
  const fail = (code, text) => { if (isRequest) send({ jsonrpc: '2.0', id, error: { code, message: text } }); };

  switch (method) {
    case 'initialize':
      return reply({
        protocolVersion: (params && params.protocolVersion) || '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: TOOLS });
    case 'resources/list':
      return reply({ resources: [] });
    case 'prompts/list':
      return reply({ prompts: [] });
    case 'tools/call': {
      const name = params && params.name;
      if (name !== TOOL_NAME) return fail(-32602, `Unknown tool: ${name}`);
      return reply(await callTool((params && params.arguments) || {}));
    }
    default:
      return fail(-32601, `Method not found: ${method}`);
  }
}

const input = readline.createInterface({ input: process.stdin, terminal: false });
input.on('line', (line) => {
  if (!line.trim()) return;
  let message;
  try { message = JSON.parse(line); } catch { return log('ignored a line that is not JSON'); }
  handle(message).catch((err) => log('unhandled:', String((err && err.stack) || err)));
});
input.on('close', () => process.exit(0));
log('started');
