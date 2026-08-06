import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface StoredFile {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly storagePath: string;

  constructor(private readonly configService: ConfigService) {
    this.storagePath = this.configService.get<string>('storage.path') ?? 'storage';
  }

  onModuleInit() {
    // Ensure storage root exists on boot
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
      this.logger.log(`Storage root created: ${this.storagePath}`);
    }
  }

  /**
   * Write a buffer to disk under the given folder.
   * File name is a random UUID — original extension is preserved from mimeType.
   * Throws BadRequestException if content exceeds maxBytes.
   */
  async store(
    folder: string,
    buffer: Buffer,
    mimeType: string,
    maxBytes: number,
  ): Promise<StoredFile> {
    if (buffer.length > maxBytes) {
      throw new BadRequestException(
        `File size exceeds maximum allowed (${maxBytes} bytes).`,
      );
    }

    const fileName = `${crypto.randomUUID()}${this.extFromMime(mimeType)}`;
    const filePath = this.resolvePath(folder, fileName);

    await fs.promises.writeFile(filePath, buffer);
    this.logger.debug(`Stored: ${filePath}`);

    return { fileName, mimeType, sizeBytes: buffer.length };
  }

  /**
   * Delete a file from disk. Silently succeeds if the file does not exist.
   */
  async remove(folder: string, fileName: string): Promise<void> {
    const filePath = this.resolvePath(folder, fileName);
    try {
      await fs.promises.unlink(filePath);
      this.logger.debug(`Removed: ${filePath}`);
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException;
      if (e.code !== 'ENOENT') throw err;
      // File already gone — treat as success.
    }
  }

  /**
   * Read a file synchronously. Returns raw Buffer.
   */
  readSync(folder: string, fileName: string): Buffer {
    return fs.readFileSync(this.resolvePath(folder, fileName));
  }

  /**
   * Return the MIME type of a file based on its extension on disk.
   */
  mimeTypeOf(filePath: string): string {
    return this.mimeFromExt(path.extname(filePath));
  }

  /**
   * Build an absolute filesystem path: <STORAGE_PATH>/<folder>/<fileName>.
   */
  resolvePath(folder: string, fileName: string): string {
    return path.resolve(this.storagePath, folder, fileName);
  }

  /**
   * Build a public-facing relative path: <folder>/<fileName>.
   * Used in URLs served by a static-file controller.
   */
  relativePath(folder: string, fileName: string): string {
    return `${folder}/${fileName}`;
  }

  /**
   * Parse a data-URL string (e.g. "data:image/png;base64,...") and
   * return its MIME type and decoded content as a Buffer.
   */
  decodeDataUrl(dataUrl: string): { mimeType: string; base64Content: string } {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      throw new BadRequestException('Invalid data-URL format.');
    }
    return { mimeType: match[1], base64Content: match[2] };
  }

  // ── helpers ────────────────────────────────────────────────────────────

  private extFromMime(mimeType: string): string {
    const map: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
      'application/pdf': '.pdf',
    };
    return map[mimeType.toLowerCase()] ?? '';
  }

  private mimeFromExt(ext: string): string {
    const map: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
    };
    return map[ext.toLowerCase()] ?? 'application/octet-stream';
  }
}
