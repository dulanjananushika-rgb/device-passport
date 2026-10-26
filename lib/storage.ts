import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface UploadOptions {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  folder?: string;
}

export interface UploadResult {
  url: string;
  key: string;
  provider: "r2" | "s3" | "local";
}

export interface PresignedUploadResult {
  uploadUrl: string;
  key: string;
  publicUrl: string;
}

export class StorageService {
  private s3Client: S3Client | null = null;
  private bucket: string | null = null;
  private publicBaseUrl: string | null = null;
  private provider: "r2" | "s3" | "local" = "local";

  constructor() {
    const bucket = process.env.R2_BUCKET_NAME || process.env.S3_BUCKET_NAME;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
    const endpoint = process.env.R2_ENDPOINT || process.env.AWS_ENDPOINT;
    const region = process.env.AWS_REGION || "auto";

    if (bucket && accessKeyId && secretAccessKey) {
      this.bucket = bucket;
      this.provider = endpoint && endpoint.includes("r2.cloudflarestorage.com") ? "r2" : "s3";
      this.publicBaseUrl = process.env.R2_PUBLIC_URL || process.env.S3_PUBLIC_URL || null;

      this.s3Client = new S3Client({
        region,
        endpoint: endpoint || undefined,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    } else {
      this.provider = "local";
    }
  }

  isCloud(): boolean {
    return this.provider !== "local";
  }

  getProvider(): "r2" | "s3" | "local" {
    return this.provider;
  }

  async uploadFile(options: UploadOptions): Promise<UploadResult> {
    const folder = options.folder ? `${options.folder}/` : "";
    const ext = path.extname(options.filename) || ".bin";
    const uniqueName = `${randomUUID()}${ext}`;
    const key = `${folder}${uniqueName}`;

    if (this.s3Client && this.bucket) {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: options.buffer,
        ContentType: options.mimeType,
      });

      await this.s3Client.send(command);

      const url = this.publicBaseUrl
        ? `${this.publicBaseUrl.replace(/\/+$/, "")}/${key}`
        : `https://${this.bucket}.r2.dev/${key}`;

      return {
        url,
        key,
        provider: this.provider,
      };
    }

    // Local Disk Fallback
    const uploadDir = path.join(process.cwd(), ".data", "uploads", options.folder || "");
    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true });
    }

    const filePath = path.join(uploadDir, uniqueName);
    writeFileSync(filePath, options.buffer);

    return {
      url: `/api/uploads/${key}`,
      key,
      provider: "local",
    };
  }

  async getPresignedUploadUrl(filename: string, mimeType: string, folder = "evidence"): Promise<PresignedUploadResult> {
    const ext = path.extname(filename) || ".bin";
    const key = `${folder}/${randomUUID()}${ext}`;

    if (this.s3Client && this.bucket) {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: mimeType,
      });

      const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
      const publicUrl = this.publicBaseUrl
        ? `${this.publicBaseUrl.replace(/\/+$/, "")}/${key}`
        : `https://${this.bucket}.r2.dev/${key}`;

      return { uploadUrl, key, publicUrl };
    }

    // Local fallback: return relative local upload endpoint
    return {
      uploadUrl: `/api/uploads/local`,
      key,
      publicUrl: `/api/uploads/${key}`,
    };
  }

  async deleteFile(key: string): Promise<boolean> {
    try {
      if (this.s3Client && this.bucket) {
        const command = new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        });
        await this.s3Client.send(command);
        return true;
      }

      // Local fallback
      const localPath = path.join(process.cwd(), ".data", "uploads", key);
      if (existsSync(localPath)) {
        unlinkSync(localPath);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}

let globalStorage: StorageService | null = null;

export function getStorageService(): StorageService {
  if (!globalStorage) {
    globalStorage = new StorageService();
  }
  return globalStorage;
}
