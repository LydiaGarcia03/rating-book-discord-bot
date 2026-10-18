require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  Client, GatewayIntentBits, Events, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, AttachmentBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  MessageFlags, PermissionFlagsBits,
} = require('discord.js');

// ---------- Textos (pt = português, en = inglês) ----------
const TXT = {
  pt: {
    locale: 'pt-BR',
    por: autor => `por **${autor}**`,
    avaliacoes: n => (n === 1 ? '1 avaliação' : `${n} avaliações`),
    ninguem: 'Ninguém avaliou ainda.',
    notas: 'Notas',
    outras: n => `+${n} outras`,
    rodapeAberta: 'Escolha sua nota no menu abaixo — você pode mudar quando quiser',
    rodapeFechada: '🔒 Avaliação encerrada',
    placeholder: 'Dar minha nota',
    opcao: (n, f) => (n === 0.5 ? '½ estrela' : `${f} ${n === 1 ? 'estrela' : 'estrelas'}`),
    remover: 'Remover minha nota',
    encerrar: 'Encerrar',
    reabrir: 'Reabrir',
    // avisos privados
    capaNaoImagem: 'A capa precisa ser uma imagem (PNG, JPG, WEBP ou GIF).',
    capaUrlInvalida: 'O link da capa precisa começar com http:// ou https://',
    naoEncontrada: 'Não encontrei essa avaliação (ela pode ter sido criada por outra versão do bot).',
    jaEncerrada: 'Essa avaliação já foi encerrada.',
    semPermissao: 'Você não tem permissão para encerrar ou reabrir esta avaliação.',
    erro: 'Algo deu errado. Tente de novo.',
    painelAntigo: 'Agora a nota é dada direto no menu da mensagem da avaliação. 🙂',
    permTitulo: '**Quem pode encerrar e reabrir avaliações:**',
    permCriador: 'Quem criou a avaliação',
    permAdmins: 'Administradores do servidor',
    permCargos: lista => `Cargos: ${lista}`,
    permNenhum: '_nenhum cargo extra_',
    permPessoas: lista => `Pessoas: ${lista}`,
    permNinguem: '_nenhuma pessoa extra_',
  },
  en: {
    locale: 'en-US',
    por: autor => `by **${autor}**`,
    avaliacoes: n => (n === 1 ? '1 rating' : `${n} ratings`),
    ninguem: 'No ratings yet.',
    notas: 'Ratings',
    outras: n => `+${n} more`,
    rodapeAberta: 'Pick your rating from the menu below — you can change it anytime',
    rodapeFechada: '🔒 Rating closed',
    placeholder: 'Rate this book',
    opcao: (n, f) => (n === 0.5 ? '½ star' : `${f} ${n === 1 ? 'star' : 'stars'}`),
    remover: 'Remove my rating',
    encerrar: 'Close',
    reabrir: 'Reopen',
    capaNaoImagem: 'The cover must be an image (PNG, JPG, WEBP or GIF).',
    capaUrlInvalida: 'The cover link must start with http:// or https://',
    naoEncontrada: "I couldn't find this rating (it may have been created by another version of the bot).",
    jaEncerrada: 'This rating has already been closed.',
    semPermissao: "You don't have permission to close or reopen this rating.",
    erro: 'Something went wrong. Please try again.',
    painelAntigo: 'Ratings are now given straight from the menu on the rating message. 🙂',
    permTitulo: '**Who can close and reopen ratings:**',
    permCriador: 'Whoever created the rating',
    permAdmins: 'Server administrators',
    permCargos: lista => `Roles: ${lista}`,
    permNenhum: '_no extra roles_',
    permPessoas: lista => `People: ${lista}`,
    permNinguem: '_no extra people_',
  },
};

// Idioma de quem clicou (para mensagens privadas): segue o idioma do Discord da pessoa
const idiomaUsuario = interaction => (interaction.locale?.startsWith('pt') ? 'pt' : 'en');
// As mensagens de avaliação no canal são sempre em inglês (avaliações antigas continuam em português)
const IDIOMA_PADRAO = 'en';

// ---------- Armazenamento (arquivos JSON simples) ----------
const DATA_DIR = path.join(__dirname, 'data');
const POLLS_FILE = path.join(DATA_DIR, 'polls.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
let polls = {};
let config = {}; // { [guildId]: { cargos: [roleId], pessoas: [userId] } }

function ler(arquivo) {
  try { return JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch { return {}; }
}
function gravar(arquivo, dados) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = arquivo + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(dados));
  fs.renameSync(tmp, arquivo);
}
// As notas são gravadas em disco logo depois de responder ao Discord, juntando vários cliques
// numa gravação só — assim o disco nunca atrasa a resposta.
let gravacaoPendente = null;
function salvar() {
  if (gravacaoPendente) return;
  gravacaoPendente = setTimeout(() => {
    gravacaoPendente = null;
    try { gravar(POLLS_FILE, polls); } catch (err) { console.error('Erro ao salvar notas:', err.message); }
  }, 300);
}
function salvarAgora() {
  if (gravacaoPendente) { clearTimeout(gravacaoPendente); gravacaoPendente = null; }
  gravar(POLLS_FILE, polls);
}
const salvarConfig = () => gravar(CONFIG_FILE, config);

// Garante que nada se perde ao fechar o bot (Ctrl+C, fechar janela, pm2 stop)
for (const sinal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sinal, () => { try { salvarAgora(); } finally { process.exit(0); } });
}

// Mostra no terminal quanto tempo cada clique levou (DEBUG_TEMPO=0 no .env desliga)
const MEDIR = process.env.DEBUG_TEMPO !== '0';
function medir(interaction, inicio) {
  if (!MEDIR) return;
  const chegada = inicio - interaction.createdTimestamp;
  const resposta = Date.now() - inicio;
  console.log(`[tempo] clique→bot: ${chegada}ms | bot→Discord: ${resposta}ms | ping: ${interaction.client.ws.ping}ms`);
}

// Cliques que ainda estão sendo processados, por pessoa e avaliação
const emAndamento = new Set();

// ---------- Emojis de estrela ----------
// O bot sobe sozinho as imagens da pasta assets/ como emojis próprios dele (só na 1ª vez).
const EMOJI_NOMES = {
  cheia: 'livro_estrela_cheia',
  meia: 'livro_estrela_meia',
  vazia: 'livro_estrela_vazia',
};
// Um emoji por nota para o dropdown (5 estrelas em 2 fileiras): nota05 = ½, nota35 = 3,5 ...
const chaveNota = n => `nota${String(n * 10).padStart(2, '0')}`;
for (let k = 1; k <= 10; k++) {
  const n = k / 2;
  EMOJI_NOMES[chaveNota(n)] = `livro_nota_${String(n * 10).padStart(2, '0')}`;
}
const EMOJI = {};
const TEXTO = { cheia: '★', meia: '½', vazia: '☆' }; // reserva, se os emojis falharem

async function prepararEmojis(client) {
  try {
    const existentes = await client.application.emojis.fetch();
    for (const [chave, nome] of Object.entries(EMOJI_NOMES)) {
      let emoji = existentes.find(e => e.name === nome);
      if (!emoji) {
        emoji = await client.application.emojis.create({
          attachment: path.join(__dirname, 'assets', `${nome}.png`),
          name: nome,
        });
        console.log(`Emoji ${nome} criado.`);
      }
      EMOJI[chave] = emoji;
    }
  } catch (err) {
    console.warn('Não consegui preparar os emojis de estrela; usando ★ simples.', err.message);
  }
}

// ---------- Visual ----------
function partes(n) {
  const r = Math.round(n * 2) / 2;               // arredonda para o ½ mais próximo
  const cheias = Math.floor(r);
  const meia = r - cheias === 0.5;
  return [
    ...Array(cheias).fill('cheia'),
    ...(meia ? ['meia'] : []),
    ...Array(5 - cheias - (meia ? 1 : 0)).fill('vazia'),
  ];
}
const estrelas = n => partes(n).map(k => (EMOJI[k] ? EMOJI[k].toString() : TEXTO[k])).join('');
const fmt = (n, t) => n.toLocaleString(t.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtCurto = (n, t) => n.toLocaleString(t.locale, { maximumFractionDigits: 1 }); // 4 / 4,5
const NOTAS = [5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5];

function mediaDe(poll) {
  const v = Object.values(poll.notas);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

function montarEmbed(poll, t) {
  const total = Object.keys(poll.notas).length;
  const media = mediaDe(poll);

  let desc = `${t.por(poll.autor)}\n`;
  desc += total
    ? `## ${estrelas(media)}\n**${fmt(media, t)} / 5**  ·  ${t.avaliacoes(total)}`
    : `## ${estrelas(0)}\n_${t.ninguem}_`;

  if (total) {
    desc += `\n\n**${t.notas}**\n`;
    const linhas = Object.entries(poll.notas)
      .sort((a, b) => b[1] - a[1])
      .map(([uid, nota]) => `${estrelas(nota)}  ${fmt(nota, t)} — <@${uid}>`);
    let mostrados = 0;
    for (const l of linhas) {
      if ((desc + l + '\n').length > 3900) break;
      desc += l + '\n';
      mostrados++;
    }
    if (mostrados < linhas.length) desc += `_${t.outras(linhas.length - mostrados)}_`;
  }

  const embed = new EmbedBuilder()
    .setColor(poll.fechada ? 0x808080 : 0xf5b301)
    .setTitle(`📖 ${poll.titulo}`)
    .setDescription(desc)
    .setFooter({ text: poll.fechada ? t.rodapeFechada : t.rodapeAberta });

  if (poll.capaArquivo) embed.setImage(`attachment://${poll.capaArquivo}`);
  else if (poll.capaUrl) embed.setImage(poll.capaUrl);
  return embed;
}

function montarComponentes(poll, t) {
  if (poll.fechada) {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('reabrir').setLabel(t.reabrir).setStyle(ButtonStyle.Secondary),
    )];
  }

  // Dropdown com as 10 notas, de 5 até ½, cada uma com o ícone de 5 estrelas
  const menu = new StringSelectMenuBuilder()
    .setCustomId('nota')
    .setPlaceholder(t.placeholder)
    .addOptions(NOTAS.map(n => {
      const opcao = new StringSelectMenuOptionBuilder()
        .setValue(String(n))
        .setLabel(t.opcao(n, fmtCurto(n, t)));
      const chave = EMOJI[chaveNota(n)] ? chaveNota(n) : (Number.isInteger(n) ? 'cheia' : 'meia');
      if (EMOJI[chave]) opcao.setEmoji({ id: EMOJI[chave].id, name: EMOJI[chave].name });
      return opcao;
    }));
  return [
    new ActionRowBuilder().addComponents(menu),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('remover').setLabel(t.remover).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('encerrar').setLabel(t.encerrar).setStyle(ButtonStyle.Danger),
    ),
  ];
}

// Cada avaliação guarda o idioma em que foi criada (avaliações sem idioma salvo: português)
function render(poll) {
  const t = TXT[poll.idioma] || TXT.pt;
  return { embeds: [montarEmbed(poll, t)], components: montarComponentes(poll, t) };
}

// Respostas efêmeras: só quem clicou vê, e somem — não poluem o canal
const aviso = (interaction, chave) =>
  interaction.reply({ content: TXT[idiomaUsuario(interaction)][chave], flags: MessageFlags.Ephemeral });

// ---------- Permissões de encerrar / reabrir ----------
function cargosDoMembro(member) {
  const roles = member?.roles;
  if (Array.isArray(roles)) return roles;            // membro "cru" vindo da interação
  if (roles?.cache) return [...roles.cache.keys()];  // membro completo
  return [];
}

function podeGerenciar(interaction, poll) {
  if (interaction.user.id === poll.criador) return true;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  const g = config[interaction.guildId] || {};
  if ((g.pessoas || []).includes(interaction.user.id)) return true;
  const cargos = g.cargos || [];
  return cargosDoMembro(interaction.member).some(id => cargos.includes(id));
}

async function comandoPermissao(interaction) {
  const t = TXT[idiomaUsuario(interaction)];
  const sub = interaction.options.getSubcommand();
  const g = (config[interaction.guildId] ||= {});
  g.cargos ||= [];
  g.pessoas ||= [];

  if (sub === 'add' || sub === 'remove') {
    // O campo "quem" aceita um cargo ou uma pessoa
    const opcao = interaction.options.get('who', true);
    const lista = opcao.role ? 'cargos' : 'pessoas';
    const id = opcao.role ? opcao.role.id : opcao.user.id;
    if (sub === 'add') {
      if (!g[lista].includes(id)) g[lista].push(id);
    } else {
      g[lista] = g[lista].filter(x => x !== id);
    }
    salvarConfig();
  }

  const cargos = g.cargos.length ? g.cargos.map(id => `<@&${id}>`).join(', ') : t.permNenhum;
  const pessoas = g.pessoas.length ? g.pessoas.map(id => `<@${id}>`).join(', ') : t.permNinguem;
  return interaction.reply({
    content:
      `${t.permTitulo}\n• ${t.permCriador}\n• ${t.permAdmins}\n` +
      `• ${t.permCargos(cargos)}\n• ${t.permPessoas(pessoas)}`,
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

// ---------- Bot ----------
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async c => {
  polls = ler(POLLS_FILE);
  config = ler(CONFIG_FILE);
  await prepararEmojis(c);
  console.log(`Bot online como ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'book-permission') {
      return comandoPermissao(interaction);
    }

    // /book — cria a avaliação (esta é a única mensagem que aparece no canal)
    if (interaction.isChatInputCommand() && interaction.commandName === 'book') {
      const titulo = interaction.options.getString('title');
      const autor = interaction.options.getString('author');
      const anexo = interaction.options.getAttachment('cover');
      const capaUrl = interaction.options.getString('cover_url');

      if (anexo && !anexo.contentType?.startsWith('image/')) return aviso(interaction, 'capaNaoImagem');
      if (!anexo && capaUrl && !/^https?:\/\/\S+$/i.test(capaUrl)) return aviso(interaction, 'capaUrlInvalida');

      await interaction.deferReply();

      const poll = {
        titulo, autor,
        idioma: IDIOMA_PADRAO,
        criador: interaction.user.id,
        fechada: false,
        notas: {},
        capaArquivo: null,
        capaUrl: null,
      };
      const files = [];

      if (anexo) {
        // Reenvia a imagem junto da mensagem para o link da capa não expirar
        const resp = await fetch(anexo.url);
        const buffer = Buffer.from(await resp.arrayBuffer());
        const ext = (anexo.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
        poll.capaArquivo = `capa.${ext}`;
        files.push(new AttachmentBuilder(buffer, { name: poll.capaArquivo }));
      } else if (capaUrl) {
        poll.capaUrl = capaUrl;
      }

      const msg = await interaction.editReply({ ...render(poll), files });
      polls[msg.id] = poll;
      salvar();
      return;
    }

    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
    const uid = interaction.user.id;
    const partesId = interaction.customId.split(':');

    // Painéis efêmeros de versões anteriores
    if ((partesId[0] === 'estrela' && partesId.length === 3) || partesId[0] === 'limpar') {
      return interaction.update({ content: TXT[idiomaUsuario(interaction)].painelAntigo, components: [] });
    }

    const poll = polls[interaction.message.id];
    if (!poll) return aviso(interaction, 'naoEncontrada');

    // Nota escolhida no dropdown: salva e atualiza a própria mensagem (nenhuma mensagem nova)
    if (interaction.customId === 'nota') {
      if (poll.fechada) return aviso(interaction, 'jaEncerrada');
      const chave = `${interaction.message.id}:${uid}`;
      if (emAndamento.has(chave)) return interaction.deferUpdate().catch(() => {});
      emAndamento.add(chave);

      const inicio = Date.now();
      try {
        poll.notas[uid] = parseFloat(interaction.values[0]);
        await interaction.update(render(poll));
        medir(interaction, inicio);
        salvar();
      } finally {
        emAndamento.delete(chave);
      }
      return;
    }

    // Botões de estrela de versões anteriores: só troca a mensagem para o dropdown
    if (partesId[0] === 'estrela' || interaction.customId === 'avaliar') {
      return interaction.update(render(poll));
    }

    if (interaction.customId === 'remover') {
      if (!(uid in poll.notas)) return interaction.deferUpdate();
      delete poll.notas[uid];
      salvar();
      return interaction.update(render(poll));
    }

    if (interaction.customId === 'encerrar' || interaction.customId === 'reabrir') {
      if (!podeGerenciar(interaction, poll)) return aviso(interaction, 'semPermissao');
      poll.fechada = interaction.customId === 'encerrar';
      salvar();
      return interaction.update(render(poll));
    }
  } catch (err) {
    console.error(err);
    const msg = { content: TXT[idiomaUsuario(interaction)].erro, flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) interaction.followUp(msg).catch(() => {});
    else interaction.reply(msg).catch(() => {});
  }
});

client.login(process.env.DISCORD_TOKEN);
