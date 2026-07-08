const { Pool } = require('pg');

// Railway's Postgres plugin auto-injects DATABASE_URL.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
    ? { rejectUnauthorized: false }
    : false,
});

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS media (
      id SERIAL PRIMARY KEY,
      mimetype TEXT NOT NULL,
      filename TEXT,
      data BYTEA NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS companies (
      id SERIAL PRIMARY KEY,
      telegram_user_id BIGINT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      logo_media_id INTEGER REFERENCES media(id),
      channel_id BIGINT,
      channel_username TEXT,
      status TEXT NOT NULL DEFAULT 'onboarding', -- onboarding | awaiting_channel | active
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      price NUMERIC,
      image_media_id INTEGER REFERENCES media(id),
      model_media_id INTEGER REFERENCES media(id),
      usdz_media_id INTEGER REFERENCES media(id),
      posted_message_id BIGINT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

async function saveMedia(buffer, mimetype, filename) {
  const res = await pool.query(
    'INSERT INTO media (mimetype, filename, data) VALUES ($1, $2, $3) RETURNING id',
    [mimetype, filename || null, buffer]
  );
  return res.rows[0].id;
}

async function getMedia(id) {
  const res = await pool.query('SELECT mimetype, filename, data FROM media WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function getCompanyByTelegramId(telegramUserId) {
  const res = await pool.query('SELECT * FROM companies WHERE telegram_user_id = $1', [telegramUserId]);
  return res.rows[0] || null;
}

async function getCompanyById(id) {
  const res = await pool.query('SELECT * FROM companies WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function createCompany({ telegramUserId, name, description, logoMediaId }) {
  const res = await pool.query(
    `INSERT INTO companies (telegram_user_id, name, description, logo_media_id, status)
     VALUES ($1, $2, $3, $4, 'awaiting_channel') RETURNING *`,
    [telegramUserId, name, description, logoMediaId]
  );
  return res.rows[0];
}

async function linkChannel(companyId, channelId, channelUsername) {
  const res = await pool.query(
    `UPDATE companies SET channel_id = $2, channel_username = $3, status = 'active'
     WHERE id = $1 RETURNING *`,
    [companyId, channelId, channelUsername]
  );
  return res.rows[0];
}

async function createProduct(data) {
  const res = await pool.query(
    `INSERT INTO products (company_id, name, description, price, image_media_id, model_media_id, usdz_media_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      data.companyId,
      data.name,
      data.description,
      data.price,
      data.imageMediaId,
      data.modelMediaId,
      data.usdzMediaId || null,
    ]
  );
  return res.rows[0];
}

async function setProductPostedMessageId(productId, messageId) {
  await pool.query('UPDATE products SET posted_message_id = $2 WHERE id = $1', [productId, messageId]);
}

async function getProductById(id) {
  const res = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function listProductsByCompany(companyId) {
  const res = await pool.query(
    'SELECT * FROM products WHERE company_id = $1 ORDER BY created_at DESC',
    [companyId]
  );
  return res.rows;
}

module.exports = {
  pool,
  initSchema,
  saveMedia,
  getMedia,
  getCompanyByTelegramId,
  getCompanyById,
  createCompany,
  linkChannel,
  createProduct,
  setProductPostedMessageId,
  getProductById,
  listProductsByCompany,
};
