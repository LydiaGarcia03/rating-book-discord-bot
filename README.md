# 📖 Livro Bot

Bot de Discord para avaliar livros com notas de **½ a 5 estrelas**. Cada avaliação é **uma única mensagem** que se atualiza sozinha: nada de mensagens de confirmação no canal.

## Como funciona

- `/livro titulo:... autor:... capa:(imagem)` abre a avaliação.
  - A capa pode ser enviada como arquivo, arrastada ou colada com Ctrl+V no campo `capa`.
  - Alternativa: `capa_url:` com o link de uma imagem.
- No menu **⭐ Dar minha nota**, cada pessoa escolhe de ½ a 5 estrelas. A mensagem atualiza a média e a lista de notas na hora.
- Dá para mudar a nota a qualquer momento, ou clicar em **Remover minha nota**.
- **Encerrar** / **Reabrir**: só quem criou a avaliação ou quem tem permissão de *Gerenciar mensagens*.
- Avisos de erro (ex.: "só o criador pode encerrar") aparecem só para quem clicou e não ficam no canal.

## Instalação (uma vez)

### 1. Criar o bot no Discord
1. Acesse https://discord.com/developers/applications → **New Application**.
2. Em **General Information**, copie o **Application ID** (é o `CLIENT_ID`).
3. Em **Bot** → **Reset Token**, copie o token (é o `DISCORD_TOKEN`). Não compartilhe.
4. Em **OAuth2 → URL Generator**, marque os escopos `bot` e `applications.commands`, e as permissões
   `View Channels`, `Send Messages`, `Embed Links` e `Attach Files`. Abra a URL gerada e adicione o bot ao seu servidor.

### 2. Pegar o ID do servidor
No Discord: Configurações → Avançado → ative o **Modo desenvolvedor**. Clique com o botão direito no servidor → **Copiar ID do servidor** (é o `GUILD_ID`).

### 3. Rodar
Precisa do [Node.js](https://nodejs.org) 18 ou mais novo.

```bash
cp .env.example .env      # e preencha os 3 valores
npm install
npm run deploy            # registra o comando /livro no servidor
npm start                 # liga o bot
```

O bot só responde enquanto o `npm start` estiver rodando. Para ficar online 24h, hospede em um serviço como Railway, Fly.io, um VPS, ou um computador/Raspberry Pi que fique ligado.

## Dados
As notas ficam salvas em `data/polls.json`, então sobrevivem a reinícios do bot. Se for hospedar, garanta que essa pasta seja persistente.
