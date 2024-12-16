import { html } from "@thai/html";
import Elysia, { redirect, t } from "elysia";
import { fromHtml } from "hast-util-from-html";
import { sanitize } from "hast-util-sanitize";
import { toHtml } from "hast-util-to-html";
import { toText } from "hast-util-to-text";
import { hoarder, type Bookmark } from "./hoarder";
import { fragmentResponse, pageResponse } from "./pageResponse";
import { getSpeechState } from "./tts";
import { unwrap } from "./unwrap";

export default new Elysia()
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
  .get("/", async () => {
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
  .get(
    "/bookmarks/:id",
    async ({ params, query: { mode = "view" } }) => {
      const bookmark = unwrap(
        await hoarder.GET("/bookmarks/{bookmarkId}", {
          params: {
            path: { bookmarkId: params.id },
          },
        })
      );
      const htmlContent =
        bookmark.content.type === "link"
          ? bookmark.content.htmlContent || "No content"
          : `Unsupported content type: ${bookmark.content.type}`;
      if (mode === "listen") {
        const text = toText(fromHtml(htmlContent));
        const state = getSpeechState(text);
        return fragmentResponse(
          state.status === "done"
            ? html`
                <div>
                  <audio
                    controls
                    autoplay
                    src="${state.url}"
                    style="box-sizing: border-box; width: 100%;"
                  ></audio>
                </div>
              `
            : state.status === "error"
            ? html`<div>${state.error}</div>`
            : html`<div
                hx-get="/bookmarks/${bookmark.id}?mode=listen&time=${Date.now()}"
                hx-target="#listening-controls"
                hx-swap="innerHTML"
                hx-trigger="load delay:5s"
              >
                Loading... (${Math.round((Date.now() - state.started) / 1000)}s
                elapsed)
              </div>`
        );
      }
      const sanitizedHtml = toHtml(sanitize(fromHtml(htmlContent)));
      return pageResponse(
        "Bookmark",
        html`
          <div style="padding: 0 64px">
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
            .scrollButton {
              position: fixed;
              top: 0;
              bottom: 0;
              width: 64px;
              display: flex;
              justify-content: center;
              align-items: center;
              font-size: 24px;
              margin: 0;
              background: transparent !important;
            }
          </style>
          <button style="right: 0;" class="scrollButton" id="downButton">
            ⬇︎
          </button>
          <button style="left: 0;" class="scrollButton" id="upButton">
            ⬆︎
          </button>
          <script>
            document
              .getElementById("downButton")
              .addEventListener("click", () => {
                window.scrollBy(0, window.innerHeight * 0.8);
              });
            document
              .getElementById("upButton")
              .addEventListener("click", () => {
                window.scrollBy(0, -window.innerHeight * 0.8);
              });
          </script>
        `
      );
    },
    {
      params: t.Object({ id: t.String() }),
      query: t.Object({
        mode: t.Optional(t.Union([t.Literal("view"), t.Literal("listen")])),
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
