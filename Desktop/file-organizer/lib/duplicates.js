import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { promisify } from 'util';
import { pipeline } from 'stream/promises';

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

export class DuplicateFinder extends EventEmitter {
  constructor() {
    super();
    this.fileHashes = new Map();
  }

  async findDuplicates(directory) {
    try {
      const files = await this._getAllFiles(directory);
      const totalFiles = files.length;
      let processed = 0;

      for (const file of files) {
        try {
          const hash = await this._hashFile(file);
          if (!this.fileHashes.has(hash)) this.fileHashes.set(hash, []);
          this.fileHashes.get(hash).push(file);

          processed++;
          this.emit('file-processed', { current: processed, total: totalFiles, file });
        } catch (err) {
          this.emit('file-error', { file, error: err });
        }
      }

      const duplicates = [];
      for (const [hash, paths] of this.fileHashes.entries()) {
        if (paths.length > 1) {
          const size = (await stat(paths[0])).size;
          duplicates.push({ hash, paths, size });
        }
      }

      this.emit('duplicates-found', duplicates);
    } catch (err) {
      this.emit('error', err);
    }
  }

  async _getAllFiles(dir) {
    let results = [];
    const list = await readdir(dir, { withFileTypes: true });
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

  _hashFile(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }
}