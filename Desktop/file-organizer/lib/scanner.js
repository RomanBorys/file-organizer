import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export class Scanner extends EventEmitter {
  constructor() {
    super();
    this.files = [];
  }

  async scan(directory) {
    this.emit('scan-start', { directory });
    await this._walk(directory);

    const totalFiles = this.files.length;
    const totalSize = this.files.reduce((sum, f) => sum + f.size, 0);

    const typesMap = new Map();
    for (const file of this.files) {
      const ext = path.extname(file.path).toLowerCase() || '(other)';
      if (!typesMap.has(ext)) typesMap.set(ext, { count: 0, size: 0 });
      const data = typesMap.get(ext);
      data.count += 1;
      data.size += file.size;
    }

    const now = Date.now();
    const ageStats = { last7: 0, last30: 0, older90: 0 };
    for (const file of this.files) {
      const ageDays = (now - file.mtime.getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays <= 7) ageStats.last7++;
      if (ageDays <= 30) ageStats.last30++;
      if (ageDays > 90) ageStats.older90++;
    }

    const largestFiles = [...this.files].sort((a, b) => b.size - a.size).slice(0, 3);
    const oldestFile = [...this.files].sort((a, b) => a.mtime - b.mtime)[0];

    this.emit('scan-complete', {
      totalFiles,
      totalSize,
      typesMap,
      ageStats,
      largestFiles,
      oldestFile
    });
  }

  async _walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
      this.emit('error', err);
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this._walk(fullPath);
      } else if (entry.isFile()) {
        try {
          const stats = await fs.stat(fullPath);
          const fileData = { path: fullPath, size: stats.size, mtime: stats.mtime };
          this.files.push(fileData);
          this.emit('file-found', fileData);
        } catch (err) {
          this.emit('error', err);
        }
      }
    }
  }
}