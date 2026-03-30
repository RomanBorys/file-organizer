import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';

export class Cleanup extends EventEmitter {
  constructor() {
    super();
  }

  async run(directory, { olderThan = 90, confirm = false } = {}) {
    try {
      const files = await this._getAllFiles(directory);
      const now = Date.now();
      const threshold = olderThan * 24 * 60 * 60 * 1000;
      const oldFiles = [];

      for (const file of files) {
        try {
          const stats = await fs.promises.stat(file);
          const ageDays = Math.floor((now - stats.mtime.getTime()) / (1000 * 60 * 60 * 24));

          if (ageDays > olderThan) {
            const fileInfo = { path: file, size: stats.size, mtime: stats.mtime, ageDays };
            oldFiles.push(fileInfo);
            this.emit('file-found', fileInfo);
          }

        } catch (err) {
          this.emit('file-error', { file, error: err });
        }
      }

      let deletedCount = 0;

      if (confirm) {
        for (const f of oldFiles) {
          try {
            await fs.promises.unlink(f.path);
            deletedCount++;
            this.emit('file-deleted', { ...f, current: deletedCount, total: oldFiles.length });
          } catch (err) {
            this.emit('file-error', { file: f.path, error: err });
          }
        }
      }

      this.emit('cleanup-complete', {
        files: oldFiles,
        deletedCount,
        confirm
      });

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