/*
 * Copyright 2026 Plataine Inc
 * Licensed under the Apache License, Version 2.0. See the LICENSE file.
 */

/**
 * End-to-end tests of the MCP server against a local stand-in for TPO.
 * The stand-in implements the two calls the server makes: sign-in and the
 * answer stream. Nothing here contacts a real TPO environment.
 */
'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { test, before, after } = require('node:test');

const SERVER = path.resolve(__dirname, '..', 'claude', 'desktop-extension', 'server', 'index.js');
const TOOL = 'plataine_ai_agent_bridge';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const USER = { org: 'acme', username: 'planner', password: 'test-only-value' };

// --- stand-in for TPO -------------------------------------------------------

const tpo = { session: 'S0', signIns: 0, requests: [], mfa: false };

const standIn = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {};
    if (req.url === '/users/doLogin') {
      const ok = body.org === USER.org && body.username === USER.username && body.password === USER.password;
      if (!ok) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ applicationResponseStatus: { message: 'The login details you provided are incorrect.' } }));
      }
      tpo.signIns += 1;
      tpo.session = `S${tpo.signIns}`;
      res.writeHead(302, { Location: '/users/profile', 'Set-Cookie': [`SESSION=${tpo.session}; Path=/; HttpOnly`, 'LB=x; Path=/'] });
      return res.end();
    }
    if (req.url === '/ai/chatbot/invoke-stream') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const hasSession = (req.headers.cookie || '').includes(`SESSION=${tpo.session}`);
      if (!hasSession || tpo.mfa) return res.end();
      tpo.requests.push(body);
      const pieces = body.prompt === 'chart'
        ? ['Work orders by month', `[[TPO_IMAGE]]data:image/png;base64,${PNG}[[/TPO_IMAGE]]`, '\nFebruary: 43']
        : `echo: ${body.prompt}`.split(/(?<= )/);
      res.write('data:{"type":"status","message":"Working..."}\n\n');
      let index = 0;
      const timer = setInterval(() => {
        if (index < pieces.length) {
          return res.write(`data:${JSON.stringify({ type: 'token', text: pieces[index++] })}\n\n`);
        }
        clearInterval(timer);
        if (body.prompt === 'delete WO-1') {
          res.write('data:{"type":"interrupt","agent":"work_orders","thread_id":"t1","payload":{"action":"delete WO-1"}}\n\n');
        }
        if (body.prompt !== 'cut short') res.write('data:[DONE]\n\n');
        res.end();
      }, 2);
      return undefined;
    }
    res.writeHead(404);
    return res.end();
  });
});

let address;
before(() => new Promise((resolve) => standIn.listen(0, '127.0.0.1', () => {
  address = `http://127.0.0.1:${standIn.address().port}/`;
  resolve();
})));
after(() => new Promise((resolve) => standIn.close(resolve)));

// --- MCP client -------------------------------------------------------------

function startServer(env) {
  const child = spawn(process.execPath, [SERVER], { env: { PATH: process.env.PATH, ...env }, stdio: ['pipe', 'pipe', 'ignore'] });
  const waiting = new Map();
  let buffer = '';
  let nextId = 0;
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const message = JSON.parse(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      const resolve = waiting.get(message.id);
      if (resolve) resolve(message);
    }
  });
  const rpc = (method, params) => new Promise((resolve) => {
    const id = ++nextId;
    waiting.set(id, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  const ask = async (args) => (await rpc('tools/call', { name: TOOL, arguments: args })).result;
  return { rpc, ask, stop: () => child.kill() };
}

const settings = (overrides = {}) => ({
  PLATAINE_TPO_URL: address,
  PLATAINE_ORG: USER.org,
  PLATAINE_USERNAME: USER.username,
  PLATAINE_PASSWORD: USER.password,
  ...overrides,
});

const textOf = (result) => result.content.filter((part) => part.type === 'text').map((part) => part.text).join('');

// --- tests ------------------------------------------------------------------

test('announces itself and its single tool', async () => {
  const server = startServer(settings());
  const init = await server.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
  assert.equal(init.result.serverInfo.name, 'plataine-ai-agents');
  assert.equal(init.result.serverInfo.version, '1.0.0');
  const list = await server.rpc('tools/list', {});
  assert.deepEqual(list.result.tools.map((tool) => tool.name), [TOOL]);
  server.stop();
});

test('signs in once, returns the answer, and keeps one conversation', async () => {
  tpo.requests.length = 0;
  const before = tpo.signIns;
  const server = startServer(settings());
  const first = await server.ask({ prompt: 'show work orders' });
  assert.equal(textOf(first), 'echo: show work orders');
  assert.ok(!first.isError);
  await server.ask({ prompt: 'and tomorrow?' });
  assert.equal(tpo.signIns, before + 1);
  assert.equal(tpo.requests[0].sessionId, tpo.requests[1].sessionId);
  assert.ok(tpo.requests[0].sessionId.length >= 33);
  await server.ask({ prompt: 'fresh start', new_conversation: true });
  assert.notEqual(tpo.requests[2].sessionId, tpo.requests[1].sessionId);
  server.stop();
});

test('signs in again when the TPO session has expired', async () => {
  const server = startServer(settings());
  await server.ask({ prompt: 'first' });
  const before = tpo.signIns;
  tpo.session = 'expired';
  const result = await server.ask({ prompt: 'after expiry' });
  assert.equal(textOf(result), 'echo: after expiry');
  assert.equal(tpo.signIns, before + 1);
  server.stop();
});

test('returns charts as images and removes them from the text', async () => {
  const server = startServer(settings());
  const result = await server.ask({ prompt: 'chart' });
  const images = result.content.filter((part) => part.type === 'image');
  assert.equal(images.length, 1);
  assert.equal(images[0].mimeType, 'image/png');
  assert.equal(images[0].data, PNG);
  assert.ok(!textOf(result).includes('TPO_IMAGE'));
  assert.match(textOf(result), /Work orders by month/);
  assert.match(textOf(result), /February: 43/);
  server.stop();
});

test('passes an approval request to the user instead of deciding', async () => {
  const server = startServer(settings());
  const result = await server.ask({ prompt: 'delete WO-1' });
  assert.match(textOf(result), /waiting for the user's approval/);
  assert.match(textOf(result), /delete WO-1/);
  server.stop();
});

test('marks an answer that ended early', async () => {
  const server = startServer(settings());
  const result = await server.ask({ prompt: 'cut short' });
  assert.match(textOf(result), /may be incomplete/);
  server.stop();
});

test('reports missing settings without contacting TPO', async () => {
  const before = tpo.signIns;
  const server = startServer({ PLATAINE_USERNAME: USER.username, PLATAINE_ORG: '${user_config.org}' });
  const result = await server.ask({ prompt: 'anything' });
  assert.ok(result.isError);
  assert.match(textOf(result), /^PLATAINE_SETTINGS_MISSING: missing TPO address, organization, password\./);
  assert.equal(tpo.signIns, before);
  server.stop();
});

test('rejects a TPO address that is not https', async () => {
  const server = startServer(settings({ PLATAINE_TPO_URL: 'http://tpo.example.com' }));
  const result = await server.ask({ prompt: 'anything' });
  assert.ok(result.isError);
  assert.match(textOf(result), /^PLATAINE_SETTINGS_INVALID/);
  server.stop();
});

test('reports a refused sign-in and never echoes the password', async () => {
  const server = startServer(settings({ PLATAINE_PASSWORD: 'wrong-test-value' }));
  const result = await server.ask({ prompt: 'anything' });
  assert.ok(result.isError);
  assert.match(textOf(result), /^PLATAINE_LOGIN_REFUSED/);
  assert.match(textOf(result), /login details you provided are incorrect/);
  assert.ok(!textOf(result).includes('wrong-test-value'));
  server.stop();
});

test('explains accounts that need an extra sign-in step', async () => {
  tpo.mfa = true;
  const server = startServer(settings());
  const result = await server.ask({ prompt: 'anything' });
  tpo.mfa = false;
  assert.ok(result.isError);
  assert.match(textOf(result), /^PLATAINE_SIGN_IN_NOT_SUPPORTED/);
  server.stop();
});

test('reports an unreachable TPO address', async () => {
  const server = startServer(settings({ PLATAINE_TPO_URL: 'http://127.0.0.1:9/' }));
  const result = await server.ask({ prompt: 'anything' });
  assert.ok(result.isError);
  assert.match(textOf(result), /^PLATAINE_UNREACHABLE/);
  server.stop();
});

test('rejects an empty prompt', async () => {
  const server = startServer(settings());
  const result = await server.ask({ prompt: '   ' });
  assert.ok(result.isError);
  server.stop();
});
