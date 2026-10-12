import { ipNetwork, normalizeIp, parseUserAgent } from './clientInfo';

describe('parseUserAgent', () => {
  it.each([
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36', 'Chrome', 'Windows', 'desktop'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0', 'Edge', 'Windows', 'desktop'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15', 'Safari', 'macOS', 'desktop'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', 'Safari', 'iOS', 'mobile'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36', 'Chrome', 'Android', 'mobile'],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0', 'Firefox', 'Linux', 'desktop'],
  ])('%s', (ua, browser, os, device) => {
    expect(parseUserAgent(ua)).toEqual({ browser, os, device });
  });

  it('copes with a missing header', () => {
    expect(parseUserAgent(undefined)).toEqual({ browser: 'Inconnu', os: 'Inconnu', device: 'desktop' });
  });
});

describe('ipNetwork', () => {
  it('groups IPv4 addresses by /24, IPv4-mapped ones included', () => {
    expect(ipNetwork('192.168.1.20')).toBe('192.168.1.0/24');
    expect(ipNetwork('::ffff:192.168.1.99')).toBe('192.168.1.0/24');
    expect(ipNetwork('192.168.2.20')).not.toBe(ipNetwork('192.168.1.20'));
  });

  it('groups IPv6 addresses by /64', () => {
    expect(ipNetwork('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2::/64');
    expect(ipNetwork('2001:db8:1:2::42')).toBe('2001:db8:1:2::/64');
    expect(ipNetwork('::1')).toBe('0:0:0:0::/64');
  });

  it('normalizes and tolerates empty values', () => {
    expect(normalizeIp('::ffff:10.0.0.1')).toBe('10.0.0.1');
    expect(ipNetwork(null)).toBeNull();
  });
});
