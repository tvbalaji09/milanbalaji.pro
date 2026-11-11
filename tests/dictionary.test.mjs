import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const scope = {AbortSignal};
runInNewContext(readFileSync(new URL('../public/dictionary.js', import.meta.url), 'utf8'), scope);
const lookup = scope.MilanDictionary.lookup;
const entry = [{meanings: [{partOfSpeech: 'noun', definitions: [{definition: 'A happy discovery.'}]}]}];

test('server failure falls back without sending app credentials or referrer', async () => {
  const calls = [];
  const result = await lookup('Serendipity', async (url, options) => {
    calls.push(url);
    if (url.startsWith('/')) return Response.json({error: 'Dictionary unavailable'}, {status: 503});
    assert.equal(url, 'https://api.dictionaryapi.dev/api/v2/entries/en/serendipity');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.equal(options.headers.Authorization, undefined);
    return Response.json(entry);
  });
  assert.equal(calls.length, 2);
  assert.equal(result.meaning, 'noun: A happy discovery.');
});

test('server timeout and malformed response also use the direct fallback', async () => {
  for (const failed of [() => {throw new Error('timeout');}, () => Response.json({})]) {
    const result = await lookup('serendipity', async url => url.startsWith('/') ? failed() : Response.json(entry));
    assert.match(result.meaning, /happy discovery/);
  }
});

test('successful server response needs no external browser request', async () => {
  let calls = 0;
  const result = await lookup('serendipity', async () => {calls++; return Response.json({meaning: 'A happy discovery.'});});
  assert.equal(calls, 1);
  assert.equal(result.meaning, 'A happy discovery.');
});

test('invalid words, missing words and login failures have specific messages', async () => {
  await assert.rejects(lookup('../journal', () => {throw new Error('should not fetch');}), /Enter one English word/);
  for (const [status, message] of [[404, /Check the spelling/], [401, /sign in/]]) {
    let calls = 0;
    await assert.rejects(lookup('unknown', async () => {calls++; return new Response('', {status});}), message);
    assert.equal(calls, 1);
  }
  await assert.rejects(lookup('unknown', async url => new Response('', {status: url.startsWith('/') ? 503 : 404})), /Check the spelling/);
  await assert.rejects(lookup('unknown', async () => {throw new Error('offline');}), /could not be reached/);
});
