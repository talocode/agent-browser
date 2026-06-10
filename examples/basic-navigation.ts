import { PlaywrightBrowserProvider } from "../src/browser/playwright-provider.js";
import { snapshotUrl } from "../src/tools/snapshot.js";

async function main() {
  const provider = new PlaywrightBrowserProvider();
  try {
    const snapshot = await snapshotUrl(provider, "https://example.com");
    console.log(JSON.stringify(snapshot, null, 2));
  } finally {
    await provider.dispose();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});