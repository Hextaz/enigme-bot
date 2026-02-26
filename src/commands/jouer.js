const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { Joueur, Plateau } = require('../db/models');
const { generateZoomedBoardImage } = require('../utils/canvas');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('jouer')
        .setDescription('Affiche le menu privé pour jouer sur le plateau.'),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const joueur = await Joueur.findByPk(interaction.user.id);
        
        if (!joueur) {
            return interaction.editReply({ content: 'Tu n\'as pas encore participé à l\'énigme du jour !' });
        }

        if (!joueur.a_le_droit_de_jouer) {
            return interaction.editReply({ content: 'Tu n\'as pas le droit de jouer aujourd\'hui. Participe à l\'énigme du jour !' });
        }

        const tousLesJoueurs = await Joueur.findAll();
        const plateau = await Plateau.findByPk(1);

        // Calcul du classement
        const sortedJoueurs = tousLesJoueurs.sort((a, b) => {
            if (b.etoiles !== a.etoiles) return b.etoiles - a.etoiles;
            return b.pieces - a.pieces;
        });
        const rank = sortedJoueurs.findIndex(j => j.discord_id === joueur.discord_id) + 1;

        const buffer = await generateZoomedBoardImage(joueur, tousLesJoueurs, plateau, interaction.client);
        const attachment = new AttachmentBuilder(buffer, { name: 'zoomed_board.png' });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('lancer_de')
                    .setLabel('🎲 Lancer le dé')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('inventaire')
                    .setLabel('🎒 Inventaire')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('voir_plateau')
                    .setLabel('🗺️ Voir le plateau')
                    .setStyle(ButtonStyle.Success)
            );

        // Ajouter un bouton pour utiliser un objet si l'inventaire n'est pas vide
        if (joueur.inventaire && joueur.inventaire.length > 0) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('utiliser_objet')
                    .setLabel('🪄 Utiliser un objet')
                    .setStyle(ButtonStyle.Danger)
            );
        }

        const tourActuel = plateau ? plateau.tour : 1;

        await interaction.editReply({
            content: `**Tour ${tourActuel}/30**\n**Tes statistiques :**\n⭐ Étoiles : **${joueur.etoiles}** | 🪙 Pièces : **${joueur.pieces}** | 🏆 Classement : **${rank}/${tousLesJoueurs.length}**\n\nTu es sur la case **${joueur.position}**. Que veux-tu faire ?`,
            files: [attachment],
            components: [row]
        });
    },
};
