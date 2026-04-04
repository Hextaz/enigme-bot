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
                .setName('lancer_enigme')
                .setDescription('Lance l\'énigme du jour (incrémente le tour).')
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
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('open_black_market')
                .setDescription('Force l\'ouverture du Marché Noir (utile si le cron a planté le dimanche).')
        ),
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const publicSubcommands = ['start', 'lancer_enigme', 'stop', 'set_tour', 'give', 'remove', 'set_position'];
        
        if (publicSubcommands.includes(subcommand)) {
            await interaction.deferReply();
        } else {
            await interaction.deferReply({ flags: 64 });
        }


        if (subcommand === 'start') {
            await Joueur.destroy({ where: {} });
            // L'étoile spawn entre la case 10 et 42 pour ne pas être trop proche du départ
            const randomStarPos = Math.floor(Math.random() * 33) + 10; 
            await Plateau.update({ position_etoile: randomStarPos, pieges_actifs: [], tour: 0, enigme_resolue: true }, { where: { id: 1 } });
            await interaction.editReply(`La saison a été réinitialisée et lancée ! L'Étoile est apparue sur la case ${randomStarPos}. Le prochain \`/admin lancer_enigme\` lancera le **Tour 1**.`);
        } else if (subcommand === 'lancer_enigme') {
            let plateau = await Plateau.findByPk(1);
            if (!plateau) {
                plateau = await Plateau.create({ id: 1 });
            }
            plateau.tour += 1;
            plateau.enigme_resolue = false;
            plateau.enigme_status = 'active';
            await plateau.save();
            
            let message = `📢 **Tour ${plateau.tour}/30** : L'énigme du jour a commencé !\n\n`;
            message += `💡 Utilisez la commande \`/deviner [votre mot]\` pour proposer une réponse secrètement au Maître du Jeu.\n`;
            message += `🪙 Chaque proposition vous rapporte **1 pièce** de participation (maximum 5 pièces par jour) !\n`;
            message += `🎲 **Rappel :** Le plateau \`/jouer\` est verrouillé tant que l'énigme n'a pas été trouvée !`;
            
            return interaction.editReply({ content: message });
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

            await interaction.editReply(podiumMsg);
        } else if (subcommand === 'give' || subcommand === 'remove') {
            const targetUser = interaction.options.getUser('joueur');
            const ressource = interaction.options.getString('ressource');
            const valeur = interaction.options.getString('valeur');

            let joueur = await Joueur.findByPk(targetUser.id);
            if (!joueur) {
                if (subcommand === 'remove') return interaction.editReply({ content: "Ce joueur n'existe pas dans la base de données.", flags: 64 });
                joueur = await Joueur.create({ discord_id: targetUser.id });
            }

            if (ressource === 'pieces' || ressource === 'etoiles') {
                const quantite = parseInt(valeur);
                if (isNaN(quantite) || quantite <= 0) return interaction.editReply({ content: "Veuillez entrer un nombre valide et positif.", flags: 64 });
                
                if (subcommand === 'give') {
                    joueur[ressource] += quantite;
                    await joueur.save();
                    await interaction.editReply(`✅ Ajout de ${quantite} ${ressource} à <@${targetUser.id}>.`);
                } else {
                    joueur[ressource] = Math.max(0, joueur[ressource] - quantite);
                    await joueur.save();
                    await interaction.editReply(`✅ Retrait de ${quantite} ${ressource} à <@${targetUser.id}>.`);
                }
            } else if (ressource === 'objet') {
                if (subcommand === 'give') {
                    const inventaire = [...joueur.inventaire];
                    if (inventaire.length < 3) {
                        inventaire.push(valeur);
                        joueur.inventaire = inventaire;
                        await joueur.save();
                        await interaction.editReply(`✅ L'objet "${valeur}" a été donné à <@${targetUser.id}>.`);
                    } else {
                        return interaction.editReply({ content: 'L\'inventaire du joueur est plein (max 3).', flags: 64 });
                    }
                } else {
                    const inventaire = [...joueur.inventaire];
                    const index = inventaire.indexOf(valeur);
                    if (index !== -1) {
                        inventaire.splice(index, 1);
                        joueur.inventaire = inventaire;
                        await joueur.save();
                        await interaction.editReply(`✅ L'objet "${valeur}" a été retiré à <@${targetUser.id}>.`);
                    } else {
                        return interaction.editReply({ content: `Le joueur ne possède pas l'objet "${valeur}".`, flags: 64 });
                    }
                }
            }
        } else if (subcommand === 'set_position') {
            const targetUser = interaction.options.getUser('joueur');
            const caseNum = interaction.options.getInteger('case');
            
            let joueur = await Joueur.findByPk(targetUser.id);
            if (!joueur) return interaction.editReply({ content: "Ce joueur n'existe pas dans la base de données.", flags: 64 });
            
            joueur.position = caseNum;
            await joueur.save();
            await interaction.editReply(`📍 <@${targetUser.id}> a été téléporté sur la case ${caseNum}.`);
            
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

            await interaction.editReply({ 
                content: `⚠️ **Êtes-vous sûr de vouloir supprimer définitivement <@${targetUser.id}> de cette saison ?** Toutes ses données seront perdues.`, 
                components: [row],
                flags: 64 
            });
            
        } else if (subcommand === 'reset_cooldown') {
            const targetUser = interaction.options.getUser('joueur');
            
            let joueur = await Joueur.findByPk(targetUser.id);
            if (!joueur) return interaction.editReply({ content: "Ce joueur n'existe pas dans la base de données.", flags: 64 });
            
            joueur.a_le_droit_de_jouer = true;
            joueur.last_deviner_time = null;
              joueur.est_fantome = false;
              joueur.jours_inactifs = 0;
            await interaction.editReply(`⏳ Le cooldown de <@${targetUser.id}> a été réinitialisé. Il peut rejouer immédiatement.`);
            
        } else if (subcommand === 'tour') {
            const numero = interaction.options.getInteger('numero');
            await Plateau.update({ tour: numero }, { where: { id: 1 } });
            await interaction.editReply(`Le tour a été défini sur **${numero}**.`);
        } else if (subcommand === 'open_black_market') {
            // Vérification si on est dimanche
            const today = new Date();
            if (today.getDay() !== 0) {
                return interaction.editReply({ content: 'Cette commande ne peut être utilisée que le dimanche !', flags: 64 });
            }

            // Ouverture manuelle
            const tousLesJoueurs = await Joueur.findAll();
            for (const j of tousLesJoueurs) {
                j.a_le_droit_de_jouer = true; // Plateau ouvert d'office !
                j.guess_du_jour = 0;
                j.boutique_du_jour = []; // Reset pour forcer la génération du marché noir
                j.last_deviner_time = null;
                await j.save();
            }

            const plateau = await Plateau.findByPk(1);
            if (plateau) {
                plateau.tour += 1;
                plateau.enigme_resolue = true;
                await plateau.save();
            }

            const config = require('../config');
            const channel = interaction.client.channels.cache.get(config.boardChannelId);
            
            if (channel) {
                let mentionRole = config.roleEnigmeId ? `<@&${config.roleEnigmeId}> ` : '';
                await channel.send(`${mentionRole}🛍️ **LE MARCHÉ NOIR EST OUVERT ! (Action manuelle du MJ)** 🛍️\nLe plateau est déverrouillé, aucune énigme aujourd'hui. Les boutiques proposent des objets dévastateurs exclusifs ! Utilisez \`/jouer\` pour en profiter !`);
            }

            await interaction.editReply({ content: '✅ Le Marché Noir a été ouvert manuellement avec succès et tous les joueurs ont été débloqués.', flags: 64 });
        }
    },
};
