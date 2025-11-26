const { Client, GatewayIntentBits, EmbedBuilder, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, Collection, SlashCommandBuilder, REST, Routes } = require('discord.js');
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

const EMBED_INTERVAL_MS = 300000;
const PING_INTERVAL_MS = 200;

const SERVER_DATA_FILE = path.join(__dirname, 'serverData.json');
const MESSAGES_FILE = path.join(__dirname, 'messages.json');

let serverData = {};
let pingCounts = {};
let pingTimestamps = {};
let embedIntervals = {};
let pingIntervals = {};
let isUpdatingEmbed = {};

// Bot token
const BOT_TOKEN = 'YOUR-TOKEN';

// Load server data from file
async function loadServerData() {
    try {
        const data = await fs.readFile(SERVER_DATA_FILE, 'utf8');
        serverData = JSON.parse(data);
        console.log('✅ Server data loaded from file');
        
        // Initialize tracking for each server
        for (const guildId in serverData) {
            if (!pingCounts[guildId]) pingCounts[guildId] = { second: 0, minute: 0, hour: 0 };
            if (!pingTimestamps[guildId]) pingTimestamps[guildId] = [];
            if (!isUpdatingEmbed[guildId]) isUpdatingEmbed[guildId] = false;
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            // File doesn't exist, create it
            serverData = {};
            await saveServerData();
            console.log('✅ Created new server data file');
        } else {
            console.error('❌ Error loading server data:', error);
        }
    }
}

async function saveServerData() {
    try {
        const data = JSON.stringify(serverData, null, 2);
        await fs.writeFile(SERVER_DATA_FILE, data);
        console.log('✅ Server data saved to file');
    } catch (error) {
        console.error('❌ Error saving server data:', error);
    }
}

function initServerData(guildId) {
    if (!serverData[guildId]) {
        serverData[guildId] = {
            targetChannelId: null,
            pingRoleId: null,
            excludedChannels: [],
            statsMessageId: null,
            pingedEmbed: {
                title: '🔔 Ping Role',
                description: 'Click the buttons below to get or remove the ping role!',
                color: 0x0099FF
            },
            statsEmbed: {
                title: '📊 Ping Statistics',
                description: 'Here is the number of pings sent:',
                color: 0x0099FF
            }
        };
        
        pingCounts[guildId] = { second: 0, minute: 0, hour: 0 };
        pingTimestamps[guildId] = [];
        isUpdatingEmbed[guildId] = false;
    }
}

const commands = [
    new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Configure the basic settings for the bot')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel where stats will be displayed')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role that will be pinged')
                .setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('exclude_channels')
        .setDescription('Add or remove channels from the exclusion list')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to add/remove from exclusion list')
                .setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('set_pinged_embed')
        .setDescription('Customize the ping role assignment embed')
        .addStringOption(option =>
            option.setName('title')
                .setDescription('Embed title')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('description')
                .setDescription('Embed description')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('color')
                .setDescription('Embed color (hex code without #)')
                .setRequired(false)),
    
    new SlashCommandBuilder()
        .setName('status')
        .setDescription('Show current bot configuration'),
    
    new SlashCommandBuilder()
        .setName('start')
        .setDescription('Start the ping system'),
    
    new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop the ping system')
].map(command => command.toJSON());

// Register commands
async function registerCommands() {
    try {
        const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
        
        console.log('🔄 Registering slash commands...');
        
        const data = await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        
        console.log(`✅ Successfully registered ${data.length} slash commands globally`);
    } catch (error) {
        console.error('❌ Error registering commands:', error);
    }
}

client.once('ready', async () => {
    console.log(`✅ Connected as ${client.user.tag}!`);
    console.log(`🆔 Bot ID: ${client.user.id}`);
    
    // Load server data
    await loadServerData();
    
    // Register slash commands
    await registerCommands();
    
    // Initialize systems for each guild the bot is in
    client.guilds.cache.forEach(guild => {
        initServerData(guild.id);
        startSystems(guild.id);
    });
    
    console.log('🚀 All systems initialized!');
});

// Start systems for a specific guild
function startSystems(guildId) {
    const guildData = serverData[guildId];
    if (!guildData || !guildData.targetChannelId || !guildData.pingRoleId) {
        console.log(`⏸️  Systems not started for guild ${guildId} - missing configuration`);
        return;
    }
    
    // Start ping tracking
    startPingTracking(guildId);
    
    // Start ping sending
    startPingSending(guildId);
    
    // Send role embed
    sendRoleEmbed(guildId);
    
    console.log(`🚀 Systems started for guild ${guildId}`);
}

// Stop systems for a specific guild
function stopSystems(guildId) {
    if (embedIntervals[guildId]) {
        clearInterval(embedIntervals[guildId]);
        delete embedIntervals[guildId];
    }
    
    if (pingIntervals[guildId]) {
        clearInterval(pingIntervals[guildId]);
        delete pingIntervals[guildId];
    }
    
    console.log(`🛑 Systems stopped for guild ${guildId}`);
}

// Handle slash commands
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    
    const { commandName, guild, options } = interaction;
    const guildId = guild.id;
    
    // Initialize server data if needed
    initServerData(guildId);
    
    try {
        switch (commandName) {
            case 'setup':
                const channel = options.getChannel('channel');
                const role = options.getRole('role');
                
                serverData[guildId].targetChannelId = channel.id;
                serverData[guildId].pingRoleId = role.id;
                
                await saveServerData();
                
                // Stop existing systems and restart with new config
                stopSystems(guildId);
                startSystems(guildId);
                
                await interaction.reply({ 
                    content: `✅ Configuration updated!\n📊 Stats channel: ${channel}\n🔔 Ping role: ${role}`,
                    ephemeral: true 
                });
                break;
                
            case 'exclude_channels':
                const targetChannel = options.getChannel('channel');
                const excludedChannels = serverData[guildId].excludedChannels || [];
                
                if (excludedChannels.includes(targetChannel.id)) {
                    // Remove from exclusion list
                    serverData[guildId].excludedChannels = excludedChannels.filter(id => id !== targetChannel.id);
                    await saveServerData();
                    await interaction.reply({ 
                        content: `✅ Channel ${targetChannel} removed from exclusion list`,
                        ephemeral: true 
                    });
                } else {
                    // Add to exclusion list
                    serverData[guildId].excludedChannels.push(targetChannel.id);
                    await saveServerData();
                    await interaction.reply({ 
                        content: `✅ Channel ${targetChannel} added to exclusion list`,
                        ephemeral: true 
                    });
                }
                break;
                
            case 'set_pinged_embed':
                const pingedTitle = options.getString('title');
                const pingedDescription = options.getString('description');
                const pingedColor = options.getString('color');
                
                if (pingedTitle) serverData[guildId].pingedEmbed.title = pingedTitle;
                if (pingedDescription) serverData[guildId].pingedEmbed.description = pingedDescription;
                if (pingedColor) serverData[guildId].pingedEmbed.color = parseInt(pingedColor, 16);
                
                await saveServerData();
                
                // Update the existing embed
                await sendRoleEmbed(guildId);
                
                await interaction.reply({ 
                    content: '✅ Ping role embed updated!',
                    ephemeral: true 
                });
                break;
                
            case 'status':
                const config = serverData[guildId];
                const statusEmbed = new EmbedBuilder()
                    .setTitle('🤖 Bot Configuration')
                    .setColor(0x00FF00)
                    .addFields(
                        { name: '📊 Stats Channel', value: config.targetChannelId ? `<#${config.targetChannelId}>` : 'Not set', inline: true },
                        { name: '🔔 Ping Role', value: config.pingRoleId ? `<@&${config.pingRoleId}>` : 'Not set', inline: true },
                        { name: '🚫 Excluded Channels', value: config.excludedChannels.length > 0 ? config.excludedChannels.map(id => `<#${id}>`).join(', ') : 'None', inline: false },
                        { name: '📈 Systems Status', value: pingIntervals[guildId] ? '🟢 Running' : '🔴 Stopped', inline: true }
                    )
                    .setTimestamp();
                
                await interaction.reply({ embeds: [statusEmbed], ephemeral: true });
                break;
                
            case 'start':
                startSystems(guildId);
                await interaction.reply({ 
                    content: '✅ Ping system started!',
                    ephemeral: true 
                });
                break;
                
            case 'stop':
                stopSystems(guildId);
                await interaction.reply({ 
                    content: '🛑 Ping system stopped!',
                    ephemeral: true 
                });
                break;
        }
    } catch (error) {
        console.error(`❌ Error handling command ${commandName}:`, error);
        await interaction.reply({ 
            content: '❌ An error occurred while processing your command!',
            ephemeral: true 
        });
    }
});

// Handle button interactions for role assignment
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    
    try {
        const { guild, member, customId } = interaction;
        const guildId = guild.id;
        const guildData = serverData[guildId];
        
        if (!guildData || !guildData.pingRoleId) {
            await interaction.reply({ content: '❌ The ping role is not configured!', ephemeral: true });
            return;
        }
        
        const role = guild.roles.cache.get(guildData.pingRoleId);
        
        if (!role) {
            await interaction.reply({ content: '❌ The ping role does not exist!', ephemeral: true });
            return;
        }
        
        if (customId === 'get_ping_role') {
            if (member.roles.cache.has(guildData.pingRoleId)) {
                await interaction.reply({ content: '❌ You already have the ping role!', ephemeral: true });
                return;
            }
            
            await member.roles.add(role);
            await interaction.reply({ content: '✅ You have been given the ping role!', ephemeral: true });
            
        } else if (customId === 'remove_ping_role') {
            if (!member.roles.cache.has(guildData.pingRoleId)) {
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

// Function to send role assignment embed
async function sendRoleEmbed(guildId) {
    try {
        const guildData = serverData[guildId];
        if (!guildData || !guildData.targetChannelId) return;

        const guild = client.guilds.cache.get(guildId);
        if (!guild) return;

        const channel = guild.channels.cache.get(guildData.targetChannelId);
        if (!channel) return;

        // Create buttons
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

        // Create embed from configuration
        const embed = new EmbedBuilder()
            .setColor(guildData.pingedEmbed.color)
            .setTitle(guildData.pingedEmbed.title)
            .setDescription(guildData.pingedEmbed.description)
            .setTimestamp();

        // Send the embed with buttons
        await channel.send({
            embeds: [embed],
            components: [row]
        });
        
        console.log(`✅ Role assignment embed sent for guild ${guildId}`);
    } catch (error) {
        console.error(`❌ Error sending role embed for guild ${guildId}:`, error);
    }
}

function startPingSending(guildId) {
    console.log(`⏰ Ping program started for guild ${guildId} (every 2 minutes)`);
    
    // Send immediately
    sendPingToAllChannels(guildId);
    
    // Then set interval
    pingIntervals[guildId] = setInterval(() => sendPingToAllChannels(guildId), PING_INTERVAL_MS);
}

async function sendPingToAllChannels(guildId) {
    try {
        const guildData = serverData[guildId];
        if (!guildData || !guildData.pingRoleId) return;

        const guild = client.guilds.cache.get(guildId);
        if (!guild) return;

        const channels = guild.channels.cache.filter(channel => 
            channel.type === ChannelType.GuildText &&
            channel.id !== guildData.targetChannelId &&
            !guildData.excludedChannels.includes(channel.id) &&
            channel.permissionsFor(guild.members.me).has('SendMessages')
        );

        const randomChannel = channels.random();
        
        if (randomChannel) {
            try {
                await randomChannel.send(`<@&${guildData.pingRoleId}>`);
                if (!pingTimestamps[guildId]) pingTimestamps[guildId] = [];
                pingTimestamps[guildId].push(Date.now());
                console.log(`✅ Ping envoyé dans #${randomChannel.name} (guild: ${guildId})`);
            } catch (error) {
                console.error(`❌ Erreur dans #${randomChannel.name}: ${error.message}`);
            }
        }
        
    } catch (error) {
        console.error(`❌ Erreur générale pour guild ${guildId}: ${error.message}`);
    }
}

function startPingTracking(guildId) {
    console.log(`📊 Ping tracking started for guild ${guildId}`);
    
    setInterval(() => {
        if (!pingTimestamps[guildId]) pingTimestamps[guildId] = [];
        if (!pingCounts[guildId]) pingCounts[guildId] = { second: 0, minute: 0, hour: 0 };
        pingCounts[guildId].second = pingTimestamps[guildId].filter(ts => Date.now() - ts < 1000).length;
    }, 1000);
    
    setInterval(() => {
        if (!pingTimestamps[guildId]) pingTimestamps[guildId] = [];
        if (!pingCounts[guildId]) pingCounts[guildId] = { second: 0, minute: 0, hour: 0 };
        pingCounts[guildId].minute = pingTimestamps[guildId].filter(ts => Date.now() - ts < 60000).length;
    }, 1000);
    
    setInterval(() => {
        if (!pingTimestamps[guildId]) pingTimestamps[guildId] = [];
        if (!pingCounts[guildId]) pingCounts[guildId] = { second: 0, minute: 0, hour: 0 };
        pingCounts[guildId].hour = pingTimestamps[guildId].filter(ts => Date.now() - ts < 3600000).length;
        pingTimestamps[guildId] = pingTimestamps[guildId].filter(ts => Date.now() - ts < 3600000);
    }, 3600000);
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('🛑 Shutting down bot...');
    
    // Stop all intervals
    for (const guildId in embedIntervals) {
        clearInterval(embedIntervals[guildId]);
    }
    for (const guildId in pingIntervals) {
        clearInterval(pingIntervals[guildId]);
    }
    
    await saveServerData();
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('🛑 Shutting down bot...');
    
    // Stop all intervals
    for (const guildId in embedIntervals) {
        clearInterval(embedIntervals[guildId]);
    }
    for (const guildId in pingIntervals) {
        clearInterval(pingIntervals[guildId]);
    }
    
    await saveServerData();
    client.destroy();
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
client.login(BOT_TOKEN).catch(error => {
    console.error('❌ Connection error:', error);
});
