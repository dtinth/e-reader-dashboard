import { readFileSync } from "node:fs";
import { StorageBlob } from "../storage";

await new StorageBlob("custom.css").upload(
  readFileSync("tmp.local/custom.css")
);
