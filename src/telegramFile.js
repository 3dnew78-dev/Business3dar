// Downloads a file from Telegram's file server into a Buffer so we can store it in Postgres.
async function downloadTelegramFile(telegram, fileId) {
  const file = await telegram.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${telegram.token}/${file.file_path}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download Telegram file: ${res.status}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function guessMimetypeFromFilename(filename = '') {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.glb')) return 'model/gltf-binary';
  if (lower.endsWith('.gltf')) return 'model/gltf+json';
  if (lower.endsWith('.usdz')) return 'model/vnd.usdz+zip';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

module.exports = { downloadTelegramFile, guessMimetypeFromFilename };
