import createClient from "openapi-fetch";
import type { paths } from "./vendor/hoarder";

export type Bookmark =
  paths["/bookmarks"]["get"]["responses"]["200"]["content"]["application/json"]["bookmarks"][number];

export const hoarder = createClient<paths>({
  baseUrl: new URL("api/v1", Bun.env["HOARDER_URL"]!).toString(),
  headers: { Authorization: `Bearer ${Bun.env["HOARDER_API_KEY"]}` },
});

import { createCache } from "async-cache-dedupe";
import { unwrap } from "./unwrap";

const bookmarkCache = createCache({
  ttl: 5, // seconds
  storage: { type: "memory" },
}).define("fetchBookmark", async (id: string) => {
  return unwrap(
    await hoarder.GET("/bookmarks/{bookmarkId}", {
      params: {
        path: { bookmarkId: id },
      },
    })
  );
});

export async function getBookmark(id: string): Promise<Bookmark> {
  return await bookmarkCache.fetchBookmark(id);
}
