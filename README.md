## Please Read The [Discord TOS](https://discord.com/terms) before using this bot

## **Lines You Must Update**

1. **Bot Token** – at the bottom of your file:

```js
client.login('YOUR-BOT-TOKEN');
```

✅ Replace `'YOUR-BOT-TOKEN'` with your actual bot token from the Discord Developer Portal.

---

2. **Embed & Interval Settings** (optional tweak):

```js
const EMBED_INTERVAL_MS = 5000;
const PING_INTERVAL_MS = 100;
```

✅ Adjust these if you want faster/slower updates.

---

💡 **Tips:**

* Make sure your **bot has proper permissions** (Send Messages, Manage Roles).
* Never share your **bot token** publicly.
* Restart the bot after updating any IDs.
