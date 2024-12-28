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
      return new Response(await blob.download(), {
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
    return pageResponse("Dashboard", html``, {
      header: html`
        <style>
          :root {
            --text-main: #fff;
            --links: #fff;
            --background-body: #000;
            --background: #000;
          }
        </style>
        <div
          id="now"
          style="font-weight: bold; font-size: 32vw; line-height: 1.25em; text-align: center; letter-spacing: 0; font-family: var(--font-monospace); position: relative;"
        >
          <div
            data-now-text
            style="position: absolute; top: 0; left: 0; right: 0; transform: translate(0.1ex, 0.1ex); opacity: 0.5;
              mask-image: repeating-linear-gradient(-45deg, transparent, transparent 0.01em, black 0.01em, black 0.015em);"
          >
            …
          </div>
          <div
            data-now-text
            style="position: relative; text-shadow: 0.05ex 0.05ex 0 black;"
          >
            …
          </div>
        </div>
        <div style="display: flex; justify-content: center;">
          <div
            style="line-height: 1.2; padding: 0 16px; font-style: italic; font-size: 12vw; padding-bottom: 0.5em;"
          >
            <div id="dow"></div>
            <div id="day"></div>
          </div>
        </div>
        <script>
          const updateNow = () => {
            const h = new Date().getHours();
            const m = new Date().getMinutes();
            const html =
              h +
              "<span style='display: inline-block; margin: 0 -0.125ch; font-weight: normal;'>:</span>" +
              String(m).padStart(2, "0");
            for (const el of document.querySelectorAll(
              "#now [data-now-text]"
            )) {
              el.innerHTML = html;
            }
            const dow = new Intl.DateTimeFormat("en-US", {
              weekday: "long",
            }).format(new Date());
            const day = new Intl.DateTimeFormat("en-US", {
              day: "numeric",
              month: "long",
            }).format(new Date());
            document.getElementById("dow").innerText = dow;
            document.getElementById("day").innerText = day;
          };
          setInterval(updateNow, 5000);
          updateNow();
        </script>

        <style>
          .hass {
            padding: 0 16px;
            font-size: 16px;
          }
          .hass table {
            width: 100%;
            table-layout: fixed;
          }
          .hass button {
            display: block;
            width: 100%;
            padding: 0.56em 0 0.72em;
            margin: 0;
            background: transparent !important;
            color: white;
            border: 0;
            box-shadow: inset 0 0 0 1px white;
          }
          .hass th {
            padding-bottom: 0;
          }
          .hass td[data-active="true"] button {
            box-shadow: inset 0 0 0 2px white;
            font-weight: bold;
          }
        </style>

        <div
          data-light-presets="${JSON.stringify(lightSceneEntities)}"
          x-data="{
            lightPresets: JSON.parse($el.dataset.lightPresets),
            ac: '',
            lights: '',
            async init() {
              this.timer = setInterval(() => this.load(), 15000)
              await this.load()
            },
            destroy() {
              clearInterval(this.timer)
            },
            async load() {
              const result = await fetch('/hass/status').then(r => r.json())
              this.ac = result.ac
              this.lights = result.lights
            },
            async setLights(entityId) {
              this.lights = entityId
              await fetch('/hass/lights', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ entityId }),
              })
            },
            async setAc(state) {
              this.ac = state
              await fetch('/hass/ac', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ state }),
              })
            },
          }"
          class="hass"
        >
          <table>
            <tr>
              <th :colspan="Object.keys(lightPresets).length">Lights</th>
              <td width="10" rowspan="2"></td>
              <th colspan="2">AC</th>
            </tr>
            <tr>
              <template
                x-for="[entityId, name] of Object.entries(lightPresets)"
              >
                <td :data-active="lights === entityId">
                  <button @click="setLights(entityId)" x-text="name"></button>
                </td>
              </template>
              <td :data-active="ac == 'off'">
                <button @click="setAc('off')">Off</button>
              </td>
              <td :data-active="ac == 'on'">
                <button @click="setAc('on')">On</button>
              </td>
            </tr>
          </table>
        </div>
      `,
    });
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
