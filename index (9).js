require('dotenv').config();
const db = require('./db');
const { buildServer } = require('./server');
const { buildBot } = require('./bot');

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');

if (!BOT_TOKEN) {
  console.error('Missing BOT_TOKEN in environment.');
  process.exit(1);
}
if (!PUBLIC_URL) {
  console.error('Missing PUBLIC_URL in environment (e.g. https://your-app.up.railway.app).');
  process.exit(1);
}

async function main() {
  await db.initSchema();
  console.log('Database schema ready.');

  const app = buildServer();
  app.listen(PORT, () => console.log(`Web server listening on port ${PORT}`));

  const { bot, launch } = buildBot({ token: BOT_TOKEN, publicUrl: PUBLIC_URL });
  await launch();

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
