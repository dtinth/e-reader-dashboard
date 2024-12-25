import type { Element, Text } from "hast";
import { fromHtml } from "hast-util-from-html";
import { toText } from "hast-util-to-text";
import { visit } from "unist-util-visit";

import { createStorage } from "unstorage";
import lruCacheDriver from "unstorage/drivers/lru-cache";

const resultCacheStorage = createStorage<string>({
  driver: lruCacheDriver({
    maxSize: 1048576,
  }),
});

export async function htmlToText(htmlContent: string) {
  if (await resultCacheStorage.has(htmlContent)) {
    return (await resultCacheStorage.get(htmlContent))!;
  }

  const tree = fromHtml(htmlContent);

  let listCounter = new Map<Element, number>();

  visit(tree, "element", (node, _index, parent) => {
    if (node.tagName === "li") {
      const listParent = parent as Element;
      const prefix =
        listParent.tagName === "ol"
          ? `${(listCounter.get(listParent) || 0) + 1}. `
          : "• ";

      if (listParent.tagName === "ol") {
        listCounter.set(listParent, (listCounter.get(listParent) || 0) + 1);
      }

      // Prepend the prefix as a text node
      node.children.unshift({
        type: "text",
        value: prefix,
      } as Text);
    }

    // Reset counter when entering a new ordered list
    if (node.tagName === "ol") {
      listCounter.set(node, 0);
    }
  });

  const text = toText(tree);
  await resultCacheStorage.set(htmlContent, text);
  return text;
}
