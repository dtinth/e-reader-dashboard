import createClient from "openapi-fetch";
import type { paths } from "./vendor/hoarder";

export type Bookmark =
  paths["/bookmarks"]["get"]["responses"]["200"]["content"]["application/json"]["bookmarks"][number];

export const hoarder = createClient<paths>({
  baseUrl: new URL("api/v1", Bun.env["HOARDER_URL"]!).toString(),
  headers: { Authorization: `Bearer ${Bun.env["HOARDER_API_KEY"]}` },
});
