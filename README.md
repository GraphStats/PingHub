## **Lines You Must Update**

1. **Bot Token** – at the bottom of your file:

```js
client.login('YOUR-BOT-TOKEN');
```

✅ Replace `'YOUR-BOT-TOKEN'` with your actual bot token from the Discord Developer Portal.

---

2. **Target Guild ID** – line near the top:

```js
const TARGET_GUILD_ID = 'GUILD-ID';
```

✅ Replace `'GUILD-ID'` with the ID of your Discord server (right-click the server → Copy ID).

---

3. **Target Channel ID** – where the bot sends embeds and role messages:

```js
const TARGET_CHANNEL_ID = 'CHANNEL-ID';
```

✅ Replace `'CHANNEL-ID'` with the channel ID for your stats/embed messages.

---

4. **Role ID** – the role your bot will assign/ping:

```js
const ROLE_ID = 'ROLE-ID';
```

✅ Replace `'ROLE-ID'` with the ID of the ping role.

---

5. **Excluded Channels** – optional, channels the bot should not ping:

```js
const EXCLUDED_CHANNELS = ['CHANNEL-ID', 'CHANNEL-ID'];
```

✅ Replace these with the IDs of any channels where the bot shouldn’t send pings.

---

6. **Inside `sendPingToAllChannels()`** – replace placeholder role ping:

```js
await randomChannel.send('<@&ROLE-ID>');
```

✅ Replace `'ROLE-ID'` with the same role ID you want to ping.

---

7. **Embed & Interval Settings** (optional tweak):

```js
const EMBED_INTERVAL_MS = 5000;
const PING_INTERVAL_MS = 70;
```

✅ Adjust these if you want faster/slower updates.

---

💡 **Tips:**

* Make sure your **bot has proper permissions** (Send Messages, Manage Roles).
* Never share your **bot token** publicly.
* Restart the bot after updating any IDs.
