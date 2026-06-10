import { describe, expect, it } from "vitest";
import { snapshotUrl } from "../src/tools/snapshot.js";
import { MockBrowserProvider } from "./mocks/mock-provider.js";

describe("snapshot result shape", () => {
  it("returns the expected fields", async () => {
    const provider = new MockBrowserProvider();
    const snapshot = await snapshotUrl(provider, "https://example.com");

    expect(snapshot).toMatchObject({
      url: expect.any(String),
      title: expect.any(String),
      text: expect.any(String),
      links: expect.any(Array),
      headings: expect.any(Array),
      buttons: expect.any(Array),
      inputsCount: expect.any(Number),
      timestamp: expect.any(String),
    });
  });
});