const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { Joueur, Plateau } = require('../db/models');
const { generateZoomedBoardImage } = require('../utils/canvas');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('jouer')
        .setDescription('Affiche le menu privé pour jouer sur le plateau.'),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        let joueur = await Joueur.findByPk(interaction.user.id);
        
        if (!joueur) {
            // Création du profil si c'est la première fois
            joueur = await Joueur.create({ 
                discord_id: interaction.user.id,
                a_le_droit_de_jouer: true 
            });
        }

        if (!joueur.a_le_droit_de_jouer && joueur.cases_restantes <= 0) {
            return interaction.editReply({ content: "Tu as déjà joué aujourd'hui ! Reviens demain après la nouvelle énigme." });
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

        const row = new ActionRowBuilder();
        
        if (joueur.cases_restantes > 0) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('continuer_deplacement')
                    .setLabel(`🚶 Continuer (${joueur.cases_restantes} cases)`)
                    .setStyle(ButtonStyle.Success)
            );
        } else {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('lancer_de')
                    .setLabel('🎲 Lancer le dé')
                    .setStyle(ButtonStyle.Primary)
            );
        }

        row.addComponents(
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
