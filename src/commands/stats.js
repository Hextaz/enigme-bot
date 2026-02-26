const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Joueur } = require('../db/models');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Affiche le classement et les statistiques des joueurs.'),
    async execute(interaction) {
        const joueurs = await Joueur.findAll({
            order: [
                ['etoiles', 'DESC'],
                ['pieces', 'DESC']
            ]
        });

        if (joueurs.length === 0) {
            return interaction.reply({ content: 'Aucun joueur n\'a encore participé.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('🏆 Classement de la Saison')
            .setColor('#FFD700')
            .setDescription('Voici les statistiques actuelles des joueurs :');

        joueurs.forEach((joueur, index) => {
            const user = interaction.client.users.cache.get(joueur.discord_id);
            const username = user ? user.username : `Joueur Inconnu (${joueur.discord_id})`;
            
            let inventaireStr = 'Vide';
            if (joueur.inventaire && joueur.inventaire.length > 0) {
                inventaireStr = joueur.inventaire.join(', ');
            }

            embed.addFields({
                name: `#${index + 1} - ${username}`,
                value: `⭐ Étoiles : ${joueur.etoiles} | 💰 Pièces : ${joueur.pieces} | 📍 Position : ${joueur.position}\n🎒 Inventaire : ${inventaireStr}`,
                inline: false
            });
        });

        await interaction.reply({ embeds: [embed] });
    },
};
