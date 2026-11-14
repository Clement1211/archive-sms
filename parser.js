/**
 * XML Parser Module for SMS Backup & Restore files
 * Can be used in browser or Node.js
 * 
 * Usage in Node:
 *   const { parseXmlStreaming, parseSmsElement, parseMmsElement } = require('./parser.js');
 * 
 * Usage in Browser:
 *   import * as parser from './parser.js';
 */

// ============================================
// CONSTANTS
// ============================================

const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Parse date string from SMS Backup & Restore XML
 * @param {string} dateString - Timestamp in milliseconds or seconds
 * @returns {Date|null} - Parsed Date or null if invalid
 */
function parseDateString(dateString) {
  if (!dateString) return null;
  let n = Number(dateString);
  if (!Number.isFinite(n)) return null;
  if (n < 1e12) n *= 1000; // Convert seconds to milliseconds
  const d = new Date(n);
  return isNaN(d) ? null : d;
}

// ============================================
// ELEMENT PARSERS
// ============================================

/**
 * Parse an SMS element from XML string
 * @param {string} elementString - XML string of <sms> element
 * @returns {Object|null} - Parsed SMS message or null if invalid
 */
function parseSmsElement(elementString) {
  try {
    // Use DOMParser in browser, or a simple approach in Node
    let doc;
    if (typeof DOMParser !== 'undefined') {
      const parser = new DOMParser();
      doc = parser.parseFromString(elementString, 'application/xml');
    } else {
      // Node.js environment - use a simple parser
      doc = parseXmlString(elementString);
    }
    
    const parserError = doc.querySelector?.('parsererror');
    if (parserError) return null;

    const el = doc.documentElement;
    if (!el || el.tagName.toLowerCase() !== 'sms') return null;

    const type = el.getAttribute('type');
    const address = (el.getAttribute('address') || 'Inconnu').trim().replace(/\s+/g, ' ');
    const date = parseDateString(el.getAttribute('date'));
    const body = el.getAttribute('body') || '';
    const isOutgoing = type === '2';

    return {
      id: generateId('msg'),
      address,
      body,
      date,
      kind: 'sms',
      out: isOutgoing,
      attachments: []
    };
  } catch (e) {
    console.warn('SMS parse error:', e);
    return null;
  }
}

/**
 * Parse an MMS element from XML string
 * @param {string} elementString - XML string of <mms> element
 * @returns {Object|null} - Parsed MMS message with attachments or null if invalid
 */
function parseMmsElement(elementString) {
  try {
    let doc;
    if (typeof DOMParser !== 'undefined') {
      const parser = new DOMParser();
      doc = parser.parseFromString(elementString, 'application/xml');
    } else {
      doc = parseXmlString(elementString);
    }
    
    const parserError = doc.querySelector?.('parsererror');
    if (parserError) return null;

    const el = doc.documentElement;
    if (!el || el.tagName.toLowerCase() !== 'mms') return null;

    const type = el.getAttribute('type');
    let address = (el.getAttribute('address') || 'Inconnu').trim().replace(/\s+/g, ' ');
    const date = parseDateString(el.getAttribute('date'));
    const isOutgoing = type === '2';

    let body = '';
    const rawAttachments = [];
    let attachmentCounter = 0;

    const parts = el.getElementsByTagName('part');
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const ct = part.getAttribute('ct') || '';
      const text = part.getAttribute('text');
      const data = part.getAttribute('data');
      const cl = part.getAttribute('cl') || `piece-jointe-${i + 1}`;

      if (ct.startsWith('text/') && text) {
        body += (body ? '\n' : '') + text;
      } else if (data) {
        try {
          const cleanData = data.replace(/\s/g, '');
          const raw = atob(cleanData);
          const bytes = new Uint8Array(new ArrayBuffer(raw.length));
          for (let j = 0; j < raw.length; j++) {
            bytes[j] = raw.charCodeAt(j);
          }
          const blob = new Blob([bytes], { type: ct || 'application/octet-stream' });
          rawAttachments.push({ 
            id: generateId('att'),
            blob, 
            type: ct || 'application/octet-stream', 
            name: cl 
          });
          attachmentCounter++;
        } catch (e) {
          console.warn('Failed to decode MMS attachment:', e);
        }
      }
    }

    const addrs = Array.from(el.getElementsByTagName('addr'))
      .map(a => a.getAttribute('address'))
      .filter(Boolean);
    
    if (address === 'Inconnu' && addrs.length > 0) {
      address = addrs[0];
    }

    return {
      message: {
        id: generateId('msg'),
        address,
        body: body || (rawAttachments.length ? 'Média' : ''),
        date,
        kind: 'mms',
        out: isOutgoing,
        attachments: rawAttachments.map(a => a.id)
      },
      attachments: rawAttachments
    };
  } catch (e) {
    console.warn('MMS parse error:', e);
    return null;
  }
}

// ============================================
// STREAMING PARSER
// ============================================

/**
 * Extract complete XML elements from a buffer
 * @param {string} buffer - XML string buffer
 * @returns {Object} - { complete: Array of complete elements, remaining: remaining partial buffer }
 */
function extractElementsFromBuffer(buffer) {
  const complete = [];
  let remaining = buffer;
  let pos = 0;

  while (pos < remaining.length) {
    const openPos = remaining.indexOf('<', pos);
    if (openPos === -1) break;

    const closePos = remaining.indexOf('>', openPos);
    if (closePos === -1) break;

    const tag = remaining.substring(openPos, closePos + 1);

    // Self-closing tag
    if (tag.endsWith('/>')) {
      complete.push(tag);
      remaining = remaining.substring(0, openPos) + remaining.substring(closePos + 1);
      pos = 0;
      continue;
    }

    const tagNameMatch = tag.match(/<(\w+)/);
    if (!tagNameMatch) {
      pos = closePos + 1;
      continue;
    }

    const tagName = tagNameMatch[1];
    const closingTag = `</${tagName}>`;
    const closeTagPos = remaining.indexOf(closingTag, closePos + 1);
    if (closeTagPos === -1) break;

    const element = remaining.substring(openPos, closeTagPos + closingTag.length);
    complete.push(element);
    remaining = remaining.substring(0, openPos) + remaining.substring(closeTagPos + closingTag.length);
    pos = 0;
  }

  return { complete, remaining };
}

/**
 * Generate a unique ID
 * @param {string} prefix - ID prefix
 * @returns {string} - Unique ID
 */
function generateId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Parse XML file in streaming mode
 * @param {File|Object} file - File object or file-like object with size and slice
 * @param {Object} options - Options
 * @param {AbortSignal} options.signal - Abort signal for cancellation
 * @param {Function} options.onProgress - Progress callback(bytesRead, totalBytes)
 * @returns {AsyncGenerator} - Yields parsed messages and MMS with attachments
 */
async function* parseXmlStreaming(file, options = {}) {
  const { signal = null, onProgress = null } = options;
  
  let buffer = '';
  let bytesRead = 0;
  const totalBytes = file.size;

  if (signal?.aborted) return;

  try {
    while (bytesRead < totalBytes) {
      if (signal?.aborted) return;

      const endPos = Math.min(bytesRead + CHUNK_SIZE, totalBytes);
      const chunk = file.slice(bytesRead, endPos);
      const chunkText = await chunk.text();
      buffer += chunkText;
      bytesRead += (endPos - bytesRead);

      if (onProgress) onProgress(bytesRead, totalBytes);

      const { complete, remaining } = extractElementsFromBuffer(buffer);
      buffer = remaining;

      for (const element of complete) {
        if (signal?.aborted) return;

        const tagName = element.match(/<(\w+)/)?.[1]?.toLowerCase();
        if (tagName === 'sms') {
          const msg = parseSmsElement(element);
          if (msg) yield msg;
        } else if (tagName === 'mms') {
          const result = parseMmsElement(element);
          if (result) yield result;
        }
      }
    }

    // Process remaining buffer
    if (buffer) {
      const { complete } = extractElementsFromBuffer(buffer);
      for (const element of complete) {
        if (signal?.aborted) return;
        const tagName = element.match(/<(\w+)/)?.[1]?.toLowerCase();
        if (tagName === 'sms') {
          const msg = parseSmsElement(element);
          if (msg) yield msg;
        } else if (tagName === 'mms') {
          const result = parseMmsElement(element);
          if (result) yield result;
        }
      }
    }
  } catch (e) {
    console.error('Streaming parse error:', e);
    throw e;
  }
}

// ============================================
// NODE.JS COMPATIBILITY
// ============================================

// For Node.js testing, provide a simple XML parser
function parseXmlString(xmlString) {
  // Simple and limited XML parser for testing
  // This is NOT a full XML parser, just enough for our test cases
  const match = xmlString.match(/<(\w+)([^>]*)>([\s\S]*?)<\/\1>/);
  if (!match) return null;
  
  const tagName = match[1];
  const attrsString = match[2];
  const content = match[3];
  
  // Parse attributes
  const attrs = {};
  const attrMatches = attrsString.matchAll(/(\w+)="([^"]*)"/g);
  for (const [, name, value] of attrMatches) {
    attrs[name] = value;
  }
  
  // Create a simple element object
  const element = {
    tagName,
    attributes: attrs,
    getAttribute: (name) => attrs[name] || null,
    getElementsByTagName: (tag) => {
      const results = [];
      const regex = new RegExp(`<${tag}([^>]*)>([\s\S]*?)<\/${tag}>`, 'g');
      let match;
      while ((match = regex.exec(content)) !== null) {
        const item = {
          getAttribute: (name) => {
            const itemMatch = match[1].match(new RegExp(`${name}="([^"]*)"`));
            return itemMatch ? itemMatch[1] : null;
          }
        };
        results.push(item);
      }
      return results;
    },
    querySelector: (selector) => {
      if (selector === 'parsererror') return null;
      return null; // Simplified for testing
    }
  };
  
  return { documentElement: element };
}

// ============================================
// EXPORTS
// ============================================

if (typeof module !== 'undefined' && module.exports) {
  // Node.js export
  module.exports = {
    parseSmsElement,
    parseMmsElement,
    parseXmlStreaming,
    parseDateString,
    extractElementsFromBuffer,
    parseXmlString
  };
} else {
  // Browser - functions are already available globally
}
