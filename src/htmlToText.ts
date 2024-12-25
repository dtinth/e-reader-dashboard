import type { Element } from "hast";
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
  let pendingPrefix: string | null = null;

  visit(tree, (node, _index, parent) => {
    if (node.type === "element" && node.tagName === "li") {
      const listParent = parent as Element;
      pendingPrefix =
        listParent.tagName === "ol"
          ? `${(listCounter.get(listParent) || 0) + 1}. `
          : "• ";

      if (listParent.tagName === "ol") {
        listCounter.set(listParent, (listCounter.get(listParent) || 0) + 1);
      }
    } else if (node.type === "text" && pendingPrefix && node.value.trim()) {
      node.value = pendingPrefix + node.value;
      pendingPrefix = null;
    } else if (node.type === "element" && node.tagName === "ol") {
      listCounter.set(node, 0);
    }
  });

  const text = toText(tree);
  await resultCacheStorage.set(htmlContent, text);
  return text;
}
