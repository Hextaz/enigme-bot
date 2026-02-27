const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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
                .setDescription('Donner une ressource à un joueur.')
                .addUserOption(option => option.setName('joueur').setDescription('Le joueur cible').setRequired(true))
                .addStringOption(option => 
                    option.setName('ressource')
                        .setDescription('Type de ressource')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Pièces', value: 'pieces' },
                            { name: 'Étoiles', value: 'etoiles' },
                            { name: 'Objet', value: 'objet' }
                        )
                )
                .addStringOption(option => option.setName('valeur').setDescription('Quantité (nombre) ou Nom de l\'objet').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Retirer une ressource à un joueur.')
                .addUserOption(option => option.setName('joueur').setDescription('Le joueur cible').setRequired(true))
                .addStringOption(option => 
                    option.setName('ressource')
                        .setDescription('Type de ressource')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Pièces', value: 'pieces' },
                            { name: 'Étoiles', value: 'etoiles' },
                            { name: 'Objet', value: 'objet' }
                        )
                )
                .addStringOption(option => option.setName('valeur').setDescription('Quantité (nombre) ou Nom de l\'objet').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('set_position')
                .setDescription('Téléporter manuellement un joueur.')
                .addUserOption(option => option.setName('joueur').setDescription('Le joueur cible').setRequired(true))
                .addIntegerOption(option => option.setName('case').setDescription('Numéro de la case (1-42)').setRequired(true).setMinValue(1).setMaxValue(42))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('kick')
                .setDescription('Exclure un joueur et supprimer ses données.')
                .addUserOption(option => option.setName('joueur').setDescription('Le joueur cible').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset_cooldown')
                .setDescription('Remet à zéro le temps d\'attente d\'un joueur.')
                .addUserOption(option => option.setName('joueur').setDescription('Le joueur cible').setRequired(true))
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
        } else if (subcommand === 'give' || subcommand === 'remove') {
            const targetUser = interaction.options.getUser('joueur');
            const ressource = interaction.options.getString('ressource');
            const valeur = interaction.options.getString('valeur');

            let joueur = await Joueur.findByPk(targetUser.id);
            if (!joueur) {
                if (subcommand === 'remove') return interaction.reply({ content: "Ce joueur n'existe pas dans la base de données.", ephemeral: true });
                joueur = await Joueur.create({ discord_id: targetUser.id });
            }

            if (ressource === 'pieces' || ressource === 'etoiles') {
                const quantite = parseInt(valeur);
                if (isNaN(quantite) || quantite <= 0) return interaction.reply({ content: "Veuillez entrer un nombre valide et positif.", ephemeral: true });
                
                if (subcommand === 'give') {
                    joueur[ressource] += quantite;
                    await joueur.save();
                    await interaction.reply(`✅ Ajout de ${quantite} ${ressource} à <@${targetUser.id}>.`);
                } else {
                    joueur[ressource] = Math.max(0, joueur[ressource] - quantite);
                    await joueur.save();
                    await interaction.reply(`✅ Retrait de ${quantite} ${ressource} à <@${targetUser.id}>.`);
                }
            } else if (ressource === 'objet') {
                if (subcommand === 'give') {
                    const inventaire = [...joueur.inventaire];
                    if (inventaire.length < 3) {
                        inventaire.push(valeur);
                        joueur.inventaire = inventaire;
                        await joueur.save();
                        await interaction.reply(`✅ L'objet "${valeur}" a été donné à <@${targetUser.id}>.`);
                    } else {
                        return interaction.reply({ content: 'L\'inventaire du joueur est plein (max 3).', ephemeral: true });
                    }
                } else {
                    const inventaire = [...joueur.inventaire];
                    const index = inventaire.indexOf(valeur);
                    if (index !== -1) {
                        inventaire.splice(index, 1);
                        joueur.inventaire = inventaire;
                        await joueur.save();
                        await interaction.reply(`✅ L'objet "${valeur}" a été retiré à <@${targetUser.id}>.`);
                    } else {
                        return interaction.reply({ content: `Le joueur ne possède pas l'objet "${valeur}".`, ephemeral: true });
                    }
                }
            }
        } else if (subcommand === 'set_position') {
            const targetUser = interaction.options.getUser('joueur');
            const caseNum = interaction.options.getInteger('case');
            
            let joueur = await Joueur.findByPk(targetUser.id);
            if (!joueur) return interaction.reply({ content: "Ce joueur n'existe pas dans la base de données.", ephemeral: true });
            
            joueur.position = caseNum;
            await joueur.save();
            await interaction.reply(`📍 <@${targetUser.id}> a été téléporté sur la case ${caseNum}.`);
            
        } else if (subcommand === 'kick') {
            const targetUser = interaction.options.getUser('joueur');
            
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`admin_kick_confirm_${targetUser.id}`)
                        .setLabel('Oui, exclure définitivement')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('admin_kick_cancel')
                        .setLabel('Annuler')
                        .setStyle(ButtonStyle.Secondary)
                );

            await interaction.reply({ 
                content: `⚠️ **Êtes-vous sûr de vouloir supprimer définitivement <@${targetUser.id}> de cette saison ?** Toutes ses données seront perdues.`, 
                components: [row],
                ephemeral: true 
            });
            
        } else if (subcommand === 'reset_cooldown') {
            const targetUser = interaction.options.getUser('joueur');
            
            let joueur = await Joueur.findByPk(targetUser.id);
            if (!joueur) return interaction.reply({ content: "Ce joueur n'existe pas dans la base de données.", ephemeral: true });
            
            joueur.a_le_droit_de_jouer = true;
            joueur.last_deviner_time = null;
            await joueur.save();
            
            await interaction.reply(`⏳ Le cooldown de <@${targetUser.id}> a été réinitialisé. Il peut rejouer immédiatement.`);
            
        } else if (subcommand === 'tour') {
            const numero = interaction.options.getInteger('numero');
            await Plateau.update({ tour: numero }, { where: { id: 1 } });
            await interaction.reply(`Le tour a été défini sur **${numero}**.`);
        }
    },
};
