import { isSafeDomain } from "./is-safe-domains";

describe("isSafeDomain", () => {
  it("matches exact domain", () => {
    expect(isSafeDomain("https://github.com")).toBe(true);
    expect(isSafeDomain("https://google.com")).toBe(true);
    expect(isSafeDomain("https://zhihu.com")).toBe(true);
  });

  it("matches subdomain", () => {
    expect(isSafeDomain("https://api.github.com")).toBe(true);
    expect(isSafeDomain("https://www.google.com")).toBe(true);
    expect(isSafeDomain("https://gist.github.com")).toBe(true);
  });

  it("matches with path and query", () => {
    expect(isSafeDomain("https://github.com/user/repo")).toBe(true);
    expect(isSafeDomain("https://google.com/search?q=test")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isSafeDomain("https://GITHUB.COM")).toBe(true);
    expect(isSafeDomain("https://API.GITHUB.COM")).toBe(true);
  });

  it("returns false for unsafe domains", () => {
    expect(isSafeDomain("https://example.com")).toBe(false);
    expect(isSafeDomain("https://malicious-site.com")).toBe(false);
    expect(isSafeDomain("https://unknown.io")).toBe(false);
  });

  it("returns false for similar but different domains", () => {
    expect(isSafeDomain("https://github.com.malicious.com")).toBe(false);
    expect(isSafeDomain("https://fake-github.com")).toBe(false);
  });

  it("returns false for invalid URLs", () => {
    expect(isSafeDomain("not-a-url")).toBe(false);
    expect(isSafeDomain("")).toBe(false);
  });
});
