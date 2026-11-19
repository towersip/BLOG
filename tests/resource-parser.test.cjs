const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const parser = new vm.Script(fs.readFileSync(path.join(__dirname, '../public/resource-parser.js'), 'utf8'));

// Execute the complete Quantumult X entry point, including subscription detection,
// field normalization, filtering, renaming and the final Base64-encoded output.
function parse(content, { build = 965, params = '', type = 'server' } = {}) {
  const notifications = [];
  const results = [];
  const context = vm.createContext({
    $resource: { content, type, link: 'https://example.com/sub' + (params ? '#' + params : ''), tag: 'test' },
    $environment: { version: 'Quantumult X 1.9.0 build ' + build },
    $notify: (...args) => notifications.push(args),
    $done: value => results.push(value),
    console: { log() {} },
  });
  parser.runInContext(context, { timeout: 5000 });
  const output = results.at(-1)?.content || '';
  return { content: Buffer.from(output, 'base64').toString('utf8'), notifications, context };
}

function field(content, name) {
  const match = content.match(new RegExp('(?:^|,\\s*)' + name + '=([^,]*)'));
  return match?.[1].trim();
}

const base = 'hysteria2=example.com:443, password=pwd, tls-host=apple.com, tls-verification=true, udp-relay=true';
const uri = 'hysteria2://pwd@example.com:443?sni=apple.com#hy2-01';
const clashNode = { name: 'hy2-clash', type: 'hysteria2', server: 'example.com', port: 443, password: 'pwd', sni: 'apple.com' };
const clash = (...proxies) => JSON.stringify({ proxies });

const nativeExamples = [
  base + ', tag=hy2-01',
  base + ', download-bandwidth=100, tag=hy2-02',
  base + ', salamander-password=obfskey, tag=hy2-03',
  base + ', port-hopping=20000-50000, port-hopping-interval=30, tag=hy2-04',
];

test('imports all four Quantumult X 1.9.0 examples without changing their fields', () => {
  const result = parse(nativeExamples.join('\n'));
  assert.deepEqual(result.content.split('\n'), nativeExamples);
  assert.equal(result.context.PNS, 0);
  assert.deepEqual(result.notifications, []);
});

for (const scheme of ['hysteria2', 'hy2']) {
  test('converts plain and Base64 ' + scheme + ' subscriptions', () => {
    const input = uri.replace('hysteria2:', scheme + ':');
    for (const content of [input, Buffer.from(input).toString('base64')]) {
      const result = parse(content);
      assert.equal(result.content, nativeExamples[0]);
      assert.equal(result.context.PNS, 0);
    }
  });
}

test('parses encoded authentication, query parameters and Unicode names', () => {
  const result = parse('hy2://user%3Apa%40ss%2Bword@example.com/?sni=apple%2Ecom&obfs=salamander&obfs-password=key%3D123#%E9%A6%99%E6%B8%AF%20HY2');
  assert.equal(field(result.content, 'password'), 'user:pa@ss+word');
  assert.equal(field(result.content, 'salamander-password'), 'key=123');
  assert.equal(field(result.content, 'tls-host'), 'apple.com');
  assert.equal(field(result.content, 'tag'), '香港 HY2');
  assert.match(result.content, /^hysteria2=example.com:443,/);
});

test('supports an IPv6 URI with a hopping range in the authority', () => {
  const result = parse('hy2://pwd@[2001:db8::1]:20000-50000/?obfs=salamander&obfs-password=key&hop-interval=30s#IPv6');
  assert.match(result.content, /^hysteria2=\[2001:db8::1\]:20000,/);
  assert.match(result.content, /port-hopping=20000-50000, port-hopping-interval=30,/);
});

test('retains multiple hopping ranges through repeated normalization and tag reordering', () => {
  for (const input of [
    'hy2://pwd@example.com:443?mport=1234%2C5000-6000%2C7044%2C8000-9000&mhop=30#ports',
    'hysteria2=example.com:443, password=pwd, tag=ports, port-hopping=1234,5000-6000,7044,8000-9000, port-hopping-interval=30',
  ]) {
    const result = parse(input);
    assert.match(result.content, /port-hopping=1234,5000-6000,7044,8000-9000, port-hopping-interval=30,/);
    assert.match(result.content, /tag=ports$/);
  }
});

test('honors explicit TLS verification and certificate overrides', () => {
  for (const [params, insecure, expected] of [
    ['', '', 'true'], ['', '&insecure=0', 'true'], ['', '&insecure=1', 'false'],
    ['cert=1', '&insecure=1', 'true'], ['cert=-1', '', 'false'],
  ]) {
    const result = parse(uri.replace('#', insecure + '#'), { params });
    assert.equal(field(result.content, 'tls-verification'), expected);
  }
  const result = parse('hysteria2=example.com:443, password=pwd, tag=native', { params: 'cert=1' });
  assert.equal(field(result.content, 'tls-verification'), 'true');
});

test('supports UDP overrides for native, URI and Clash nodes', () => {
  for (const input of [nativeExamples[0], uri, clash(clashNode)]) {
    for (const [params, expected] of [['', 'true'], ['udp=1', 'true'], ['udp=-1', 'false']]) {
      assert.equal(field(parse(input, { params }).content, 'udp-relay'), expected);
    }
  }
});

test('converts Clash obfuscation, bandwidth, hopping and IPv6 fields', () => {
  const result = parse(clash({ ...clashNode, server: '2001:db8::1', obfs: 'salamander', 'obfs-password': 'obfskey', ports: '20000-50000', 'hop-interval': 30, down: '100 Mbps' }));
  assert.match(result.content, /^hysteria2=\[2001:db8::1\]:443,/);
  assert.equal(field(result.content, 'salamander-password'), 'obfskey');
  assert.equal(field(result.content, 'download-bandwidth'), '100');
  assert.equal(field(result.content, 'port-hopping'), '20000-50000');
  assert.equal(field(result.content, 'port-hopping-interval'), '30');
  assert.equal(field(result.content, 'tls-verification'), 'true');
});

test('converts block and inline Clash YAML through the bundled YAML parser', () => {
  const block = [
    'proxies:', '  - name: "香港 HY2"', '    type: hysteria2', '    server: example.com',
    '    port: 443', '    password: pwd', '    sni: apple.com', '    obfs: salamander',
    '    obfs-password: obfskey', '    ports: 20000-50000', '    hop-interval: 30', '    down: 100 Mbps',
  ].join('\n');
  const inline = 'proxies:\n  - {name: "香港 HY2", type: hysteria2, server: example.com, port: 443, password: pwd, sni: apple.com, obfs: salamander, obfs-password: obfskey, ports: "20000-50000", hop-interval: 30, down: "100 Mbps"}';
  for (const input of [block, inline]) {
    const result = parse(input);
    assert.equal(field(result.content, 'tag'), '香港 HY2');
    assert.equal(field(result.content, 'download-bandwidth'), '100');
    assert.equal(field(result.content, 'port-hopping'), '20000-50000');
    assert.equal(field(result.content, 'salamander-password'), 'obfskey');
  }
});

test('Clash honors source UDP/TLS settings and explicit overrides', () => {
  const input = clash({ ...clashNode, udp: false, 'skip-cert-verify': true });
  assert.equal(field(parse(input).content, 'udp-relay'), 'false');
  assert.equal(field(parse(input).content, 'tls-verification'), 'false');
  const overridden = parse(input, { params: 'udp=1&cert=1' });
  assert.equal(field(overridden.content, 'udp-relay'), 'true');
  assert.equal(field(overridden.content, 'tls-verification'), 'true');
});

test('uses the first hopping port when Clash omits a nominal port', () => {
  const result = parse(clash({ ...clashNode, port: undefined, ports: '20000-50000' }));
  assert.match(result.content, /^hysteria2=example.com:20000,/);
});

test('normalizes bandwidth units to Mbps', () => {
  for (const [down, expected] of [[100, '100'], ['1.5 Gbps', '1500'], ['12500 Kbps', '12.5'], [0, undefined]]) {
    assert.equal(field(parse(clash({ ...clashNode, down })).content, 'download-bandwidth'), expected);
  }
  const result = parse('hy2://pwd@example.com?download-bandwidth=100#bandwidth');
  assert.equal(field(result.content, 'download-bandwidth'), '100');
});

test('preserves names containing commas', () => {
  for (const input of [uri.replace('#hy2-01', '#HK%2C%20HY2'), clash({ ...clashNode, name: 'HK, HY2' })]) {
    assert.match(parse(input).content, /tag=HK,\s*HY2$/);
  }
});

test('supports filtering, type placeholders, suffixes and empty-name fallback', () => {
  const input = [uri, uri.replace('#hy2-01', '#other')].join('\n');
  const result = parse(input, { params: 'in=hy2-01&rename=@%7C$type8' });
  assert.equal(result.content.split('\n').length, 1);
  assert.match(result.content, /tag=hy2-01\|HY2$/);
  for (const suffix of ['1', '-1']) {
    assert.match(parse(uri, { params: 'suffix=' + suffix }).content, /「𝐡𝐲𝟐」/);
  }
  for (let style = 0; style <= 8; style++) {
    assert.match(parse(uri, { params: 'rename=@$type' + style }).content, /^hysteria2=/);
  }
  assert.match(parse(base + ', tag=').content, /^hysteria2=/);
});

test('gates native, URI and Clash Hysteria 2 nodes on build 965', () => {
  for (const input of [nativeExamples[0], uri, uri.replace('hysteria2:', 'hy2:'), clash(clashNode)]) {
    const result = parse(input, { build: 964 });
    assert.doesNotMatch(result.content, /^hysteria2=/m);
    assert.equal(result.context.PNS, 1);
    assert.ok(result.notifications.some(args => args.some(value => String(value).includes('965+'))));
  }
});

test('keeps supported nodes and gives accurate unsupported-protocol notices', () => {
  const input = [uri, 'trojan://pwd@example.com:443?sni=apple.com#trojan', 'tuic://pwd@example.com:443#unsupported'].join('\n');
  const current = parse(input);
  assert.equal(current.content.split('\n').length, 2);
  assert.equal(current.context.PNS, 1);
  const notice = current.notifications.find(args => String(args[0]).includes('不支持类型'));
  assert.ok(notice);
  assert.doesNotMatch(notice[2], /暂不支持 Hysteria2/);
  const old = parse(input, { build: 964 });
  assert.match(old.content, /^trojan=/);
  assert.equal(old.context.PNS, 2);
});

test('reports unsupported obfuscation and malformed ranges while retaining valid nodes', () => {
  for (const invalid of [
    'hy2://pwd@example.com?obfs=gecko&obfs-password=key#bad',
    'hy2://pwd@example.com?obfs=salamander#bad',
    'hy2://pwd@example.com?mport=50000-20000#bad',
    'hy2://pwd@example.com:70000#bad',
  ]) {
    const result = parse(invalid + '\n' + uri);
    assert.equal(result.content, nativeExamples[0]);
    assert.ok(result.notifications.some(args => String(args[0]).includes('解析失败')));
  }
});

test('preserves an existing Trojan conversion', () => {
  const result = parse('trojan://pwd@example.com:443?sni=apple.com#test');
  assert.equal(result.content, 'trojan=example.com:443, password=pwd, over-tls=true, tls-verification=false, tls-host=apple.com, udp-relay=false, fast-open=false, tag=test');
});

test('detects short Base64 HY2 subscriptions with BOM, comments and wrapped encoding', () => {
  for (const [prefix, scheme] of [
    ['\uFEFF\n', 'hy2'],
    ['# nodes\r\n', 'hysteria2'],
    ['# nodes\r', 'hy2'],
  ]) {
    const encoded = Buffer.from(prefix + scheme + '://pwd@example.com#test').toString('base64url');
    const wrapped = encoded.match(/.{1,5}/g).join('\r\n');
    assert.ok(wrapped.length < 100);
    for (const input of [encoded, wrapped]) {
      assert.match(parse(input).content, /^hysteria2=example.com:443, .*tag=test$/);
    }
  }
});

test('keeps all nodes from wrapped Base64 subscriptions with a HY2 node', () => {
  const payload = [uri, 'hy2://pwd@example.com:444#second'].join('\r\n');
  const encoded = Buffer.from(payload).toString('base64');
  const wrapped = encoded.match(/.{1,20}/g).join('\n');
  const result = parse(wrapped).content.split('\n');
  assert.equal(result[0], nativeExamples[0]);
  assert.match(result[1], /^hysteria2=example.com:444, .*tag=second$/);
});
