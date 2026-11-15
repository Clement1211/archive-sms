function decodeXml(value) {
  return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function attributes(source) {
  const result = {};
  const pattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of source.matchAll(pattern)) result[match[1]] = decodeXml(match[2] ?? match[3] ?? '');
  return result;
}

function element(tagName, attrs) {
  return {
    tagName,
    getAttribute(name) { return Object.hasOwn(attrs, name) ? attrs[name] : null; }
  };
}

export function installDOMParserMock() {
  globalThis.DOMParser = class DOMParserMock {
    parseFromString(xml) {
      const root = xml.match(/^\s*<([\w:-]+)\b([\s\S]*?)\/?\s*>/);
      if (!root) return { querySelector: () => ({}) };
      const rootName = root[1];
      const rootAttrs = attributes(root[2]);
      const content = xml.slice(root[0].length);
      const descendants = tag => {
        const found = [];
        const matcher = new RegExp(`<${tag}\\b([\\s\\S]*?)(?:\\/>|>([\\s\\S]*?)<\\/${tag}\\s*>)`, 'g');
        for (const match of content.matchAll(matcher)) found.push(element(tag, attributes(match[1])));
        return found;
      };
      return {
        querySelector: () => null,
        documentElement: {
          ...element(rootName, rootAttrs),
          getElementsByTagName: descendants
        }
      };
    }
  };
}
