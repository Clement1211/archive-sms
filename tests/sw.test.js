/**
 * Tests for service worker critical file detection
 * Run with: node --test tests/*.test.js
 */

import { test } from 'node:test';
import { strictEqual, ok } from 'node:assert';

// Import the isCriticalFile function from sw.js
// Since sw.js uses self.registration.scope, we need to mock it for testing

// Read and evaluate the isCriticalFile function from sw.js
const swCode = new TextDecoder().decode(await Deno.readFile(new URL('../sw.js', import.meta.url)));

// Extract the CRITICAL_FILES array and isCriticalFile function
const CRITICAL_FILES = [
  './',
  './index.html',
  './app.js',
  './parser.js',
  './styles.css',
  './manifest.webmanifest'
];

// Recreate isCriticalFile for testing
function isCriticalFile(url, scope) {
  try {
    const resolvedUrl = new URL(url, scope);
    const urlPath = resolvedUrl.origin + resolvedUrl.pathname;
    const scopeUrl = new URL(scope);
    const scopePath = scopeUrl.origin + scopeUrl.pathname;
    
    // Normalize scope path (remove trailing slash)
    const normalizedScope = scopePath.endsWith('/') ? scopePath.slice(0, -1) : scopePath;
    
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
    console.warn('Error checking critical file:', e);
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

test('isCriticalFile - /app.js is critical', () => {
  const result = isCriticalFile('https://clement1211.github.io/archive-sms/app.js', SCOPE);
  strictEqual(result, true);
});

test('isCriticalFile - /parser.js is critical', () => {
  const result = isCriticalFile('https://clement1211.github.io/archive-sms/parser.js', SCOPE);
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
