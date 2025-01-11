const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

let factionId = process.env.FACTION_ID;
let tornApiKey = process.env.TORN_API_KEY;

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
	// Command to display help
    if (message.content.toLowerCase() === '!help') {
        const helpEmbed = new EmbedBuilder()
            .setTitle('Help - Bot Commands')
            .setColor('#3498db')
            .setDescription('Here are the commands you can use with this bot:')
            .addFields([
                { name: '!war', value: 'Starts monitoring faction hospital timers and displays their user information.' },
                { name: '!faction <id>', value: 'Changes the faction ID to monitor. Replace `<id>` with the new faction ID.' },
                { name: '!help', value: 'Displays this help message with a list of available commands.' },
            ]);

        await message.reply({ embeds: [helpEmbed] });
        return;
    }
	
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
                        if (member.last_action.status === 'Online') {
                            statusIcon = '🟢';
                        } else if (member.last_action.status === 'Idle') {
                            statusIcon = '🟡'; 
                        } else {
                            statusIcon = '🔴'; 
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

            // Set timeouts to update when a timer reaches zero
            members.forEach((member) => {
                const timeUntilZero = (member.status.until - Math.floor(Date.now() / 1000)) * 1000;

                if (timeUntilZero > 0) {
                    setTimeout(async () => {
                        console.log(`Timer for ${member.name} reached 00:00:00. Updating...`);
                        try {
                            const updatedResponse = await fetch(getApiUrl());
                            const updatedData = await updatedResponse.json();

                            if (updatedData.members) {
                                const updatedMembers = Object.values(updatedData.members);
                                updatedMembers.sort((a, b) => a.status.until - b.status.until);
                                await sendOrUpdateEmbeds(updatedMembers, true);
                            }
                        } catch (updateError) {
                            console.error("Error updating embed:", updateError);
                        }
                    }, timeUntilZero);
                }
            });
        } catch (error) {
            console.error('Error fetching data:', error);
            message.reply("An error occurred while fetching the data.");
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

// Create a simple server for Render
const http = require('http');
const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});


// Login to Discord
client.login(process.env.DISCORD_TOKEN);
