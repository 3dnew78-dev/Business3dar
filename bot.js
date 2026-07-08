const { Telegraf, Scenes, session, Markup, Input } = require('telegraf');
const db = require('./db');
const { downloadTelegramFile, guessMimetypeFromFilename } = require('./telegramFile');

function buildBot({ token, publicUrl }) {
  const bot = new Telegraf(token);
  let botUsername = null;

  // ---------- helpers ----------

  async function requirePhoto(ctx) {
    if (!ctx.message || !ctx.message.photo) {
      await ctx.reply('That doesn\'t look like a photo. Please send it as an image (not a file).');
      return null;
    }
    // largest resolution is the last element
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    return photo.file_id;
  }

  async function requireDocumentWithExt(ctx, exts) {
    if (!ctx.message || !ctx.message.document) {
      await ctx.reply(`Please send that as a file/document (not a photo), ending in ${exts.join(' or ')}.`);
      return null;
    }
    const doc = ctx.message.document;
    const lower = (doc.file_name || '').toLowerCase();
    if (!exts.some((e) => lower.endsWith(e))) {
      await ctx.reply(`That file doesn't have the right extension. Please send a ${exts.join(' or ')} file.`);
      return null;
    }
    return doc;
  }

  // ---------- onboarding wizard ----------

  const onboardingWizard = new Scenes.WizardScene(
    'onboarding',
    async (ctx) => {
      await ctx.reply("Let's set up your company on View3D.\n\nWhat's your company name?");
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (!ctx.message || !ctx.message.text) {
        await ctx.reply('Please send the company name as text.');
        return;
      }
      ctx.wizard.state.name = ctx.message.text.trim();
      await ctx.reply('Give a short description of your company (a sentence or two).');
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (!ctx.message || !ctx.message.text) {
        await ctx.reply('Please send a text description.');
        return;
      }
      ctx.wizard.state.description = ctx.message.text.trim();
      await ctx.reply('Now send your company logo as a photo.');
      return ctx.wizard.next();
    },
    async (ctx) => {
      const fileId = await requirePhoto(ctx);
      if (!fileId) return;
      await ctx.reply('Saving your logo...');
      const buffer = await downloadTelegramFile(ctx.telegram, fileId);
      const logoMediaId = await db.saveMedia(buffer, 'image/jpeg', 'logo.jpg');

      const company = await db.createCompany({
        telegramUserId: ctx.from.id,
        name: ctx.wizard.state.name,
        description: ctx.wizard.state.description,
        logoMediaId,
      });

      await ctx.reply(
        `✅ ${company.name} is set up.\n\n` +
          `Now let's connect the Telegram channel where your products will be posted:\n\n` +
          `1. Create a new Telegram channel (public or private).\n` +
          `2. Add @${botUsername} as an *administrator* of that channel, with permission to post messages.\n` +
          `3. Then come back here and either:\n` +
          `   • forward any message from that channel to me, or\n` +
          `   • send me the channel's @username\n\n` +
          `I'll verify I'm an admin and link it automatically.`,
        { parse_mode: 'Markdown' }
      );
      return ctx.scene.leave();
    }
  );

  // ---------- add product wizard ----------

  const addProductWizard = new Scenes.WizardScene(
    'addProduct',
    async (ctx) => {
      await ctx.reply("Let's add a new product. What's the product name?");
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (!ctx.message || !ctx.message.text) {
        await ctx.reply('Please send the product name as text.');
        return;
      }
      ctx.wizard.state.name = ctx.message.text.trim();
      await ctx.reply('Product description?');
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (!ctx.message || !ctx.message.text) {
        await ctx.reply('Please send a text description.');
        return;
      }
      ctx.wizard.state.description = ctx.message.text.trim();
      await ctx.reply('Price? (numbers only, e.g. 1200 or 19.99)');
      return ctx.wizard.next();
    },
    async (ctx) => {
      const text = ctx.message && ctx.message.text ? ctx.message.text.trim() : '';
      const price = parseFloat(text.replace(/[^0-9.]/g, ''));
      if (Number.isNaN(price)) {
        await ctx.reply('That doesn\'t look like a valid number. Please send the price as a number.');
        return;
      }
      ctx.wizard.state.price = price;
      await ctx.reply('Now send a product photo.');
      return ctx.wizard.next();
    },
    async (ctx) => {
      const fileId = await requirePhoto(ctx);
      if (!fileId) return;
      await ctx.reply('Got it. Now send the 3D model file as a .glb document.');
      const buffer = await downloadTelegramFile(ctx.telegram, fileId);
      ctx.wizard.state.imageMediaId = await db.saveMedia(buffer, 'image/jpeg', 'product.jpg');
      return ctx.wizard.next();
    },
    async (ctx) => {
      const doc = await requireDocumentWithExt(ctx, ['.glb']);
      if (!doc) return;
      await ctx.reply('Downloading 3D model... this can take a moment for larger files.');
      const buffer = await downloadTelegramFile(ctx.telegram, doc.file_id);
      ctx.wizard.state.modelMediaId = await db.saveMedia(
        buffer,
        guessMimetypeFromFilename(doc.file_name),
        doc.file_name
      );
      await ctx.reply(
        'Optional: for the best AR experience on iPhone, you can also send a .usdz version of this model.\n' +
          'Send the .usdz file now, or tap "Skip" if you don\'t have one.',
        Markup.inlineKeyboard([Markup.button.callback('Skip', 'skip_usdz')])
      );
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (ctx.updateType === 'callback_query') {
        await ctx.answerCbQuery();
        return finishProduct(ctx);
      }
      const doc = await requireDocumentWithExt(ctx, ['.usdz']);
      if (!doc) return;
      await ctx.reply('Downloading .usdz file...');
      const buffer = await downloadTelegramFile(ctx.telegram, doc.file_id);
      ctx.wizard.state.usdzMediaId = await db.saveMedia(buffer, 'model/vnd.usdz+zip', doc.file_name);
      return finishProduct(ctx);
    }
  );

  async function finishProduct(ctx) {
    const company = await db.getCompanyByTelegramId(ctx.from.id);
    if (!company || company.status !== 'active') {
      await ctx.reply('Your channel isn\'t linked yet, so I can\'t post this product. Send /start to finish setup first.');
      return ctx.scene.leave();
    }

    const state = ctx.wizard.state;
    const product = await db.createProduct({
      companyId: company.id,
      name: state.name,
      description: state.description,
      price: state.price,
      imageMediaId: state.imageMediaId,
      modelMediaId: state.modelMediaId,
      usdzMediaId: state.usdzMediaId,
    });

    await postProductToChannel(ctx, company, product);
    await ctx.reply(`✅ "${product.name}" was posted to your channel.`);
    return ctx.scene.leave();
  }

  async function postProductToChannel(ctx, company, product) {
    const media = await db.getMedia(product.image_media_id);
    const viewUrl = `${publicUrl}/view/${product.id}`;
    const caption =
      `*${escapeMarkdown(product.name)}*\n` +
      `${escapeMarkdown(product.description)}\n\n` +
      `💰 Price: ${product.price}`;

    const message = await ctx.telegram.sendPhoto(
      company.channel_id,
      Input.fromBuffer(media.data, media.filename || 'product.jpg'),
      {
        caption,
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
          Markup.button.url('View in your space 🔍', viewUrl),
        ]).reply_markup,
      }
    );
    await db.setProductPostedMessageId(product.id, message.message_id);
  }

  function escapeMarkdown(text = '') {
    return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
  }

  // ---------- stage / session ----------

  const stage = new Scenes.Stage([onboardingWizard, addProductWizard]);
  bot.use(session());
  bot.use(stage.middleware());

  // ---------- commands ----------

  bot.command('start', async (ctx) => {
    const company = await db.getCompanyByTelegramId(ctx.from.id);
    if (!company) {
      return ctx.scene.enter('onboarding');
    }
    if (company.status === 'awaiting_channel') {
      return ctx.reply(
        `Welcome back. Your company "${company.name}" is set up, but the channel isn't linked yet.\n\n` +
          `Add @${botUsername} as an admin on your channel, then forward a message from it here, or send the channel's @username.`
      );
    }
    return ctx.reply(
      `Welcome back, ${company.name}! Your channel is linked and active.\n\n` +
        `Use /addproduct to post a new product, or /myproducts to see what you've posted.`
    );
  });

  bot.command('addproduct', async (ctx) => {
    const company = await db.getCompanyByTelegramId(ctx.from.id);
    if (!company) {
      return ctx.reply('You need to set up your company first. Send /start.');
    }
    if (company.status !== 'active') {
      return ctx.reply('Your channel isn\'t linked yet. Finish that step first, then try again.');
    }
    return ctx.scene.enter('addProduct');
  });

  bot.command('myproducts', async (ctx) => {
    const company = await db.getCompanyByTelegramId(ctx.from.id);
    if (!company) {
      return ctx.reply('You need to set up your company first. Send /start.');
    }
    const products = await db.listProductsByCompany(company.id);
    if (products.length === 0) {
      return ctx.reply('No products yet. Use /addproduct to post your first one.');
    }
    const lines = products.map((p) => `• ${p.name} — ${p.price} — ${publicUrl}/view/${p.id}`);
    return ctx.reply(lines.join('\n'));
  });

  bot.command('cancel', async (ctx) => {
    await ctx.scene.leave();
    return ctx.reply('Cancelled.');
  });

  // ---------- channel linking (outside scenes) ----------

  bot.on('message', async (ctx, next) => {
    // Only intercept when this user has a company awaiting a channel link.
    const company = await db.getCompanyByTelegramId(ctx.from.id);
    if (!company || company.status !== 'awaiting_channel') {
      return next();
    }
    // Skip if we're inside an active scene (shouldn't be, but just in case).
    if (ctx.scene && ctx.scene.current) {
      return next();
    }

    let channelIdentifier = null;
    if (ctx.message.forward_from_chat && ctx.message.forward_from_chat.type === 'channel') {
      channelIdentifier = ctx.message.forward_from_chat.id;
    } else if (ctx.message.text && ctx.message.text.startsWith('@')) {
      channelIdentifier = ctx.message.text.trim();
    } else {
      await ctx.reply(
        'To link your channel, forward a message from it here, or send its @username.'
      );
      return;
    }

    try {
      const chat = await ctx.telegram.getChat(channelIdentifier);
      if (chat.type !== 'channel') {
        await ctx.reply('That doesn\'t look like a channel. Please forward a message from your channel, or send its @username.');
        return;
      }
      const me = await ctx.telegram.getMe();
      const member = await ctx.telegram.getChatMember(chat.id, me.id);
      const isAdmin = member.status === 'administrator' || member.status === 'creator';
      const canPost = member.can_post_messages !== false; // undefined counts as allowed for 'creator'

      if (!isAdmin || !canPost) {
        await ctx.reply(
          `I found the channel, but I'm not an admin with posting permission yet.\n` +
            `Add @${botUsername} as an admin with "Post Messages" enabled, then try again.`
        );
        return;
      }

      await db.linkChannel(company.id, chat.id, chat.username || null);
      await ctx.reply(
        `✅ Linked to ${chat.title}! You're all set.\n\n` +
          `Use /addproduct whenever you want to post something new.`
      );
    } catch (err) {
      await ctx.reply(
        'I couldn\'t find or verify that channel. Make sure I\'m an admin there, then forward a message from it or send its @username again.'
      );
    }
  });

  bot.catch((err, ctx) => {
    console.error('Bot error for update', ctx.updateType, err);
    ctx.reply('Something went wrong on my end. Please try again, or /cancel to start over.').catch(() => {});
  });

  async function launch() {
    const me = await bot.telegram.getMe();
    botUsername = me.username;
    await bot.launch();
    console.log(`Bot @${botUsername} launched (polling).`);
  }

  return { bot, launch };
}

module.exports = { buildBot };
