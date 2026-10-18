<p align="center">
  <img src="book-rating-icon.png" alt="Book Rating Bot icon" width="120">
</p>

<h1 align="center">Book Rating Bot</h1>

<p align="center">
  Self-hosted Discord bot for rating books with ½ to 5 stars, all in a single message,<br>
  with role and user permissions to manage polls.
</p>

---

## Features

- **One message per book.** Every rating lives in a single message that updates itself. No confirmation messages, no chat spam.
- **Half-star ratings.** Members pick anything from ½ to 5 stars in a dropdown, each option shown with its own star icon.
- **Live summary.** The message shows the average as gold stars, the number of ratings and each member's rating.
- **Book covers.** Upload, drag or paste (Ctrl+V) a cover image, or use a link.
- **Change anytime.** Members can update or remove their rating while the poll is open.
- **Permission control.** The poll creator, server admins and any roles or people you choose can close and reopen polls.
- **English and Portuguese.** Commands appear in each member's Discord language, and private notices follow it too.
- **Self-hosted.** Runs on your own computer or server. Ratings are saved to a local file and survive restarts.

## Commands

| Command | What it does |
| --- | --- |
| `/book title author [cover] [cover_url]` | Starts a rating poll for a book. |
| `/book-permission add who:@RoleOrPerson` | Allows a role or person to close/reopen polls. |
| `/book-permission remove who:@RoleOrPerson` | Removes that permission. |
| `/book-permission view` | Shows who can close/reopen polls. |

`/book-permission` is only visible to members with **Manage Server** by default (you can change this in *Server Settings → Integrations*).

For members using Discord in Portuguese, the commands appear as `/livro` and `/livro-permissao`.

## How it works

1. Someone runs `/book` with the title, author and cover.
2. The bot posts one message with the cover, a **Rate this book** dropdown, and **Remove my rating** / **Close** buttons.
3. Members pick their rating. The message updates in place with the new average and the list of ratings.
4. When it's done, the creator (or anyone with permission) clicks **Close**. A closed poll can be reopened with **Reopen**.

Error notices (for example, "you don't have permission") are only visible to the person who clicked and never stay in the channel.

---

## Setup

### Requirements

- [Node.js](https://nodejs.org) 18 or newer (the LTS version is recommended)
- A Discord account with permission to add bots to your server

### 1. Create the bot on Discord

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application**.
2. In **General Information**, copy the **Application ID**. This is your `CLIENT_ID`.
3. In **Bot**, click **Reset Token** and copy the token. This is your `DISCORD_TOKEN`. **Never share it.**
4. *(Optional)* Upload `book-rating-icon.png` as the icon in **General Information → App Icon** and **Bot → Icon**.
5. In **OAuth2 → URL Generator**:
   - Scopes: `bot` and `applications.commands`
   - Bot permissions: `View Channels`, `Send Messages`, `Read Message History`, `Embed Links`, `Attach Files` and `Use External Emojis`
6. Open the generated URL and add the bot to your server.

### 2. Get your server ID

In Discord, go to **User Settings → Advanced** and turn on **Developer Mode**. Then right-click your server and choose **Copy Server ID**. This is your `GUILD_ID`.

### 3. Configure

```bash
git clone https://github.com/YOUR-USER/YOUR-REPO.git
cd YOUR-REPO
cp .env.example .env
```

On Windows, use `copy .env.example .env` instead of `cp`.

Open `.env` and fill in:

```env
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_application_id
GUILD_ID=your_server_id
```

### 4. Install and run

```bash
npm install
npm run deploy   # registers the slash commands
npm start        # starts the bot
```

When the terminal shows a line starting with `Bot online`, try `/book` in your server.

On the first start, the bot uploads its star emojis from the `assets/` folder automatically.

You only need to run `npm install` and `npm run deploy` again when the code or the commands change.

### Server-only vs. global commands

| `GUILD_ID` in `.env` | Commands are available | Best for |
| --- | --- | --- |
| Filled in | Only in that server, instantly | Testing, private use |
| Empty | In every server the bot joins (may take a few minutes) | Public bots |

Run `npm run deploy` again after changing it.

---

## Keeping it online

The bot only responds while it's running. When it's offline, existing polls stay in the channel but don't accept new ratings, and everything resumes when it starts again.

### On your computer

**Windows: one-click start**

Double-click `start-bot.bat` in the project folder. It installs the dependencies on the first run, registers the slash commands and starts the bot. Close the window to stop it.

To start the bot together with Windows:

1. Press **Win+R**, type `shell:startup` and press Enter.
2. Put a shortcut to `start-bot.bat` in that folder.

**macOS / Linux: run in the background with pm2**

```bash
npm install -g pm2
pm2 start index.js --name book-rating-bot
pm2 save
pm2 startup    # run the command it prints so the bot starts on boot
```

Useful commands: `pm2 logs book-rating-bot`, `pm2 restart book-rating-bot`, `pm2 stop book-rating-bot`.

If your computer goes to sleep, the bot goes offline. Turn off automatic sleep if you want it always available.

### On a server

Any host that runs Node.js works, for example a VPS, Railway or Fly.io. Make sure the `data/` folder is on persistent storage, or the ratings will be lost when the host restarts.

---

## Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `DISCORD_TOKEN` | Yes | The bot token from the Developer Portal. |
| `CLIENT_ID` | Yes | The application ID. |
| `GUILD_ID` | No | Server ID for server-only commands. Leave empty for global commands. |
| `DEBUG_TIMING` | No | Set to `0` to hide the response-time log lines in the terminal. |

## Data

Ratings and server settings are stored as JSON in the `data/` folder:

- `data/polls.json`: every poll and its ratings
- `data/config.json`: roles and people allowed to close polls, per server

Back up this folder if you move the bot to another machine. It's listed in `.gitignore` and should never be committed.

## Project structure

```
├── assets/               # Star images (star_*.png, rating_*.png), uploaded as the bot's emojis on first start
├── data/                 # Saved polls and settings (created automatically, not committed)
├── book-rating-icon.png  # Bot icon
├── start-bot.bat         # Windows: double-click to install, register commands and start
├── deploy-commands.js    # Registers the slash commands
├── index.js              # The bot
├── .env.example          # Template for your .env
└── package.json
```

## Troubleshooting

- **Commands don't show up.** Run `npm run deploy` and check that `CLIENT_ID` and `GUILD_ID` are correct. Global commands can take a few minutes to appear.
- **Stars show as ★☆ instead of gold icons.** The bot couldn't create its emojis. Check the terminal for the error message and make sure the `assets/` folder is in the project.
- **"This interaction failed".** The bot is offline or crashed. Check the terminal.
- **Slow responses.** Each click travels from Discord to your machine and back. The `[timing]` lines in the terminal show where the time goes. Times above one second usually mean a slow connection.

## Security

- Never commit your `.env` file. It's already in `.gitignore`.
- If your token is ever exposed, reset it right away in **Developer Portal → Bot → Reset Token** and update your `.env`.
