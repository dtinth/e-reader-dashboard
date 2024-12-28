import { expect, test } from "vitest";
import { htmlToText } from "./htmlToText";

test("converts html to text", async () => {
  const html = `<p>hello</p><p>world</p>`;
  expect(await htmlToText(html)).toEqual("hello\n\nworld");
});

test("adds number to list", async () => {
  const html = `<ol><li>hello 2</li><li>world</li></ol>`;
  expect(await htmlToText(html)).toMatchInlineSnapshot(`
    "1. hello 2
    2. world"
  `);
});
