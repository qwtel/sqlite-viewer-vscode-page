/// <reference types="bun-types" />

import * as fs from 'fs/promises';
import path from 'path';
import URL from 'url';
import { execSync } from 'child_process';

const __filename = URL.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const resolve = (...args: string[]) => path.resolve(__dirname, '..', ...args);

async function getFileSize(filePath: string): Promise<number> {
  try {
    const stat = await fs.stat(filePath);
    return stat.size;
  } catch {
    return 0;
  }
}

async function getDirectorySize(dirPath: string): Promise<{ [key: string]: number }> {
  const sizes: { [key: string]: number } = {};
  
  // Video file extensions to exclude
  const videoExtensions = ['.mp4', '.webm', '.gif', '.mov', '.avi', '.mkv'];
  
  try {
    const files = await fs.readdir(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = await fs.stat(filePath);
      if (stat.isFile()) {
        // Skip video files
        const ext = path.extname(file).toLowerCase();
        if (!videoExtensions.includes(ext)) {
          sizes[file] = stat.size;
        }
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error);
  }
  
  return sizes;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function main() {
  const srcDir = resolve('src/images');
  const distDir = resolve('dist/images');
  
  console.log('📊 Image Minification Stats\n');
  
  // Get original sizes
  console.log('📁 Original images:');
  const originalSizes = await getDirectorySize(srcDir);
  const originalTotal = Object.values(originalSizes).reduce((sum, size) => sum + size, 0);
  
  for (const [file, size] of Object.entries(originalSizes)) {
    console.log(`  ${file}: ${formatBytes(size)}`);
  }
  console.log(`  Total: ${formatBytes(originalTotal)}\n`);
  
  // Run imagemin
  console.log('🔧 Running imagemin...');
  try {
    execSync('npx imagemin src/images/* -o dist/images', { stdio: 'inherit' });
  } catch (error) {
    console.error('Error running imagemin:', error);
    return;
  }
  
  // Get minified sizes
  console.log('\n📁 Minified images:');
  const minifiedSizes = await getDirectorySize(distDir);
  const minifiedTotal = Object.values(minifiedSizes).reduce((sum, size) => sum + size, 0);
  
  for (const [file, size] of Object.entries(minifiedSizes)) {
    const originalSize = originalSizes[file] || 0;
    const reduction = originalSize - size;
    const reductionPercent = originalSize > 0 ? ((reduction / originalSize) * 100).toFixed(1) : '0';
    
    console.log(`  ${file}: ${formatBytes(size)} (${reductionPercent}% reduction)`);
  }
  
  // Summary
  const totalReduction = originalTotal - minifiedTotal;
  const totalReductionPercent = originalTotal > 0 ? ((totalReduction / originalTotal) * 100).toFixed(1) : '0';
  
  console.log(`\n📈 Summary:`);
  console.log(`  Original total: ${formatBytes(originalTotal)}`);
  console.log(`  Minified total: ${formatBytes(minifiedTotal)}`);
  console.log(`  Total reduction: ${formatBytes(totalReduction)} (${totalReductionPercent}%)`);
  console.log(`  Images processed: ${Object.keys(originalSizes).length}`);
}

main().catch(console.error); 