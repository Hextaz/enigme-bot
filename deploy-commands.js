const { REST, Routes } = require('discord.js');
const config = require('./src/config');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'src', 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
    try {
        console.log(`Début du rafraîchissement de ${commands.length} commandes (/) de l'application.`);

        const clientId = config.clientId || process.env.CLIENT_ID || process.env.DISCORD_CLIENT_ID;
        const data = await rest.put(
            Routes.applicationGuildCommands(clientId, config.guildId),
            { body: commands },
        );

        console.log(`Rafraîchissement réussi de ${data.length} commandes (/) de l'application.`);
    } catch (error) {
        console.error(error);
    }
})();
