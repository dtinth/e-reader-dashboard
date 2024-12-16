import { Client } from "minio";

const STORAGE_ENDPOINT = Bun.env["STORAGE_ENDPOINT"]!;
const STORAGE_PUBLIC_URL = Bun.env["STORAGE_PUBLIC_URL"]!;
const STORAGE_AK = Bun.env["STORAGE_AK"]!;
const STORAGE_SK = Bun.env["STORAGE_SK"]!;
const STORAGE_BUCKET = Bun.env["STORAGE_BUCKET"]!;

const minioClient = new Client({
  endPoint: STORAGE_ENDPOINT,
  accessKey: STORAGE_AK,
  secretKey: STORAGE_SK,
  useSSL: true,
});

export class StorageBlob {
  constructor(public name: string) {}
  async exists(): Promise<boolean> {
    try {
      await minioClient.statObject(STORAGE_BUCKET, this.name);
      return true;
    } catch (error: any) {
      if (error.code === "NotFound") {
        return false;
      }
      throw error;
    }
  }
  async upload(data: Buffer): Promise<void> {
    await minioClient.putObject(STORAGE_BUCKET, this.name, data);
  }
  getUrl() {
    return `${STORAGE_PUBLIC_URL}/${this.name}`;
  }
}
