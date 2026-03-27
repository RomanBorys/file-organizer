import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';

export class Cleanup extends EventEmitter {
  constructor() {
    super();
  }

  async clean(directory, olderThanDays = 90, confirm = false) {
    try {
      const files = await this._getAllFiles(directory);
      const now = Date.now();
      const threshold = olderThanDays * 24 * 60 * 60 * 1000;
      const oldFiles = [];

      for (const file of files) {
        try {
          const stats = await fs.promises.stat(file);
          const age = now - stats.mtime.getTime();
          if (age > threshold) {
            oldFiles.push({ file, size: stats.size, mtime: stats.mtime });
            this.emit('file-found', { file, size: stats.size, mtime: stats.mtime });
          }
        } catch (err) {
          this.emit('file-error', { file, error: err });
        }
      }

      if (confirm) {
        let deleted = 0;
        for (const f of oldFiles) {
          try {
            await fs.promises.unlink(f.file);
            deleted++;
            this.emit('file-deleted', { file: f.file, size: f.size, current: deleted, total: oldFiles.length });
          } catch (err) {
            this.emit('file-error', { file: f.file, error: err });
          }
        }
      }

      this.emit('cleanup-complete', { files: oldFiles, deleted: confirm ? oldFiles.length : 0 });
    } catch (err) {
      this.emit('error', err);
    }
  }

  async _getAllFiles(dir) {
    let results = [];
    const list = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of list) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results = results.concat(await this._getAllFiles(fullPath));
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
    return results;
  }
}