const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Joueur } = require('../db/models');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('settings')
        .setDescription('Modifier tes paramètres pour recevoir des rappels automatiques.')
        .addBooleanOption(option =>
            option.setName('rappel_enigme')
                .setDescription('Recevoir un MP quand le délai de 30 min pour faire un nouveau /deviner est fini.')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName('rappel_tour')
                .setDescription('Recevoir un MP 2h avant la fin du tour si tu n\'as pas encore joué.')
                .setRequired(false)
        ),
    async execute(interaction) {
        const userId = interaction.user.id;
        let joueur = await Joueur.findByPk(userId);

        if (!joueur) {
            joueur = await Joueur.create({ discord_id: userId });
        }

        const rappelEnigme = interaction.options.getBoolean('rappel_enigme');
        const rappelTour = interaction.options.getBoolean('rappel_tour');

        let updated = false;

        if (rappelEnigme !== null) {
            joueur.auto_remind_guess = rappelEnigme;
            updated = true;
        }

        if (rappelTour !== null) {
            joueur.auto_remind_turn = rappelTour;
            updated = true;
        }

        if (updated) {
            await joueur.save();
        }

        const embed = new EmbedBuilder()
            .setTitle('⚙️ Tes Paramètres de Rappel')
            .setColor('#3498db')
            .addFields(
                { name: 'Rappel Énigme (30 min)', value: joueur.auto_remind_guess ? '✅ Activé' : '❌ Désactivé', inline: true },
                { name: 'Rappel Fin de Tour (2h avant)', value: joueur.auto_remind_turn ? '✅ Activé' : '❌ Désactivé', inline: true }
            )
            .setFooter({ text: 'Utilise /settings en ajoutant les options pour modifier ces valeurs.' });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },
};
