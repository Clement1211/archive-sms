import { test } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { readFileSync } from 'node:fs';
import { extract } from '../parser.js';

test('extract recognizes SMS and MMS while ignoring XML wrappers', () => {
  const xml = '<?xml version="1.0"?><smses><sms address="+1" body="Hi"/><mms address="+2"><part text="Hello"/></mms></smses>';
  const result = extract(xml);
  strictEqual(result.complete.length, 2);
  ok(result.complete[0].startsWith('<sms '));
  ok(result.complete[1].startsWith('<mms '));
});

test('extract keeps an incomplete message for the next chunk', () => {
  const result = extract('<sms address="+1" body="unfinished');
  strictEqual(result.complete.length, 0);
  strictEqual(result.remaining, '<sms address="+1" body="unfinished');
});

test('extract handles the project fixture', () => {
  const xml = readFileSync(new URL('./fixtures/sample.xml', import.meta.url), 'utf8');
  strictEqual(extract(xml).complete.length, 7);
});
