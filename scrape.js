import fs from 'fs';
import path from 'path';
import { pinterest } from './pinterest.js';
import axios from 'axios';

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadImage(url, filepath) {
  const writer = fs.createWriteStream(filepath);
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.pinterest.com/',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Connection': 'keep-alive',
    }
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', () => {
      const stats = fs.statSync(filepath);
      resolve(stats.size);
    });
    writer.on('error', reject);
  });
}

async function runCycle() {
  let query, folder, limit;

  if (process.argv[2] && process.argv[3]) {
    query = process.argv[2];
    folder = process.argv[3];
    limit = Number(process.argv[4]) || 5;
  } else {
    try {
      const configRaw = fs.readFileSync('./config.json', 'utf-8');
      const config = JSON.parse(configRaw);
      query = config.query;
      folder = config.folder;
      limit = config.limit || 5;
    } catch (err) {
      console.error('Gagal membaca config.json dan argumen tidak lengkap.');
      console.log('Usage: node index.js <query> <folder> <limit>');
      process.exit(1);
    }
  }

  if (!query || !folder) {
    console.log('Query dan folder harus diisi.');
    process.exit(1);
  }

  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }

  console.log(`\n📝 Mulai mengunduh gambar untuk query: "${query}"`);
  const startSearch = Date.now();
  const images = await pinterest(query);
  const endSearch = Date.now();

  const imagesToDownload = images.slice(0, limit);

  console.log(`\n🔍 Keyword             : ${query}`);
  console.log(`📄 Jumlah diminta      : ${limit}`);
  console.log(`📂 Folder tujuan       : ${folder}`);
  console.log(`🖼️ Gambar ditemukan    : ${images.length}`);
  console.log(`📥 Gambar akan disimpan: ${imagesToDownload.length}`);
  console.log(`⏱️ Waktu pencarian     : ${((endSearch - startSearch) / 1000).toFixed(2)} detik\n`);

  let totalSize = 0;
  let failedCount = 0;
  const downloadedFiles = [];
  const startDownload = Date.now();

  for (let i = 0; i < imagesToDownload.length; i++) {
    const img = imagesToDownload[i];
    const ext = path.extname(img.image).split('?')[0] || '.jpg';
    const filename = `${query}_${Date.now()}_${i + 1}${ext}`;
    const filepath = path.join(folder, filename);

    try {
      process.stdout.write(`Mengunduh gambar ${i + 1} dari ${imagesToDownload.length}...\r`);
      const size = await downloadImage(img.image, filepath);
      totalSize += size;
      downloadedFiles.push(filename);
    } catch (err) {
      failedCount++;
      console.log(`Gagal mengunduh gambar ke-${i + 1}: ${err.message}`);
    }

    // Delay random 1-3 detik biar gak terlalu agresif
    await sleep(Math.floor(Math.random() * 2000) + 1000);
  }

  const endDownload = Date.now();
  const totalTime = (endDownload - startSearch) / 1000;

  console.log(`\n\n📝 Statistik:`);
  console.log(`🔍 Keyword             : ${query}`);
  console.log(`📄 Jumlah diminta      : ${limit}`);
  console.log(`📂 Folder tujuan       : ${folder}`);
  console.log(`🖼️ Gambar ditemukan    : ${images.length}`);
  console.log(`📥 Gambar berhasil     : ${imagesToDownload.length - failedCount}`);
  console.log(`❌ Gambar gagal        : ${failedCount}`);
  console.log(`📏 Ukuran total gambar : ${formatBytes(totalSize)}`);
  console.log(`⏱️ Waktu pencarian     : ${((endSearch - startSearch) / 1000).toFixed(2)} detik`);
  console.log(`⏳ Waktu download      : ${((endDownload - startDownload) / 1000).toFixed(2)} detik`);
  console.log(`🕒 Total waktu         : ${totalTime.toFixed(2)} detik`);
  
  console.log('\n📁 File yang berhasil diunduh:');
  downloadedFiles.forEach(file => console.log(` - ${file}`));
}

async function main() {
  while (true) {
    await runCycle();
    // Kalau mau delay 5 menit antara cycle, hapus break dan aktifkan ini:
    // await sleep(5 * 60 * 1000);
    break; // kalau cuma sekali jalan saja
  }
}

main();
