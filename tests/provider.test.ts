import { describe, expect, it } from "vitest";
import type { BrowserProvider } from "../src/browser/provider.js";
import { snapshotUrl } from "../src/tools/snapshot.js";
import { MockBrowserProvider } from "./mocks/mock-provider.js";

describe("provider abstraction", () => {
  it("can be mocked for tool execution", async () => {
    const provider: BrowserProvider = new MockBrowserProvider();
    const snapshot = await snapshotUrl(provider, "https://example.com");

    expect(snapshot.title).toBe("Example Domain");
    expect(snapshot.links).toHaveLength(1);
    expect(snapshot.inputsCount).toBe(0);
  });
});