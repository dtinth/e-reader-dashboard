import { html } from "@thai/html";
import { createHash, createHmac } from "crypto";
import Elysia, { redirect, t } from "elysia";
import { fromHtml } from "hast-util-from-html";
import { sanitize } from "hast-util-sanitize";
import { toHtml } from "hast-util-to-html";
import { audioPlayer } from "./audioPlayer";
import {
  acEntity,
  activateScene,
  getEntityStates,
  lightSceneEntities,
  turnOffSwitch,
  turnOnSwitch,
} from "./hass";
import { getBookmark, hoarder, type Bookmark } from "./hoarder";
import { htmlToText } from "./htmlToText";
import { fragmentResponse, pageResponse } from "./pageResponse";
import { StorageBlob } from "./storage";
import { getSpeechState } from "./tts";
import { unwrap } from "./unwrap";
import { homepage } from "./homepage";
import { ofetch } from "ofetch";

export default new Elysia()
  .get(
    "/saved/:hash",
    async ({ params: { hash }, query: { expiry, signature } }) => {
      const key = `saved-pages/${hash}.html`;
      const hmac = createHmac("md5", Bun.env["WEB_PASSWORD"]!)
        .update(key + expiry)
        .digest("hex");
      if (Date.now() >= +expiry) {
        return new Response("Expired", { status: 410 });
      }
      if (hmac !== signature) {
        return new Response("Invalid signature", { status: 403 });
      }
      const blob = new StorageBlob(key);
      const buffer = await blob.download();
      return new Response(Uint8Array.from(buffer), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    },
    {
      params: t.Object({ hash: t.String() }),
      query: t.Object({
        expiry: t.String(),
        signature: t.String(),
      }),
    }
  )
  .guard({
    cookie: t.Cookie({
      readerAccessToken: t.Optional(t.String()),
    }),
  })
  .group("/auth", (app) =>
    app
      .get("/login", async () => {
        return pageResponse(
          "Login",
          html`
            <form action="/auth/login" method="post">
              <label>
                <input type="password" name="readerAccessToken" />
              </label>
              <button type="submit">Login</button>
            </form>
          `
        );
      })
      .post(
        "/login",
        async ({ body: { readerAccessToken }, cookie }) => {
          cookie.readerAccessToken.set({
            value: readerAccessToken,
            path: "/",
            maxAge: 60 * 60 * 24 * 365,
          });
          return redirect("/");
        },
        {
          body: t.Object({
            readerAccessToken: t.String(),
          }),
        }
      )
  )
  .onBeforeHandle(async ({ cookie }) => {
    if (cookie.readerAccessToken.value !== Bun.env["WEB_PASSWORD"]) {
      return redirect("/auth/login");
    }
  })
  .get("/css", async ({ set }) => {
    set.headers["cache-control"] = "public, max-age=300";
    set.headers["content-type"] = "text/css; charset=utf-8";
    return new StorageBlob("custom.css").download().then((r) => r.toString());
  })
  .get("/", async () => {
    return homepage();
  })
  .get("/productivity", async () => {
    const result = await ofetch(Bun.env["PRODUCTIVITY_ENDPOINT"]!);
    return result;
  })
  .get("/transportation", async () => {
    const result = await ofetch(Bun.env["TRANSPORTATION_ENDPOINT"]!);
    return result.html;
  })
  .get("/hass/status", async () => {
    const states = await getEntityStates();
    const map = new Map(states.map((state) => [state.entity_id, state]));
    const lightPresets = Object.keys(lightSceneEntities).map((entityId) => {
      return { entityId, state: map.get(entityId) };
    });
    const acState = map.get(acEntity);
    lightPresets.sort((a, b) => {
      const aK = a.state?.state || "0";
      const bK = b.state?.state || "0";
      return bK.localeCompare(aK);
    });
    return { ac: acState?.state, lights: lightPresets[0]?.entityId };
  })
  .post(
    "/hass/lights",
    async ({ body: { entityId } }) => {
      if (lightSceneEntities.hasOwnProperty(entityId)) {
        await activateScene(entityId);
        return { ok: true };
      } else {
        return { error: "Invalid entityId" };
      }
    },
    { body: t.Object({ entityId: t.String() }) }
  )
  .post(
    "/hass/ac",
    async ({ body: { state } }) => {
      if (state === "on") {
        await turnOnSwitch(acEntity);
        return { ok: true };
      } else if (state === "off") {
        await turnOffSwitch(acEntity);
        return { ok: true };
      } else {
        return { error: "Invalid state" };
      }
    },
    { body: t.Object({ state: t.String() }) }
  )
  .get("/viewport", async () => {
    return pageResponse(
      "Dashboard",
      html`
        <div id="viewport"></div>
        <script>
          const updateViewport = () => {
            const width = window.innerWidth;
            const height = window.innerHeight;
            const html =
              width + " x " + height + "<br>" + window.devicePixelRatio + "x";
            document.getElementById("viewport").innerHTML = html;
          };
          window.addEventListener("resize", updateViewport);
          updateViewport();
        </script>
      `
    );
  })
  .get("/bookmarks", async () => {
    const { bookmarks } = unwrap(await hoarder.GET("/bookmarks"));
    return pageResponse(
      "Bookmarks",
      html`
        <h1>Bookmarks</h1>
        <ul>
          ${bookmarks.map((bookmark) => {
            const title = getBookmarkTitle(bookmark);
            return html`<li>
              <a href="/bookmarks/${bookmark.id}">${title}</a>
            </li>`;
          })}
        </ul>
      `
    );
  })
  .get("/saver", async () => {
    return pageResponse(
      "Page saver",
      html`
        <div id="status">Loading…</div>
        <div id="output"></div>
        <script type="module">
          import { Readability } from "https://cdn.jsdelivr.net/npm/@mozilla/readability@0.5.0/+esm";
          function setStatus(status) {
            document.getElementById("status").innerText = status;
          }
          window.addEventListener("message", async (event) => {
            if (event.data?.h_result) {
              setStatus("Processing…");
              const { url, html, baseURI, documentURI } = event.data.h_result;
              const doc = new DOMParser().parseFromString(html, "text/html");
              Object.defineProperty(doc, "baseURI", { value: baseURI });
              Object.defineProperty(doc, "documentURI", { value: documentURI });
              const reader = new Readability(doc);
              const article = reader.parse();
              setStatus("Saving…");

              const h1 = document.createElement("h1");
              h1.innerText = article.title;

              const header = document.createElement("header");
              header.innerText = article.siteName;

              const footer = document.createElement("footer");
              if (article.publishedTime) {
                footer.append(article.publishedTime);
                const originalLink = document.createElement("a");
                originalLink.href = url;
                originalLink.innerText = url;
                const originalParagraph = document.createElement("p");
                originalParagraph.innerText = "Original link: ";
                originalParagraph.append(originalLink);
                footer.append(originalParagraph);
              }

              let byline;
              if (article.byline) {
                byline = document.createElement("p");
                byline.innerText = article.byline;
              }

              console.log(article);
              const htmlPage = [
                "<!DOCTYPE html>",
                "<html>",
                "<head>",
                '<meta charset="utf-8">',
                '<meta name="viewport" content="width=device-width, initial-scale=1">',
                "<title>",
                article.title,
                "</title>",
                "</head>",
                "<body>",
                header.outerHTML,
                h1.outerHTML,
                byline ? byline.outerHTML : "",
                "<article>",
                article.content,
                "</article>",
                footer.outerHTML,
                "</body>",
                "</html>",
              ].join("\\n");

              fetch("/save", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ html: htmlPage }),
              }).then(async (r) => {
                if (!r.ok) {
                  setStatus("Failed to save: " + (await r.text()));
                }
                try {
                  const response = await r.json();
                  setStatus("Saved!");
                  const savedUrl = location.origin + response.url;
                  const output = document.createElement("textarea");
                  output.value = savedUrl;
                  output.readOnly = true;
                  output.onclick = () => {
                    output.select();
                    navigator.clipboard.writeText(savedUrl).then(() => {
                      setStatus("Copied to clipboard!");
                    });
                  };
                  document.getElementById("output").append(output);
                } catch (error) {
                  setStatus("Failed to save: " + error);
                }
              });
            }
          });
          window.opener.postMessage({ h_ready: true }, "*");
        </script>
      `
    );
  })
  .post(
    "/save",
    async ({ body: { html } }) => {
      const hash = createHash("sha256").update(html).digest("hex");
      const key = `saved-pages/${hash}.html`;
      const blob = new StorageBlob(key);
      await blob.upload(Buffer.from(html));
      const expiry = Date.now() + 86400e3;
      const signature = createHmac("md5", Bun.env["WEB_PASSWORD"]!)
        .update(key + expiry)
        .digest("hex");
      return {
        url: "/saved/" + hash + "?expiry=" + expiry + "&signature=" + signature,
      };
    },
    {
      body: t.Object({
        html: t.String(),
      }),
    }
  )
  .get(
    "/bookmarks/:id",
    async ({ params, query: { mode = "view" } }) => {
      const bookmark = await getBookmark(params.id);
      const title = getBookmarkTitle(bookmark);
      const htmlContent =
        bookmark.content.type === "link"
          ? bookmark.content.htmlContent || "No content"
          : `Unsupported content type: ${bookmark.content.type}`;
      if (mode === "text") {
        const text = await htmlToText(htmlContent);
        return new Response(text, {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      } else if (mode === "listen") {
        const text = await htmlToText(htmlContent);
        const state = getSpeechState(text);
        return fragmentResponse(
          state.status === "done"
            ? audioPlayer({ result: state.result! })
            : state.status === "error"
            ? html`<div>${state.error}</div>`
            : html`<div
                hx-get="/bookmarks/${bookmark.id}?mode=listen&time=${Date.now()}"
                hx-target="#listening-controls"
                hx-swap="innerHTML"
                hx-trigger="load delay:${Date.now() - state.started < 5000
                  ? 1
                  : 5}s"
              >
                Loading... (${Math.round((Date.now() - state.started) / 1000)}s
                elapsed)
              </div>`
        );
      } else {
        const sanitizedHtml = toHtml(sanitize(fromHtml(htmlContent)));
        return pageResponse(
          "Bookmark: " + title,
          html`
            <div style="padding: 0 3rem">
              <h1>${getBookmarkTitle(bookmark)}</h1>
              <div id="listening-controls">
                <button
                  onclick="this.innerText = 'Loading...'; this.disabled = true;"
                  hx-get="/bookmarks/${bookmark.id}?mode=listen"
                  hx-target="#listening-controls"
                  hx-swap="innerHTML"
                >
                  Listen
                </button>
              </div>
              <div>${{ __html: sanitizedHtml }}</div>
            </div>
            <style>
              .scroller-side {
                position: fixed;
                top: 25%;
                bottom: 25%;
                width: 2.5rem;
                display: flex;
                flex-direction: column;
                border: 1px solid black;
                border-width: 1px 0;
              }
              .scroller-side button {
                display: flex;
                justify-content: center;
                align-items: center;
                font-size: 24px;
                margin: 0;
                padding: 0;
                background: transparent !important;
                flex: 1;
                box-shadow: none !important;
              }
              .scroll-percentage {
                position: absolute;
                top: 50%;
                right: 0;
                left: 0;
                text-align: center;
                transform: translateY(-50%);
                pointer-events: none;
                font-size: 12px;
              }
            </style>
            <script>
              document.addEventListener("alpine:init", () => {
                Alpine.data("scroller", () => ({
                  down() {
                    window.scrollBy(0, window.innerHeight * 0.5);
                  },
                  up() {
                    window.scrollBy(0, -window.innerHeight * 0.5);
                  },
                  percentage: "0%",
                  init() {
                    const onScroll = () => {
                      const percentage =
                        (
                          Math.min(
                            1,
                            window.scrollY /
                              (document.body.scrollHeight - window.innerHeight)
                          ) * 100
                        ).toFixed(0) + "%";
                      this.percentage = percentage;
                    };
                    window.addEventListener("scroll", onScroll);
                    this.destroy = () => {
                      window.removeEventListener("scroll", onScroll);
                    };
                  },
                }));
              });
            </script>
            <div x-data="scroller">
              <div class="scroller-side" style="left: 0">
                <button @click="up">⬆︎</button>
                <button @click="down">⬇︎</button>
              </div>
              <div class="scroller-side" style="right: 0">
                <button @click="up">⬆︎</button>
                <button @click="down">⬇︎</button>
                <div class="scroll-percentage" x-text="percentage"></div>
              </div>
            </div>
          `
        );
      }
    },
    {
      params: t.Object({ id: t.String() }),
      query: t.Object({
        mode: t.Optional(
          t.Union([t.Literal("view"), t.Literal("listen"), t.Literal("text")])
        ),
      }),
    }
  );

function getBookmarkTitle(bookmark: Bookmark) {
  return (
    bookmark.title ||
    (bookmark.content.type === "link" && bookmark.content.title) ||
    bookmark.id
  );
}
