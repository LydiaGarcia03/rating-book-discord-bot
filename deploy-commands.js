// Registers the bot's slash commands. Run once (and again whenever the commands change).
// Commands are in English, with Portuguese names for people using Discord in Portuguese
// (/book shows up as /livro, and so on).
//
// GUILD_ID set in .env  → commands only in that server, available instantly (good for testing).
// GUILD_ID empty        → global commands, for every server the bot is in (may take a few minutes).
require('dotenv').config();
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const pt = text => ({ 'pt-BR': text });

const book = new SlashCommandBuilder()
  .setName('book').setNameLocalizations(pt('livro'))
  .setDescription('Start a book rating (½ to 5 stars)')
  .setDescriptionLocalizations(pt('Abre uma avaliação de livro (notas de ½ a 5 estrelas)'))
  .addStringOption(o => o
    .setName('title').setNameLocalizations(pt('titulo'))
    .setDescription('Book title').setDescriptionLocalizations(pt('Título do livro'))
    .setRequired(true).setMaxLength(200))
  .addStringOption(o => o
    .setName('author').setNameLocalizations(pt('autor'))
    .setDescription('Book author').setDescriptionLocalizations(pt('Autor(a) do livro'))
    .setRequired(true).setMaxLength(200))
  .addAttachmentOption(o => o
    .setName('cover').setNameLocalizations(pt('capa'))
    .setDescription('Cover image (drag, upload or paste with Ctrl+V)')
    .setDescriptionLocalizations(pt('Imagem da capa (arraste, envie ou cole com Ctrl+V)')))
  .addStringOption(o => o
    .setName('cover_url').setNameLocalizations(pt('capa_url'))
    .setDescription('Or: link to a cover image')
    .setDescriptionLocalizations(pt('Ou: link de uma imagem da capa')));

// Accepts a role OR a person
const whoOption = o => o
  .setName('who').setNameLocalizations(pt('quem'))
  .setDescription('Role or person').setDescriptionLocalizations(pt('Cargo ou pessoa'))
  .setRequired(true);

const permission = new SlashCommandBuilder()
  .setName('book-permission').setNameLocalizations(pt('livro-permissao'))
  .setDescription('Choose which roles or people can close and reopen ratings')
  .setDescriptionLocalizations(pt('Define quais cargos ou pessoas podem encerrar e reabrir avaliações'))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild) // only server managers see it
  .addSubcommand(s => s
    .setName('add').setNameLocalizations(pt('adicionar'))
    .setDescription('Allow a role or person to close/reopen ratings')
    .setDescriptionLocalizations(pt('Permite que um cargo ou pessoa encerre/reabra avaliações'))
    .addMentionableOption(whoOption))
  .addSubcommand(s => s
    .setName('remove').setNameLocalizations(pt('remover'))
    .setDescription("Remove a role or person's permission")
    .setDescriptionLocalizations(pt('Tira a permissão de um cargo ou pessoa'))
    .addMentionableOption(whoOption))
  .addSubcommand(s => s
    .setName('view').setNameLocalizations(pt('ver'))
    .setDescription('Show who can close/reopen ratings')
    .setDescriptionLocalizations(pt('Mostra quem pode encerrar/reabrir avaliações')));

const rest = new REST().setToken(process.env.DISCORD_TOKEN);
const { CLIENT_ID, GUILD_ID } = process.env;

(async () => {
  try {
    const route = GUILD_ID
      ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
      : Routes.applicationCommands(CLIENT_ID);
    await rest.put(route, { body: [book.toJSON(), permission.toJSON()] });
    console.log(`Commands registered (${GUILD_ID ? 'this server only' : 'global'}): /book, /book-permission`);
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
})();
