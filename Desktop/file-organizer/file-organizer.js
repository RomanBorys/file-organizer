import { Command } from 'commander';
import { Scanner } from './lib/scanner.js';
import { DuplicateFinder } from './lib/duplicates.js';
import { Organizer } from './lib/organizer.js';
import { Cleanup } from './lib/cleanup.js';
import path from 'path';

const program = new Command();

program
  .name('file-organizer')
  .description('CLI для організації та аналізу файлів')
  .version('1.0.0');

program
  .command('scan')
  .argument('<directory>', 'директорія для сканування')
  .description('Сканує директорію та показує статистику файлів')
  .action(async (directory) => {
    const scanner = new Scanner();

    scanner.on('scan-start', ({ directory }) => {
      console.log(`Початок сканування директорії: ${directory}`);
    });

    scanner.on('file-found', ({ path: filePath }) => {
      process.stdout.write(`\r🔍 Файл знайдено: ${filePath} `);
    });

    scanner.on('scan-complete', (stats) => {
      console.log('\n\nСканування завершено!');
      console.log(`Знайдено файлів: ${stats.totalFiles}`);
      console.log(`Загальний розмір: ${stats.totalSize} байт`);

      console.log('\nСтатистика за типами файлів:');
      stats.byType.forEach((t) => {
        console.log(`  ${t.extension} — ${t.count} файлів, ${t.totalSize} байт`);
      });

      console.log('\nРозподіл файлів за віком:');
      console.log(`  Останні 7 днів: ${stats.age.last7} файлів`);
      console.log(`  Останні 30 днів: ${stats.age.last30} файлів`);
      console.log(`  Старші 90 днів: ${stats.age.older90} файлів`);

      console.log('\nТоп-3 найбільших файли:');
      stats.largest.forEach((f, i) => {
        console.log(`  ${i + 1}. ${path.basename(f.path)} — ${f.size} байт`);
      });

      console.log(`\nНайстаріший файл: ${path.basename(stats.oldest.path)} (${stats.oldest.age} днів)`);
    });

    try {
      await scanner.scan(directory);
    } catch (err) {
      console.error(`Помилка сканування: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('duplicates')
  .argument('<directory>', 'директорія для пошуку дублікатів')
  .description('Шукає дублікати файлів за вмістом (SHA-256)')
  .action(async (directory) => {
    const finder = new DuplicateFinder();

    finder.on('file-processed', ({ current, total, file }) => {
      process.stdout.write(`\rОброблено файлів: ${current}/${total} (${file})`);
    });

    finder.on('duplicates-found', (groups) => {
      console.log(`\n\nЗнайдено ${groups.length} груп дублікатів:`);
      groups.forEach((g, i) => {
        console.log(`\nГрупа ${i + 1} (${g.paths.length} копії, ${g.size} байт кожна)`);
        console.log(`  SHA-256: ${g.hash}`);
        g.paths.forEach((f) => console.log(`  📄 ${f}`));
      });
    });

    try {
      await finder.findDuplicates(directory);
    } catch (err) {
      console.error(`Помилка пошуку дублікатів: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('organize')
  .argument('<source>', 'джерельна директорія')
  .option('--output <target>', 'цільова директорія', './Organized')
  .description('Сортує файли по категоріях та копіює їх у цільову директорію')
  .action(async (source, options) => {
    const organizer = new Organizer();

    organizer.on('copy-start', ({ file, targetPath }) => {
      process.stdout.write(`\rКопіювання: ${file} → ${targetPath} `);
    });

    organizer.on('copy-complete', ({ summary }) => {
      console.log('\n\nКопіювання завершено!');
      console.log('Статистика по категоріях:');
      for (const [category, count] of Object.entries(summary)) {
        console.log(`  ${category}: ${count} файлів`);
      }
    });

    try {
      await organizer.organize(source, options.output);
    } catch (err) {
      console.error(`Помилка організації: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('cleanup')
  .argument('<directory>', 'директорія для очищення')
  .option('--older-than <days>', 'видаляти файли старші ніж N днів', '90')
  .option('--confirm', 'підтвердити видалення файлів')
  .description('Видаляє старі файли з директорії')
  .action(async (directory, options) => {
    const cleanup = new Cleanup();

    cleanup.on('file-found', ({ file, size, mtime }) => {
      process.stdout.write(`\rЗнайдено файл для видалення: ${file} (${size} байт)`);
    });

    cleanup.on('file-deleted', ({ file, current, total }) => {
      process.stdout.write(`\rВидалено файл: ${file} (${current}/${total})`);
    });

    cleanup.on('cleanup-complete', ({ files, deleted }) => {
      console.log(`\n\nОчищення завершено!`);
      console.log(`Знайдено ${files.length} файлів для видалення`);
      console.log(`Видалено ${deleted} файлів`);
    });

    try {
      await cleanup.clean(directory, parseInt(options.olderThan, 10), options.confirm || false);
    } catch (err) {
      console.error(`Помилка очищення: ${err.message}`);
      process.exit(1);
    }
  });

program.parse();