/**
 * Tests for service worker critical file detection
 * Run with: node --test tests/*.test.js
 */

import { test } from 'node:test';
import { strictEqual } from 'node:assert';

// CRITICAL_FILES array from sw.js - must match what's in the service worker
const CRITICAL_FILES = [
  './',
  './index.html',
  './src/app.js',
  './src/parser.js',
  './styles/styles.css',
  './manifest.webmanifest'
];

// Recreate isCriticalFile for testing - must match the logic in sw.js
function isCriticalFile(url, scope) {
  try {
    const resolvedUrl = new URL(url, scope);
    const urlPath = resolvedUrl.origin + resolvedUrl.pathname;
    
    // Normalize url path (remove trailing slash)
    const normalizedUrlPath = urlPath.endsWith('/') ? urlPath.slice(0, -1) : urlPath;
    
    // Check if the URL matches any critical file
    for (const file of CRITICAL_FILES) {
      const resolvedFile = new URL(file, scope);
      const filePath = resolvedFile.origin + resolvedFile.pathname;
      const normalizedFilePath = filePath.endsWith('/') ? filePath.slice(0, -1) : filePath;
      
      if (normalizedUrlPath === normalizedFilePath) {
        return true;
      }
    }
    
    return false;
  } catch (e) {
    return false;
  }
}

// Test scope: https://clement1211.github.io/archive-sms/
const SCOPE = 'https://clement1211.github.io/archive-sms/';

// ============================================
// CRITICAL FILES TESTS
// ============================================

test('isCriticalFile - root / is critical', () => {
  const result = isCriticalFile('https://clement1211.github.io/archive-sms/', SCOPE);
  strictEqual(result, true);
});

test('isCriticalFile - /index.html is critical', () => {
  const result = isCriticalFile('https://clement1211.github.io/archive-sms/index.html', SCOPE);
  strictEqual(result, true);
});

test('isCriticalFile - /src/app.js is critical', () => {
  const result = isCriticalFile('https://clement1211.github.io/archive-sms/src/app.js', SCOPE);
  strictEqual(result, true);
});

test('isCriticalFile - /src/parser.js is critical', () => {
  const result = isCriticalFile('https://clement1211.github.io/archive-sms/src/parser.js', SCOPE);
  strictEqual(result, true);
});

test('isCriticalFile - /styles/styles.css is critical', () => {
  const result = isCriticalFile('https://clement1211.github.io/archive-sms/styles/styles.css', SCOPE);
  strictEqual(result, true);
});

test('isCriticalFile - /manifest.webmanifest is critical', () => {
  const result = isCriticalFile('https://clement1211.github.io/archive-sms/manifest.webmanifest', SCOPE);
  strictEqual(result, true);
});

// ============================================
// STATIC FILES TESTS (should NOT be critical)
// ============================================

test('isCriticalFile - /assets/icon-192.png is NOT critical', () => {
  const result = isCriticalFile('https://clement1211.github.io/archive-sms/assets/icon-192.png', SCOPE);
  strictEqual(result, false);
});

test('isCriticalFile - /favicon.svg is NOT critical', () => {
  const result = isCriticalFile('https://clement1211.github.io/archive-sms/favicon.svg', SCOPE);
  strictEqual(result, false);
});

test('isCriticalFile - /assets/icon-512.png is NOT critical', () => {
  const result = isCriticalFile('https://clement1211.github.io/archive-sms/assets/icon-512.png', SCOPE);
  strictEqual(result, false);
});
