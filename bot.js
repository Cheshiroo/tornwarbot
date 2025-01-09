const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

let factionId = process.env.FACTION_ID;
let tornApiKey = process.env.TORN_API_KEY;
let fetchInterval = null; // Variable to store the interval ID for updating hospital timers

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

client.once('ready', () => {
    console.log('Bot is online!');
});

// Generate the Torn API URL dynamically
const getApiUrl = () => `https://api.torn.com/v2/faction/${factionId}/members?key=${tornApiKey}&striptags=true`;
const getFactionDetailsUrl = () => `https://api.torn.com/faction/${factionId}?key=${tornApiKey}&selections=&striptags=true`;

client.on('messageCreate', async (message) => {
    // Start hospital timer updates
    if (message.content.toLowerCase() === '!war') {
        try {
            console.log('Fetching faction details...');
            const factionResponse = await fetch(getFactionDetailsUrl());
            const factionData = await factionResponse.json();

            if (!factionData.name) {
                message.reply("Error fetching faction details.");
                return;
            }

            const factionName = factionData.name;

            console.log('Fetching data from Torn API...');
            const response = await fetch(getApiUrl());
            const data = await response.json();

            if (!data.members) {
                message.reply("Error fetching member data.");
                return;
            }

            const members = Object.values(data.members);

            // Sort members by when they will be out of the hospital (soonest first)
            members.sort((a, b) => a.status.until - b.status.until);

            const embedMessages = []; // Store sent messages for updates

            const sendOrUpdateEmbeds = async (membersData, isUpdate = false) => {
                const chunks = [];
                for (let i = 0; i < membersData.length; i += 25) {
                    chunks.push(membersData.slice(i, i + 25));
                }

                for (let i = 0; i < chunks.length; i++) {
                    const embed = new EmbedBuilder()
                        .setTitle(`${factionName}`)
                        .setColor('#3498db');

                    chunks[i].forEach((member) => {
                        const hospitalTime = (member.status.until - Math.floor(Date.now() / 1000)) || 0;

                        let timerDisplay = hospitalTime > 0
                            ? `<t:${member.status.until}:R>`
                            : "Out of hospital"; 
                            
                        let statusIcon = '';
                        let statusText = '';
                        if (member.last_action.status === 'Online') {
                            statusIcon = '🟢';
                            statusText = 'Online';
                        } else if (member.last_action.status === 'Idle') {
                            statusIcon = '🟡'; 
                            statusText = 'Idle';
                        } else {
                            statusIcon = '🔴'; 
                            statusText = 'Offline';
                        }

                        const attackLink = `https://www.torn.com/loader.php?sid=attack&user2ID=${member.id}`;
                        const profileLink = `https://www.torn.com/profiles.php?XID=${member.id}`;

                        embed.addFields({
                            name: `${statusIcon} ${member.name}: Lv${member.level}`, 
                            value: `[Profile](${profileLink}) | [Attack](${attackLink}) - ${timerDisplay}`,
                            inline: false,
                        });
                    });

                    if (isUpdate && embedMessages[i]) {
                        await embedMessages[i].edit({ embeds: [embed] });
                    } else {
                        const sentMessage = await message.reply({ embeds: [embed] });
                        embedMessages.push(sentMessage);
                    }
                }
            };

            await sendOrUpdateEmbeds(members);

            if (fetchInterval) {
                clearInterval(fetchInterval);
            }

            fetchInterval = setInterval(async () => {
                console.log('Updating hospital timers...');
                try {
                    const updatedResponse = await fetch(getApiUrl());
                    const updatedData = await updatedResponse.json();

                    if (!updatedData.members) {
                        console.error("Failed to fetch updated data.");
                        return;
                    }

                    const updatedMembers = Object.values(updatedData.members);
                    updatedMembers.sort((a, b) => a.status.until - b.status.until);
                    await sendOrUpdateEmbeds(updatedMembers, true); 
                } catch (updateError) {
                    console.error("Error updating embed:", updateError);
                }
            }, 10000); // Update every 10 seconds or as needed (this interval can be adjusted)
        } catch (error) {
            console.error('Error fetching data:', error);
            message.reply("An error occurred while fetching the data.");
        }
    }

    // Stop hospital timer updates
    if (message.content.toLowerCase() === '!stop') {
        if (fetchInterval) {
            clearInterval(fetchInterval); // Stop the interval
            fetchInterval = null; // Reset the interval ID
            message.reply("Hospital timer updates have been stopped.");
        } else {
            message.reply("The hospital timer updates are not running.");
        }
    }

    // Command to change faction ID
    if (message.content.toLowerCase().startsWith('!faction ')) {
        const newFactionId = message.content.split(' ')[1];

        if (!newFactionId || isNaN(newFactionId)) {
            message.reply("Please provide a valid faction ID. Usage: `!faction <id>`");
            return;
        }

        factionId = newFactionId; // Update in-memory factionId
        process.env.FACTION_ID = newFactionId; // Update the .env file

        updateEnvVariable('FACTION_ID', newFactionId);
        message.reply(`Faction ID has been updated to ${newFactionId}!`);
    }
});

// Function to update environment variables in .env file
function updateEnvVariable(key, value) {
    const envFilePath = './.env';
    const envVars = fs.existsSync(envFilePath)
        ? fs.readFileSync(envFilePath, 'utf8').split('\n')
        : [];

    let updated = false;
    const newEnvVars = envVars.map((line) => {
        if (line.startsWith(`${key}=`)) {
            updated = true;
            return `${key}=${value}`;
        }
        return line;
    });

    if (!updated) {
        newEnvVars.push(`${key}=${value}`);
    }

    fs.writeFileSync(envFilePath, newEnvVars.join('\n'));
    console.log(`${key} updated in .env file.`);
}

// Function to format time as HH:MM:SS
function formatTime(seconds) {
    const hours = String(Math.floor(seconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
    const secs = String(seconds % 60).padStart(2, '0');
    return `${hours}:${minutes}:${secs}`;
}

client.login(process.env.DISCORD_TOKEN);
