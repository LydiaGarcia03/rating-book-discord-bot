require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  Client, GatewayIntentBits, Events, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, AttachmentBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  MessageFlags, PermissionFlagsBits,
} = require('discord.js');

// ---------- Text (en = English, pt = Portuguese) ----------
const TEXT = {
  en: {
    locale: 'en-US',
    by: author => `by **${author}**`,
    ratingCount: n => (n === 1 ? '1 rating' : `${n} ratings`),
    noRatings: 'No ratings yet.',
    ratingsHeader: 'Ratings',
    more: n => `+${n} more`,
    footerOpen: 'Pick your rating from the menu below — you can change it anytime',
    footerClosed: '🔒 Rating closed',
    placeholder: 'Rate this book',
    option: (n, f) => (n === 0.5 ? '½ star' : `${f} ${n === 1 ? 'star' : 'stars'}`),
    remove: 'Remove my rating',
    close: 'Close',
    reopen: 'Reopen',
    // private notices
    coverNotImage: 'The cover must be an image (PNG, JPG, WEBP or GIF).',
    coverUrlInvalid: 'The cover link must start with http:// or https://',
    pollNotFound: "I couldn't find this rating poll (it may have been created by another copy of the bot).",
    pollClosed: 'This rating has already been closed.',
    noPermission: "You don't have permission to close or reopen this rating.",
    error: 'Something went wrong. Please try again.',
    permTitle: '**Who can close and reopen ratings:**',
    permCreator: 'Whoever created the rating',
    permAdmins: 'Server administrators',
    permRoles: list => `Roles: ${list}`,
    permUsers: list => `People: ${list}`,
    permNoRoles: '_no extra roles_',
    permNoUsers: '_no extra people_',
  },
  pt: {
    locale: 'pt-BR',
    by: author => `por **${author}**`,
    ratingCount: n => (n === 1 ? '1 avaliação' : `${n} avaliações`),
    noRatings: 'Ninguém avaliou ainda.',
    ratingsHeader: 'Notas',
    more: n => `+${n} outras`,
    footerOpen: 'Escolha sua nota no menu abaixo — você pode mudar quando quiser',
    footerClosed: '🔒 Avaliação encerrada',
    placeholder: 'Dar minha nota',
    option: (n, f) => (n === 0.5 ? '½ estrela' : `${f} ${n === 1 ? 'estrela' : 'estrelas'}`),
    remove: 'Remover minha nota',
    close: 'Encerrar',
    reopen: 'Reabrir',
    coverNotImage: 'A capa precisa ser uma imagem (PNG, JPG, WEBP ou GIF).',
    coverUrlInvalid: 'O link da capa precisa começar com http:// ou https://',
    pollNotFound: 'Não encontrei essa avaliação (ela pode ter sido criada por outra cópia do bot).',
    pollClosed: 'Essa avaliação já foi encerrada.',
    noPermission: 'Você não tem permissão para encerrar ou reabrir esta avaliação.',
    error: 'Algo deu errado. Tente de novo.',
    permTitle: '**Quem pode encerrar e reabrir avaliações:**',
    permCreator: 'Quem criou a avaliação',
    permAdmins: 'Administradores do servidor',
    permRoles: list => `Cargos: ${list}`,
    permUsers: list => `Pessoas: ${list}`,
    permNoRoles: '_nenhum cargo extra_',
    permNoUsers: '_nenhuma pessoa extra_',
  },
};

// Rating messages in the channel are always posted in this language
const DEFAULT_LANGUAGE = 'en';
// Private notices follow the language of the person who clicked
const userLanguage = interaction => (interaction.locale?.startsWith('pt') ? 'pt' : 'en');

// ---------- Storage (plain JSON files) ----------
const DATA_DIR = path.join(__dirname, 'data');
const POLLS_FILE = path.join(DATA_DIR, 'polls.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
let polls = {};  // { [messageId]: Poll }
let config = {}; // { [guildId]: { roles: [roleId], users: [userId] } }

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}
function writeJson(file, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

// Converts data saved by older (Portuguese) versions of the bot to the current format
function migratePoll(p) {
  if ('title' in p) return p;
  return {
    title: p.titulo,
    author: p.autor,
    language: p.idioma || 'pt',
    creatorId: p.criador,
    closed: !!p.fechada,
    ratings: p.notas || {},
    coverFile: p.capaArquivo || null,
    coverUrl: p.capaUrl || null,
  };
}
function migrateGuildConfig(c) {
  return { roles: c.roles || c.cargos || [], users: c.users || c.pessoas || [] };
}
function loadData() {
  polls = Object.fromEntries(Object.entries(readJson(POLLS_FILE)).map(([id, p]) => [id, migratePoll(p)]));
  config = Object.fromEntries(Object.entries(readJson(CONFIG_FILE)).map(([id, c]) => [id, migrateGuildConfig(c)]));
}

// Ratings are written to disk right after replying to Discord, batching several clicks
// into one write — so the disk never slows down a response.
let pendingWrite = null;
function savePolls() {
  if (pendingWrite) return;
  pendingWrite = setTimeout(() => {
    pendingWrite = null;
    try { writeJson(POLLS_FILE, polls); } catch (err) { console.error('Failed to save ratings:', err.message); }
  }, 300);
}
function savePollsNow() {
  if (pendingWrite) { clearTimeout(pendingWrite); pendingWrite = null; }
  writeJson(POLLS_FILE, polls);
}
const saveConfig = () => writeJson(CONFIG_FILE, config);

// Make sure nothing is lost when the bot stops (Ctrl+C, closing the window, pm2 stop)
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => { try { savePollsNow(); } finally { process.exit(0); } });
}

// Logs how long each rating took (set DEBUG_TIMING=0 in .env to turn it off)
const LOG_TIMING = (process.env.DEBUG_TIMING ?? process.env.DEBUG_TEMPO) !== '0';
function logTiming(interaction, start) {
  if (!LOG_TIMING) return;
  const arrival = start - interaction.createdTimestamp;
  const response = Date.now() - start;
  console.log(`[timing] click→bot: ${arrival}ms | bot→Discord: ${response}ms | ping: ${interaction.client.ws.ping}ms`);
}

// Clicks still being processed, per person and poll
const inFlight = new Set();

// ---------- Star emojis ----------
// The bot uploads the images in assets/ as its own application emojis (only the first time).
const EMOJI_NAMES = {
  full: 'star_full',
  half: 'star_half',
  empty: 'star_empty',
};
// One emoji per rating for the dropdown (5 stars in 2 rows): rating05 = ½, rating35 = 3.5 ...
const ratingKey = n => `rating${String(n * 10).padStart(2, '0')}`;
for (let k = 1; k <= 10; k++) {
  const n = k / 2;
  EMOJI_NAMES[ratingKey(n)] = `rating_${String(n * 10).padStart(2, '0')}`;
}
const EMOJI = {};
const FALLBACK = { full: '★', half: '½', empty: '☆' }; // used if the emojis can't be created

async function setupEmojis(client) {
  try {
    const existing = await client.application.emojis.fetch();
    for (const [key, name] of Object.entries(EMOJI_NAMES)) {
      let emoji = existing.find(e => e.name === name);
      if (!emoji) {
        emoji = await client.application.emojis.create({
          attachment: path.join(__dirname, 'assets', `${name}.png`),
          name,
        });
        console.log(`Emoji ${name} created.`);
      }
      EMOJI[key] = emoji;
    }
  } catch (err) {
    console.warn("Couldn't set up the star emojis; falling back to plain ★.", err.message);
  }
}

// ---------- Rendering ----------
function starParts(n) {
  const r = Math.round(n * 2) / 2;               // round to the nearest ½
  const full = Math.floor(r);
  const half = r - full === 0.5;
  return [
    ...Array(full).fill('full'),
    ...(half ? ['half'] : []),
    ...Array(5 - full - (half ? 1 : 0)).fill('empty'),
  ];
}
const stars = n => starParts(n).map(k => (EMOJI[k] ? EMOJI[k].toString() : FALLBACK[k])).join('');
const fmt = (n, t) => n.toLocaleString(t.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtShort = (n, t) => n.toLocaleString(t.locale, { maximumFractionDigits: 1 }); // 4 / 4.5
const RATINGS = [5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5];

function averageOf(poll) {
  const values = Object.values(poll.ratings);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function buildEmbed(poll, t) {
  const total = Object.keys(poll.ratings).length;
  const average = averageOf(poll);

  let desc = `${t.by(poll.author)}\n\n`;
  desc += total
    ? `## ${stars(average)}\n**${fmt(average, t)} / 5**  ·  ${t.ratingCount(total)}`
    : `## ${stars(0)}\n_${t.noRatings}_`;

  if (total) {
    desc += `\n\n**${t.ratingsHeader}**\n`;
    const lines = Object.entries(poll.ratings)
      .sort((a, b) => b[1] - a[1])
      .map(([userId, rating]) => `${stars(rating)}  ${fmt(rating, t)} — <@${userId}>`);
    let shown = 0;
    for (const line of lines) {
      if ((desc + line + '\n').length > 3900) break; // embed description limit is 4096
      desc += line + '\n';
      shown++;
    }
    if (shown < lines.length) desc += `_${t.more(lines.length - shown)}_`;
  }

  const embed = new EmbedBuilder()
    .setColor(poll.closed ? 0x808080 : 0xf5b301)
    .setTitle(`📖 ${poll.title}`)
    .setDescription(desc)
    .setFooter({ text: poll.closed ? t.footerClosed : t.footerOpen });

  if (poll.coverFile) embed.setImage(`attachment://${poll.coverFile}`);
  else if (poll.coverUrl) embed.setImage(poll.coverUrl);
  return embed;
}

function buildComponents(poll, t) {
  if (poll.closed) {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('reopen').setLabel(t.reopen).setStyle(ButtonStyle.Secondary),
    )];
  }

  // Dropdown with the 10 ratings, from 5 down to ½, each with its 5-star icon
  const menu = new StringSelectMenuBuilder()
    .setCustomId('rate')
    .setPlaceholder(t.placeholder)
    .addOptions(RATINGS.map(n => {
      const option = new StringSelectMenuOptionBuilder()
        .setValue(String(n))
        .setLabel(t.option(n, fmtShort(n, t)));
      const key = EMOJI[ratingKey(n)] ? ratingKey(n) : (Number.isInteger(n) ? 'full' : 'half');
      if (EMOJI[key]) option.setEmoji({ id: EMOJI[key].id, name: EMOJI[key].name });
      return option;
    }));
  return [
    new ActionRowBuilder().addComponents(menu),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('remove').setLabel(t.remove).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('close').setLabel(t.close).setStyle(ButtonStyle.Danger),
    ),
  ];
}

// Each poll keeps the language it was created in
function render(poll) {
  const t = TEXT[poll.language] || TEXT[DEFAULT_LANGUAGE];
  return { embeds: [buildEmbed(poll, t)], components: buildComponents(poll, t) };
}

// Ephemeral replies: only the person who clicked sees them, so they never clutter the channel
const notify = (interaction, key) =>
  interaction.reply({ content: TEXT[userLanguage(interaction)][key], flags: MessageFlags.Ephemeral });

// ---------- Close / reopen permissions ----------
function memberRoleIds(member) {
  const roles = member?.roles;
  if (Array.isArray(roles)) return roles;            // raw member from the interaction payload
  if (roles?.cache) return [...roles.cache.keys()];  // full GuildMember
  return [];
}

function canManage(interaction, poll) {
  if (interaction.user.id === poll.creatorId) return true;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  const guild = config[interaction.guildId] || {};
  if ((guild.users || []).includes(interaction.user.id)) return true;
  const roles = guild.roles || [];
  return memberRoleIds(interaction.member).some(id => roles.includes(id));
}

async function handlePermissionCommand(interaction) {
  const t = TEXT[userLanguage(interaction)];
  const sub = interaction.options.getSubcommand();
  const guild = (config[interaction.guildId] ||= { roles: [], users: [] });

  if (sub === 'add' || sub === 'remove') {
    // "who" accepts either a role or a person
    const option = interaction.options.get('who', true);
    const list = option.role ? 'roles' : 'users';
    const id = option.role ? option.role.id : option.user.id;
    if (sub === 'add') {
      if (!guild[list].includes(id)) guild[list].push(id);
    } else {
      guild[list] = guild[list].filter(x => x !== id);
    }
    saveConfig();
  }

  const roles = guild.roles.length ? guild.roles.map(id => `<@&${id}>`).join(', ') : t.permNoRoles;
  const users = guild.users.length ? guild.users.map(id => `<@${id}>`).join(', ') : t.permNoUsers;
  return interaction.reply({
    content:
      `${t.permTitle}\n• ${t.permCreator}\n• ${t.permAdmins}\n` +
      `• ${t.permRoles(roles)}\n• ${t.permUsers(users)}`,
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

// ---------- /book ----------
async function handleBookCommand(interaction) {
  const title = interaction.options.getString('title');
  const author = interaction.options.getString('author');
  const cover = interaction.options.getAttachment('cover');
  const coverUrl = interaction.options.getString('cover_url');

  if (cover && !cover.contentType?.startsWith('image/')) return notify(interaction, 'coverNotImage');
  if (!cover && coverUrl && !/^https?:\/\/\S+$/i.test(coverUrl)) return notify(interaction, 'coverUrlInvalid');

  await interaction.deferReply();

  const poll = {
    title,
    author,
    language: DEFAULT_LANGUAGE,
    creatorId: interaction.user.id,
    closed: false,
    ratings: {},
    coverFile: null,
    coverUrl: null,
  };
  const files = [];

  if (cover) {
    // Re-upload the image with the message so the cover link never expires
    const res = await fetch(cover.url);
    const buffer = Buffer.from(await res.arrayBuffer());
    const ext = (cover.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    poll.coverFile = `cover.${ext}`;
    files.push(new AttachmentBuilder(buffer, { name: poll.coverFile }));
  } else if (coverUrl) {
    poll.coverUrl = coverUrl;
  }

  const message = await interaction.editReply({ ...render(poll), files });
  polls[message.id] = poll;
  savePolls();
}

// ---------- Poll message components ----------
// Component IDs used by older versions of the bot
const LEGACY_IDS = { nota: 'rate', remover: 'remove', encerrar: 'close', reabrir: 'reopen' };

async function handleComponent(interaction) {
  const userId = interaction.user.id;
  const action = LEGACY_IDS[interaction.customId] || interaction.customId;

  const poll = polls[interaction.message.id];
  if (!poll) return notify(interaction, 'pollNotFound');

  if (action === 'rate') {
    if (poll.closed) return notify(interaction, 'pollClosed');
    const key = `${interaction.message.id}:${userId}`;
    if (inFlight.has(key)) return interaction.deferUpdate().catch(() => {});
    inFlight.add(key);

    const start = Date.now();
    try {
      poll.ratings[userId] = parseFloat(interaction.values[0]);
      await interaction.update(render(poll)); // edits the same message, no new message
      logTiming(interaction, start);
      savePolls();
    } finally {
      inFlight.delete(key);
    }
    return;
  }

  if (action === 'remove') {
    if (!(userId in poll.ratings)) return interaction.deferUpdate();
    delete poll.ratings[userId];
    savePolls();
    return interaction.update(render(poll));
  }

  if (action === 'close' || action === 'reopen') {
    if (!canManage(interaction, poll)) return notify(interaction, 'noPermission');
    poll.closed = action === 'close';
    savePolls();
    return interaction.update(render(poll));
  }

  // Any other component comes from an older version: refresh the message to the current layout
  return interaction.update(render(poll));
}

// ---------- Bot ----------
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async c => {
  loadData();
  await setupEmojis(c);
  console.log(`Bot online as ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      // "await" so that errors inside the handlers are caught below
      if (interaction.commandName === 'book') await handleBookCommand(interaction);
      else if (interaction.commandName === 'book-permission') await handlePermissionCommand(interaction);
      return;
    }
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      await handleComponent(interaction);
    }
  } catch (err) {
    console.error(err);
    const reply = { content: TEXT[userLanguage(interaction)].error, flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) interaction.followUp(reply).catch(() => {});
    else interaction.reply(reply).catch(() => {});
  }
});

client.login(process.env.DISCORD_TOKEN);
