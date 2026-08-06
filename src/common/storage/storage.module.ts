import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

/**
 * Global file-storage module. Serves the StorageService anywhere without
 * re-importing. Backed by local disk under STORAGE_PATH (see config).
 */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
