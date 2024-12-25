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
  constructor(public key: string) {}
  async exists(): Promise<boolean> {
    try {
      await minioClient.statObject(STORAGE_BUCKET, this.key);
      return true;
    } catch (error: any) {
      if (error.code === "NotFound") {
        return false;
      }
      throw error;
    }
  }
  async upload(data: Buffer): Promise<void> {
    await minioClient.putObject(STORAGE_BUCKET, this.key, data);
  }
  async download(): Promise<Buffer> {
    const stream = await minioClient.getObject(STORAGE_BUCKET, this.key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  async getUrl() {
    return minioClient.presignedGetObject(
      STORAGE_BUCKET,
      this.key,
      60 * 60 * 24 * 3
    );
  }
}
