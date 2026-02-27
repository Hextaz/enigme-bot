const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { Joueur, Plateau } = require('../db/models');
const config = require('../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('deviner')
        .setDescription('Proposer une réponse à l\'énigme du jour.')
        .addStringOption(option => 
            option.setName('mot')
                .setDescription('Ta proposition de réponse')
                .setRequired(true)
        ),
    async execute(interaction) {
        const mot = interaction.options.getString('mot');
        const userId = interaction.user.id;

        let joueur = await Joueur.findByPk(userId);
        if (!joueur) {
            joueur = await Joueur.create({ discord_id: userId });
        }

        const plateau = await Plateau.findByPk(1);
        if (plateau.enigme_status === 'finished') {
            return interaction.reply({ content: "L'énigme du jour est déjà terminée !", ephemeral: true });
        }

        // Cooldown check (15 minutes)
        const COOLDOWN_MINUTES = 15;
        const now = new Date();
        if (joueur.last_deviner_time) {
            const diffMs = now - new Date(joueur.last_deviner_time);
            const diffMins = Math.floor(diffMs / 60000);
            if (diffMins < COOLDOWN_MINUTES) {
                const remainingMins = COOLDOWN_MINUTES - diffMins;
                
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`rappel_deviner_${userId}`)
                            .setLabel('Oui, rappelle-moi')
                            .setStyle(ButtonStyle.Primary)
                    );

                return interaction.reply({ 
                    content: `⏳ Vous devez attendre encore ${remainingMins} minute(s). Voulez-vous que je vous envoie un rappel en MP quand vous pourrez rejouer ?`, 
                    components: [row],
                    ephemeral: true 
                });
            }
        }

        // Update cooldown
        joueur.last_deviner_time = now;
        await joueur.save();

        // Send to MJ
        try {
            const mjUser = await interaction.client.users.fetch(config.mjUserId);
            if (mjUser) {
                const embed = new EmbedBuilder()
                    .setTitle('Nouvelle proposition d\'énigme')
                    .setDescription(`Tentative de <@${userId}> : **${mot}**`)
                    .setColor('#f1c40f')
                    .setTimestamp();

                // We need to encode the user ID and the word in the custom_id.
                // custom_id max length is 100 chars.
                // "reponse_good_123456789012345678_word"
                // If word is too long, we might need to truncate it or store it in DB.
                // Let's truncate the word to 50 chars just in case.
                const safeMot = mot.substring(0, 50);
                
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`reponse_bad_${userId}_${safeMot}`)
                            .setLabel('❌ Mauvaise réponse')
                            .setStyle(ButtonStyle.Danger),
                        new ButtonBuilder()
                            .setCustomId(`reponse_good_${userId}_${safeMot}`)
                            .setLabel('✅ Bonne réponse')
                            .setStyle(ButtonStyle.Success)
                    );

                await mjUser.send({ embeds: [embed], components: [row] });
            }
        } catch (error) {
            console.error("Erreur lors de l'envoi au MJ:", error);
            return interaction.reply({ content: "Une erreur est survenue lors de l'envoi de ta réponse au MJ.", ephemeral: true });
        }

        // Save the channel ID where the command was used so we can post results there
        if (plateau.enigme_channel_id !== interaction.channelId) {
            plateau.enigme_channel_id = interaction.channelId;
            await plateau.save();
        }

        await interaction.reply({ content: `Ta proposition "**${mot}**" a bien été envoyée au Maître du Jeu !`, ephemeral: true });
    },
};
