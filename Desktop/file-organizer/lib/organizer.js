import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

export class Organizer extends EventEmitter {
  constructor(categories = null) {
    super();
    this.categories = categories || {
      Documents: ['.pdf', '.docx', '.doc', '.txt', '.md', '.xlsx', '.pptx'],
      Images: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp'],
      Archives: ['.zip', '.rar', '.tar', '.gz', '.7z'],
      Code: ['.js', '.py', '.java', '.cpp', '.html', '.css', '.json'],
      Videos: ['.mp4', '.avi', '.mkv', '.mov', '.webm'],
      Other: []
    };
  }

  async organize(sourceDir, targetDir) {
    try {
      await this._createCategoryFolders(targetDir);
      const files = await this._getAllFiles(sourceDir);
      const totalFiles = files.length;
      let processed = 0;
      const summary = {};

      for (const category of Object.keys(this.categories)) summary[category] = 0;

      for (const file of files) {
        const category = this._getCategory(file);
        let targetPath = path.join(targetDir, category, path.basename(file));

        targetPath = await this._uniqueFileName(targetPath);

        try {
          this.emit('copy-start', { file, targetPath });

          const stats = await fs.promises.stat(file);
          if (stats.size >= 10 * 1024 * 1024) {
            await pipeline(fs.createReadStream(file), fs.createWriteStream(targetPath));
          } else {
            await fs.promises.copyFile(file, targetPath);
          }

          summary[category]++;
          processed++;
          this.emit('copy-complete', { file, targetPath, current: processed, total: totalFiles });
        } catch (err) {
          this.emit('copy-error', { file, targetPath, error: err });
        }
      }

      this.emit('organize-complete', summary);
    } catch (err) {
      this.emit('error', err);
    }
  }

  async _createCategoryFolders(targetDir) {
    for (const category of Object.keys(this.categories)) {
      await fs.promises.mkdir(path.join(targetDir, category), { recursive: true });
    }
  }

  _getCategory(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    for (const [category, exts] of Object.entries(this.categories)) {
      if (exts.includes(ext)) return category;
    }
    return 'Other';
  }

  async _uniqueFileName(filePath) {
    let counter = 1;
    let dir = path.dirname(filePath);
    let base = path.basename(filePath, path.extname(filePath));
    let ext = path.extname(filePath);
    let newPath = filePath;

    while (fs.existsSync(newPath)) {
      newPath = path.join(dir, `${base}(${counter})${ext}`);
      counter++;
    }
    return newPath;
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