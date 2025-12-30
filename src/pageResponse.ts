import { fromAnyIterable } from "@sec-ant/readable-stream/ponyfill/fromAnyIterable";
import { type Html, html, renderHtmlStream } from "@thai/html";

export async function pageResponse(
  title: string,
  body: Html,
  { header }: { header?: Html } = {}
) {
  const stream = renderHtmlStream(html`<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/water.css@2/out/light.css"
        />
        <link rel="stylesheet" href="/css" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
        <link
          href="https://fonts.googleapis.com/css2?family=Sarabun:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800&family=TASA+Orbiter:wght@400..800&display=swap"
          rel="stylesheet"
        />

        <style>
          :root {
            --font-ui: TASA Orbiter, Sarabun, system-ui, -apple-system,
              BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu",
              "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue",
              "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji",
              sans-serif;
            --font-body: Sarabun, system-ui, -apple-system, BlinkMacSystemFont,
              "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans",
              "Droid Sans", "Helvetica Neue", "Segoe UI Emoji",
              "Apple Color Emoji", "Noto Color Emoji", sans-serif;
          }
          body {
            font-family: var(--font-ui);
            letter-spacing: 0.04ch;
            line-height: 1.6;
          }
          code {
            font-family: var(--font-monospace);
          }
          :root {
            --font-monospace: var(--font-monospace-override, monospace);
            --text-main: #000;
            --links: #000;
            font-size: 20px;
          }
          @media (max-width: 399px) {
            :root {
              font-size: 16px;
            }
          }
          a {
            text-decoration: underline;
          }
          body {
            max-width: unset;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 800px;
            margin: 20px auto;
            padding: 0 10px;
          }
          pre > code {
            font-size: 14px;
            white-space: pre-wrap;
          }
        </style>
        <title>${title}</title>
        <script src="https://cdn.jsdelivr.net/npm/htmx.org@2.0.4/dist/htmx.min.js"></script>
        <script
          defer
          src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"
        ></script>
      </head>
      <body>
        ${header}
        <div class="container">${body}</div>
      </body>
    </html>`);
  return new Response(fromAnyIterable(stream), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function fragmentResponse(html: Html) {
  const stream = renderHtmlStream(html);
  return new Response(fromAnyIterable(stream), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
