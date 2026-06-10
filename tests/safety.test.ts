import { afterEach, describe, expect, it } from "vitest";
import { assertSafeUrl, redactUrl } from "../src/browser/safety.js";

const originalAllowLocalhost = process.env.AGENT_BROWSER_ALLOW_LOCALHOST;

afterEach(() => {
  if (originalAllowLocalhost === undefined) {
    delete process.env.AGENT_BROWSER_ALLOW_LOCALHOST;
  } else {
    process.env.AGENT_BROWSER_ALLOW_LOCALHOST = originalAllowLocalhost;
  }
});

describe("URL safety", () => {
  it("rejects unsafe protocols", () => {
    expect(() => assertSafeUrl("file:///etc/passwd")).toThrow(/Blocked protocol/);
    expect(() => assertSafeUrl("data:text/html,hello")).toThrow(/Blocked protocol/);
    expect(() => assertSafeUrl("javascript:alert(1)")).toThrow(/Blocked protocol/);
    expect(() => assertSafeUrl("chrome://version")).toThrow(/Blocked protocol/);
    expect(() => assertSafeUrl("about:blank")).toThrow(/Blocked protocol/);
  });

  it("rejects localhost by default", () => {
    expect(() => assertSafeUrl("http://localhost:3000")).toThrow(/Localhost is disabled/);
    expect(() => assertSafeUrl("http://127.0.0.1:8080")).toThrow(/not allowed/);
    expect(() => assertSafeUrl("http://10.0.0.5")).toThrow(/not allowed/);
    expect(() => assertSafeUrl("http://192.168.1.10")).toThrow(/not allowed/);
    expect(() => assertSafeUrl("http://172.16.0.2")).toThrow(/not allowed/);
    expect(() => assertSafeUrl("http://0.0.0.0")).toThrow(/not allowed/);
  });

  it("allows localhost only with AGENT_BROWSER_ALLOW_LOCALHOST=1", () => {
    process.env.AGENT_BROWSER_ALLOW_LOCALHOST = "1";
    expect(() => assertSafeUrl("http://localhost:3000")).not.toThrow();
    expect(() => assertSafeUrl("http://127.0.0.1:8080")).not.toThrow();
    expect(() => assertSafeUrl("http://10.0.0.5")).toThrow(/not allowed/);
  });

  it("allows public https URLs", () => {
    expect(() => assertSafeUrl("https://example.com")).not.toThrow();
  });

  it("redacts sensitive query params", () => {
    const redacted = redactUrl("https://example.com/path?token=abc123&name=test&api_key=secret");
    expect(redacted).toContain("token=%5BREDACTED%5D");
    expect(redacted).toContain("api_key=%5BREDACTED%5D");
    expect(redacted).toContain("name=test");
  });
});