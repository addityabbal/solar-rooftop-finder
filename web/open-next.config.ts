import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache: every page is either static or rendered per request.
export default defineCloudflareConfig({});
