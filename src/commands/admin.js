const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { Joueur, Plateau } = require('../db/models');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Commandes d\'administration pour le Maître du Jeu.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Reset total et lance la saison.')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('stop')
                .setDescription('Bloque le jeu et annonce le podium final.')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('give')
                .setDescription('Outil de correction manuelle.')
                .addUserOption(option => option.setName('joueur').setDescription('Le joueur cible').setRequired(true))
                .addIntegerOption(option => option.setName('pieces').setDescription('Nombre de pièces à donner').setRequired(false))
                .addIntegerOption(option => option.setName('etoiles').setDescription('Nombre d\'étoiles à donner').setRequired(false))
                .addStringOption(option => option.setName('item').setDescription('ID de l\'item à donner').setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('tour')
                .setDescription('Définit le numéro du tour actuel.')
                .addIntegerOption(option => option.setName('numero').setDescription('Le numéro du tour').setRequired(true))
        ),
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'start') {
            await Joueur.destroy({ where: {} });
            // L'étoile spawn entre la case 10 et 42 pour ne pas être trop proche du départ
            const randomStarPos = Math.floor(Math.random() * 33) + 10; 
            await Plateau.update({ position_etoile: randomStarPos, pieges_actifs: [], tour: 0, enigme_resolue: true }, { where: { id: 1 } });
            await interaction.reply(`La saison a été réinitialisée et lancée ! L'Étoile est apparue sur la case ${randomStarPos}. Le prochain \`# Enigme du jour\` lancera le **Tour 1**.`);
        } else if (subcommand === 'stop') {
            // Bloquer le jeu (on pourrait ajouter une variable globale dans Plateau)
            // Annoncer le podium
            const joueurs = await Joueur.findAll({
                order: [
                    ['etoiles', 'DESC'],
                    ['pieces', 'DESC']
                ],
                limit: 3
            });

            let podiumMsg = '🏁 **FIN DE LA SAISON ! Voici le podium :** 🏁\n\n';
            const medailles = ['🥇', '🥈', '🥉'];
            
            joueurs.forEach((joueur, index) => {
                podiumMsg += `${medailles[index]} <@${joueur.discord_id}> avec ${joueur.etoiles} ⭐ et ${joueur.pieces} 💰\n`;
            });

            await interaction.reply(podiumMsg);
        } else if (subcommand === 'give') {
            const targetUser = interaction.options.getUser('joueur');
            const pieces = interaction.options.getInteger('pieces') || 0;
            const etoiles = interaction.options.getInteger('etoiles') || 0;
            const item = interaction.options.getString('item');

            let joueur = await Joueur.findByPk(targetUser.id);
            if (!joueur) {
                joueur = await Joueur.create({ discord_id: targetUser.id });
            }

            joueur.pieces += pieces;
            joueur.etoiles += etoiles;
            
            if (item) {
                const inventaire = [...joueur.inventaire];
                if (inventaire.length < 3) {
                    inventaire.push(item);
                    joueur.inventaire = inventaire;
                } else {
                    return interaction.reply({ content: 'L\'inventaire du joueur est plein (max 3).', ephemeral: true });
                }
            }

            await joueur.save();
            await interaction.reply(`Données mises à jour pour <@${targetUser.id}>.`);
        } else if (subcommand === 'tour') {
            const numero = interaction.options.getInteger('numero');
            await Plateau.update({ tour: numero }, { where: { id: 1 } });
            await interaction.reply(`Le tour a été défini sur **${numero}**.`);
        }
    },
};
