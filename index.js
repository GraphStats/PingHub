const { Client, GatewayIntentBits, EmbedBuilder, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, Collection } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions
    ]
});
const TARGET_GUILD_ID = 'YOUR-GUILD-ID';
const TARGET_CHANNEL_ID = 'CHANNEL-ID';
const ROLE_ID = 'ROLE-ID';
const EMBED_INTERVAL_MS = 120000;
const BONJOUR_INTERVAL_MS = 100;

const EXCLUDED_CHANNELS = ['CHANNEL-ID-1', 'CHANNEL-ID-2', 'CHANNEL-ID-3', 'CHANNEL-ID-4', 'CHANNEL-ID-5', 'CHANNEL-ID-6'];

let pingCounts = {
    second: 0,
    minute: 0,
    hour: 0
};
let pingTimestamps = [];
let embedInterval;
let bonjourInterval;
let statsMessageId = null;
let isUpdatingEmbed = false;

// File path for storing message IDs
const MESSAGES_FILE = path.join(__dirname, 'messages.json');

// Load message IDs from file
async function loadMessages() {
    try {
        const data = await fs.readFile(MESSAGES_FILE, 'utf8');
        const messages = JSON.parse(data);
        statsMessageId = messages.statsMessageId || null;
        console.log('✅ Messages loaded from file');
    } catch (error) {
        if (error.code === 'ENOENT') {
            await saveMessages();
            console.log('✅ Created new messages file');
        } else {
            console.error('❌ Error loading messages:', error);
        }
    }
}

async function saveMessages() {
    try {
        const data = JSON.stringify({
            statsMessageId: statsMessageId
        }, null, 2);
        await fs.writeFile(MESSAGES_FILE, data);
        console.log('✅ Messages saved to file');
    } catch (error) {
        console.error('❌ Error saving messages:', error);
    }
}

client.once('ready', async () => {
    console.log(`✅ Connected as ${client.user.tag}!`);
    console.log(`🆔 Bot ID: ${client.user.id}`);
    
    await loadMessages();
    
    const guild = client.guilds.cache.get(TARGET_GUILD_ID);
    if (!guild) {
        console.error('❌ Guild not found!');
        return;
    }
    console.log(`🏰 Guild found: ${guild.name}`);
    
    const targetChannel = guild.channels.cache.get(TARGET_CHANNEL_ID);
    if (!targetChannel) {
        console.error('❌ Target channel not found!');
        return;
    }
    console.log(`📁 Target channel found: ${targetChannel.name}`);
    
    if (!statsMessageId) {
        try {
            const messages = await targetChannel.messages.fetch({ limit: 50 });
            const statsMessage = messages.find(msg => 
                msg.author.id === client.user.id && 
                msg.embeds.length > 0 && 
                msg.embeds[0].title === '📊 Ping Statistics'
            );
            
            if (statsMessage) {
                statsMessageId = statsMessage.id;
                console.log(`📋 Stats message found: ${statsMessageId}`);
                await saveMessages();
            } else {
                console.log('📋 No stats message found, will create a new one...');
                await createInitialEmbed();
            }
        } catch (error) {
            console.error('❌ Error fetching messages:', error);
            await createInitialEmbed();
        }
    } else {
        try {
            await targetChannel.messages.fetch(statsMessageId);
            console.log('✅ Stats message verified');
        } catch (error) {
            console.log('❌ Stats message not found, creating new one...');
            statsMessageId = null;
            await createInitialEmbed();
        }
    }
    
    await sendRoleEmbed();
    
    startPingTracking();
    startEmbedSending();
    startBonjourSending();
    
    console.log('🚀 All functions started!');
});

// Function to create initial embed
async function createInitialEmbed() {
    try {
        const guild = client.guilds.cache.get(TARGET_GUILD_ID);
        if (!guild) return;

        const channel = guild.channels.cache.get(TARGET_CHANNEL_ID);
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('📊 Ping Statistics')
            .setDescription('Here is the number of pings sent:')
            .addFields(
                { name: '🕐 Per second', value: `≈ 0 pings/s`, inline: true },
                { name: '⏰ Per minute', value: `≈ 0 pings/min`, inline: true },
                { name: '⏳ Per hour', value: `≈ 0 pings/h`, inline: true },
                { name: '📈 Total', value: `0 pings (1h)`, inline: false }
            )
            .setTimestamp()
            .setFooter({ text: 'Statistics updated every minute' });

        const newMessage = await channel.send({ embeds: [embed] });
        statsMessageId = newMessage.id;
        await saveMessages();
        console.log('✅ Initial embed created successfully!');
    } catch (error) {
        console.error('❌ Error creating initial embed:', error);
    }
}

// Function to send the role assignment embed with buttons
async function sendRoleEmbed() {
    try {
        const guild = client.guilds.cache.get(TARGET_GUILD_ID);
        if (!guild) return;

        const channel = guild.channels.cache.get(TARGET_CHANNEL_ID);
        if (!channel) return;

        const messages = await channel.messages.fetch({ limit: 10 });
        const existingRoleEmbed = messages.find(msg => 
            msg.author.id === client.user.id && 
            msg.embeds.length > 0 && 
            msg.embeds[0].title === '🔔 Ping Role'
        );

        if (existingRoleEmbed) {
            console.log('✅ Role embed already exists, skipping...');
            return;
        }

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('get_ping_role')
                    .setLabel('Get Ping Role')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('remove_ping_role')
                    .setLabel('Remove Ping Role')
                    .setStyle(ButtonStyle.Danger)
            );

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('🔔 Ping Role')
            .setDescription('Click the buttons below to get or remove the ping role!')
            .setTimestamp();

        await channel.send({
            embeds: [embed],
            components: [row]
        });
        
        console.log('✅ Role assignment embed sent');
    } catch (error) {
        console.error('❌ Error sending role embed:', error);
    }
}

// Handle button interactions
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    
    try {
        const member = interaction.member;
        const role = interaction.guild.roles.cache.get(ROLE_ID);
        
        if (!role) {
            await interaction.reply({ content: '❌ The ping role does not exist!', ephemeral: true });
            return;
        }
        
        if (interaction.customId === 'get_ping_role') {
            if (member.roles.cache.has(ROLE_ID)) {
                await interaction.reply({ content: '❌ You already have the ping role!', ephemeral: true });
                return;
            }
            
            await member.roles.add(role);
            await interaction.reply({ content: '✅ You have been given the ping role!', ephemeral: true });
            
        } else if (interaction.customId === 'remove_ping_role') {
            if (!member.roles.cache.has(ROLE_ID)) {
                await interaction.reply({ content: '❌ You don\'t have the ping role!', ephemeral: true });
                return;
            }
            
            await member.roles.remove(role);
            await interaction.reply({ content: '✅ The ping role has been removed!', ephemeral: true });
        }
        
    } catch (error) {
        console.error('❌ Error handling role interaction:', error);
        await interaction.reply({ content: '❌ An error occurred while processing your request!', ephemeral: true });
    }
});

function startBonjourSending() {
    console.log('⏰ "Bonjour" program started (every 2 minutes)');
    
    sendBonjourToAllChannels();
    
    bonjourInterval = setInterval(sendBonjourToAllChannels, BONJOUR_INTERVAL_MS);
}

async function sendBonjourToAllChannels() {
    try {
        const guild = client.guilds.cache.get(TARGET_GUILD_ID);
        if (!guild) return;

        const channels = guild.channels.cache.filter(channel => 
            channel.type === ChannelType.GuildText &&
            channel.id !== TARGET_CHANNEL_ID &&
            !EXCLUDED_CHANNELS.includes(channel.id) &&
            channel.permissionsFor(guild.members.me).has('SendMessages')
        );

        const randomChannel = channels.random();
        
        if (randomChannel) {
            try {
                await randomChannel.send('<@&ROLE-ID>');
                pingTimestamps.push(Date.now());
                console.log(`✅ "@everyone" envoyé dans #${randomChannel.name}`);
            } catch (error) {
                console.error(`❌ Erreur dans #${randomChannel.name}: ${error.message}`);
            }
        }
        
    } catch (error) {
        console.error(`❌ Erreur générale: ${error.message}`);
    }
}

function startPingTracking() {
    console.log('📊 Ping tracking started');
    
    setInterval(() => {
        pingCounts.second = pingTimestamps.filter(ts => Date.now() - ts < 1000).length;
    }, 1000);
    
    setInterval(() => {
        pingCounts.minute = pingTimestamps.filter(ts => Date.now() - ts < 60000).length;
    }, 1000);
    
    setInterval(() => {
        pingCounts.hour = pingTimestamps.filter(ts => Date.now() - ts < 3600000).length;
        pingTimestamps = pingTimestamps.filter(ts => Date.now() - ts < 3600000);
    }, 3600000);
}

function startEmbedSending() {
    console.log('📨 Embed sending program started (every 5 minutes)');
    
    embedInterval = setInterval(sendEmbed, EMBED_INTERVAL_MS);
}

async function sendEmbed() {
    if (isUpdatingEmbed) {
        console.log('⏳ Embed update already in progress, skipping...');
        return;
    }
    
    isUpdatingEmbed = true;
    
    try {
        console.log('🔄 Attempting to update embed...');
        
        const guild = client.guilds.cache.get(TARGET_GUILD_ID);
        if (!guild) {
            console.error('❌ Guild not found for embed');
            return;
        }

        const channel = guild.channels.cache.get(TARGET_CHANNEL_ID);
        if (!channel) {
            console.error('❌ Channel not found for embed');
            return;
        }

        console.log('✅ All checks OK');
        
        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('📊 Ping Statistics')
            .setDescription('Here is the number of pings sent:')
            .addFields(
                { name: '🕐 Per second', value: `≈ ${pingCounts.second} pings/s`, inline: true },
                { name: '⏰ Per minute', value: `≈ ${pingCounts.minute} pings/min`, inline: true },
                { name: '⏳ Per hour', value: `≈ ${pingCounts.hour} pings/h`, inline: true },
                { name: '📈 Total', value: `${pingTimestamps.length} pings (1h)`, inline: false }
            )
            .setTimestamp()
            .setFooter({ text: 'Statistics updated every minute' });

        console.log('📋 Embed created, updating...');
        
        if (statsMessageId) {
            try {
                const message = await channel.messages.fetch(statsMessageId);
                await message.edit({ embeds: [embed] });
                console.log('✅ Embed updated successfully!');
                return;
            } catch (error) {
                console.log('❌ Cannot edit message, creating a new one...');
                statsMessageId = null;
            }
        }
        
        const newMessage = await channel.send({ embeds: [embed] });
        statsMessageId = newMessage.id;
        await saveMessages();
        console.log('✅ New embed sent successfully!');
        
    } catch (error) {
        console.error(`❌ Error updating embed:`, error);
    } finally {
        isUpdatingEmbed = false;
    }
}

// Gestion propre de l'arrêt
process.on('SIGINT', async () => {
    console.log('🛑 Shutting down gracefully...');
    if (embedInterval) clearInterval(embedInterval);
    if (bonjourInterval) clearInterval(bonjourInterval);
    await saveMessages();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('🛑 Shutting down gracefully...');
    if (embedInterval) clearInterval(embedInterval);
    if (bonjourInterval) clearInterval(bonjourInterval);
    await saveMessages();
    process.exit(0);
});

// Error handling
client.on('error', (error) => {
    console.error('❌ Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled rejection:', error);
});

// Connect the bot
console.log('🔗 Connecting bot...');
client.login('YOUR-TOKEN').catch(error => {
    console.error('❌ Connection error:', error);
});
