import {
  assertAllowedUrl,
  BlockedUrlError,
  isDisallowedAddress,
} from './safe-fetch.util';

describe('isDisallowedAddress', () => {
  const blocked = [
    // IPv4 loopback / unspecified
    '127.0.0.1',
    '127.8.8.8',
    '0.0.0.0',
    // RFC1918 private
    '10.0.0.1',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    // CGNAT
    '100.64.0.1',
    '100.127.255.255',
    // Link-local / cloud metadata
    '169.254.169.254',
    '169.254.0.1',
    // Multicast / reserved / broadcast
    '224.0.0.1',
    '240.0.0.1',
    '255.255.255.255',
    // Test nets / benchmarking
    '192.0.2.1',
    '198.18.0.1',
    '198.51.100.7',
    '203.0.113.9',
    // IPv6 loopback / unspecified
    '::1',
    '::',
    // IPv6 link-local / ULA / multicast
    'fe80::1',
    'fe80::1%eth0',
    'fc00::1',
    'fd12:3456:789a::1',
    'ff02::1',
    // IPv4-mapped and translated forms smuggling private IPv4
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    '::ffff:169.254.169.254',
    '64:ff9b::a00:1', // NAT64 for 10.0.0.1
    '2002:7f00:1::1', // 6to4 for 127.0.0.1
    // Documentation range
    '2001:db8::1',
    // Not an IP at all — fail closed
    'not-an-ip',
    '',
  ];

  const allowed = [
    '93.184.216.34', // example.com
    '8.8.8.8',
    '1.1.1.1',
    '172.32.0.1', // just outside 172.16/12
    '100.128.0.1', // just outside 100.64/10
    '2606:2800:220:1:248:1893:25c8:1946', // example.com IPv6
    '2001:4860:4860::8888',
    '::ffff:8.8.8.8', // mapped public address is fine
  ];

  it.each(blocked)('blocks %s', (address) => {
    expect(isDisallowedAddress(address)).toBe(true);
  });

  it.each(allowed)('allows %s', (address) => {
    expect(isDisallowedAddress(address)).toBe(false);
  });
});

describe('assertAllowedUrl', () => {
  it('accepts plain http and https URLs', () => {
    expect(assertAllowedUrl('https://example.com/cover.jpg').hostname).toBe(
      'example.com',
    );
    expect(assertAllowedUrl('http://example.com/cover.jpg').protocol).toBe(
      'http:',
    );
  });

  it.each([
    'file:///etc/passwd',
    'ftp://example.com/x',
    'gopher://example.com/x',
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
  ])('rejects non-http(s) scheme %s', (url) => {
    expect(() => assertAllowedUrl(url)).toThrow(BlockedUrlError);
  });

  it.each([
    'http://127.0.0.1/latest/meta-data',
    'http://169.254.169.254/latest/meta-data',
    'http://10.0.0.5/internal',
    'http://[::1]:3000/api',
    'http://[fe80::1]/x',
    'http://[::ffff:192.168.0.1]/x',
    'http://0.0.0.0/x',
  ])('rejects IP-literal URL %s', (url) => {
    expect(() => assertAllowedUrl(url)).toThrow(BlockedUrlError);
  });

  it('rejects invalid URLs', () => {
    expect(() => assertAllowedUrl('not a url')).toThrow(BlockedUrlError);
  });
});
