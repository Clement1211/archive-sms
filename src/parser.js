/** XML element extraction and SMS Backup & Restore parsers. */

const START = /<(sms|mms)(?=[\s\/>])/g;
const ATTR = /\s+[^\s=\/>]+\s*=\s*(?:"[^"]*"|'[^']*')/y;

function openTag(source, index) {
  let position = index;
  for (;;) {
    ATTR.lastIndex = position;
    if (!ATTR.exec(source)) break;
    position = ATTR.lastIndex;
  }
  while (position < source.length && /\s/.test(source[position])) position++;
  if (source[position] === '>') return { end: position, self: false };
  if (source[position] === '/' && source[position + 1] === '>') return { end: position + 1, self: true };
  return null;
}

export function extract(source) {
  const complete = [];
  let current = 0;
  for (;;) {
    START.lastIndex = current;
    const match = START.exec(source);
    if (!match) return { complete, remaining: source.slice(Math.max(current, source.length - 16)) };
    const start = match.index;
    const opening = openTag(source, start + 1 + match[1].length);
    if (!opening) return { complete, remaining: source.slice(start) };
    if (opening.self) {
      complete.push(source.slice(start, opening.end + 1));
      current = opening.end + 1;
      continue;
    }
    const closeTag = `</${match[1]}>`;
    const closeIndex = source.indexOf(closeTag, opening.end + 1);
    if (closeIndex === -1) return { complete, remaining: source.slice(start) };
    complete.push(source.slice(start, closeIndex + closeTag.length));
    current = closeIndex + closeTag.length;
  }
}

export function parseDateString(dateString) {
  if (!dateString) return null;
  let value = Number(dateString);
  if (!Number.isFinite(value)) return null;
  if (value < 1e12) value *= 1000;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function generateId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function normalizeContactName(value) {
  const name = (value || '').trim().replace(/\s+/g, ' ');
  if (!name || /^(?:\(?unknown\)?|null|inconnu)$/i.test(name)) return null;
  return name;
}

function parseDocument(xmlString) {
  const parser = new DOMParser();
  const document = parser.parseFromString(xmlString, 'application/xml');
  return document.querySelector('parsererror') ? null : document.documentElement;
}

export function parseSmsElement(elementString) {
  try {
    const element = parseDocument(elementString);
    if (!element || element.tagName.toLowerCase() !== 'sms') return null;
    const type = element.getAttribute('type');
    const address = (element.getAttribute('address') || 'Inconnu').trim().replace(/\s+/g, ' ');
    return {
      id: generateId('msg'),
      address,
      contactName: normalizeContactName(element.getAttribute('contact_name')),
      body: element.getAttribute('body') || '',
      date: parseDateString(element.getAttribute('date')),
      kind: 'sms',
      out: type === '2',
      attachments: []
    };
  } catch (error) {
    console.warn('SMS parse error:', error);
    return null;
  }
}

export function parseMmsElement(elementString) {
  try {
    const element = parseDocument(elementString);
    if (!element || element.tagName.toLowerCase() !== 'mms') return null;
    const type = element.getAttribute('type');
    let address = (element.getAttribute('address') || 'Inconnu').trim().replace(/\s+/g, ' ');
    const date = parseDateString(element.getAttribute('date'));
    let body = '';
    const attachments = [];
    const parts = element.getElementsByTagName('part');

    for (let index = 0; index < parts.length; index++) {
      const part = parts[index];
      const contentType = part.getAttribute('ct') || '';
      const text = part.getAttribute('text');
      const data = part.getAttribute('data');
      const name = part.getAttribute('cl') || `piece-jointe-${index + 1}`;
      if (contentType.startsWith('text/') && text) {
        body += (body ? '\n' : '') + text;
      } else if (data) {
        try {
          const binary = atob(data.replace(/\s/g, ''));
          const bytes = new Uint8Array(binary.length);
          for (let byteIndex = 0; byteIndex < binary.length; byteIndex++) {
            bytes[byteIndex] = binary.charCodeAt(byteIndex);
          }
          attachments.push({
            id: generateId('att'),
            blob: new Blob([bytes], { type: contentType || 'application/octet-stream' }),
            type: contentType || 'application/octet-stream',
            name
          });
        } catch (error) {
          console.warn('Failed to decode MMS attachment:', error);
        }
      }
    }

    const addresses = Array.from(element.getElementsByTagName('addr'))
      .map(item => item.getAttribute('address'))
      .filter(Boolean);
    if (address === 'Inconnu' && addresses.length) address = addresses[0];

    return {
      message: {
        id: generateId('msg'),
        address,
        contactName: normalizeContactName(element.getAttribute('contact_name')),
        body: body || (attachments.length ? 'Média' : ''),
        date,
        kind: 'mms',
        out: type === '2',
        attachments: attachments.map(attachment => attachment.id)
      },
      attachments
    };
  } catch (error) {
    console.warn('MMS parse error:', error);
    return null;
  }
}
