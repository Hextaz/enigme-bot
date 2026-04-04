const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Joueur, Plateau } = require('../db/models');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Commandes d\'administration pour le MaÃ®tre du Jeu.')
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
                .setDescription('Lance l\'Ã©nigme du jour (incrÃ©mente le tour).')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('give')
                .setDescription('Donner une ressource Ã  un joueur.')
                .addUserOption(option => option.setName('joueur').setDescription('Le joueur cible').setRequired(true))
                .addStringOption(option => 
                    option.setName('ressource')
                        .setDescription('Type de ressource')
                        .setRequired(true)
                        .addChoices(
                            { name: 'PiÃ¨ces', value: 'pieces' },
                            { name: 'Ã‰toiles', value: 'etoiles' },
                            { name: 'Objet', value: 'objet' }
                        )
                )
                .addStringOption(option => option.setName('valeur').setDescription('QuantitÃ© (nombre) ou Nom de l\'objet').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Retirer une ressource Ã  un joueur.')
                .addUserOption(option => option.setName('joueur').setDescription('Le joueur cible').setRequired(true))
                .addStringOption(option => 
                    option.setName('ressource')
                        .setDescription('Type de ressource')
                        .setRequired(true)
                        .addChoices(
                            { name: 'PiÃ¨ces', value: 'pieces' },
                            { name: 'Ã‰toiles', value: 'etoiles' },
                            { name: 'Objet', value: 'objet' }
                        )
                )
                .addStringOption(option => option.setName('valeur').setDescription('QuantitÃ© (nombre) ou Nom de l\'objet').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('set_position')
                .setDescription('TÃ©lÃ©porter manuellement un joueur.')
                .addUserOption(option => option.setName('joueur').setDescription('Le joueur cible').setRequired(true))
                .addIntegerOption(option => option.setName('case').setDescription('NumÃ©ro de la case (1-42)').setRequired(true).setMinValue(1).setMaxValue(42))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('kick')
                .setDescription('Exclure un joueur et supprimer ses donnÃ©es.')
                .addUserOption(option => option.setName('joueur').setDescription('Le joueur cible').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset_cooldown')
                .setDescription('Remet Ã  zÃ©ro le temps d\'attente d\'un joueur.')
                .addUserOption(option => option.setName('joueur').setDescription('Le joueur cible').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('tour')
                .setDescription('DÃ©finit le numÃ©ro du tour actuel.')
                .addIntegerOption(option => option.setName('numero').setDescription('Le numÃ©ro du tour').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('open_black_market')
                .setDescription('Force l\'ouverture du MarchÃ© Noir (utile si le cron a plantÃ© le dimanche).')
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
            // L'Ã©toile spawn entre la case 10 et 42 pour ne pas Ãªtre trop proche du dÃ©part
            const randomStarPos = Math.floor(Math.random() * 33) + 10; 
            
            // GÃ©nÃ©rer 4 blocs cachÃ©s sur des cases uniques (2-42)
            let blocs_pos = [];
            while(blocs_pos.length < 4) {
                let r = Math.floor(Math.random() * 41) + 2;
                if(!blocs_pos.includes(r)) blocs_pos.push(r);
            }
            const blocs_caches = {
                etoile: blocs_pos[0],
                pieces_20: blocs_pos[1],
                pieces_10: blocs_pos[2],
                pieces_5: blocs_pos[3]
            };

            let plateau = await Plateau.findByPk(1);
            if (!plateau) {
                await Plateau.create({ id: 1, position_etoile: randomStarPos, pieges_actifs: [], tour: 0, enigme_resolue: true, blocs_caches: blocs_caches });
            } else {
                await Plateau.update({ position_etoile: randomStarPos, pieges_actifs: [], tour: 0, enigme_resolue: true, blocs_caches: blocs_caches }, { where: { id: 1 } });
            }
            
            await interaction.editReply(`La saison a Ã©tÃ© rÃ©initialisÃ©e et lancÃ©e ! L'Ã‰toile est apparue sur la case ${randomStarPos}. 4 blocs cachÃ©s ont Ã©tÃ© placÃ©s secrÃ¨tement. Le prochain \`/admin lancer_enigme\` lancera le **Tour 1**.`);
        } else if (subcommand === 'lancer_enigme') {
            let plateau = await Plateau.findByPk(1);
            if (!plateau) {
                plateau = await Plateau.create({ id: 1 });
            }
            plateau.tour += 1;
            plateau.enigme_resolue = false;
            plateau.enigme_status = 'active';
            await plateau.save();
            
            let message = `ðŸ“¢ **Tour ${plateau.tour}/30** : L'Ã©nigme du jour a commencÃ© !\n\n`;
            message += `ðŸ’¡ Utilisez la commande \`/deviner [votre mot]\` pour proposer une rÃ©ponse secrÃ¨tement au MaÃ®tre du Jeu.\n`;
            message += `ðŸª™ Chaque proposition vous rapporte **1 piÃ¨ce** de participation (maximum 5 piÃ¨ces par jour) !\n`;
            message += `ðŸŽ² **Rappel :** Le plateau \`/jouer\` est verrouillÃ© tant que l'Ã©nigme n'a pas Ã©tÃ© trouvÃ©e !`;
            
            return interaction.editReply({ content: message });
        } else if (subcommand === 'stop') {
            const { endSeason } = require('../game/endgame');
            await endSeason(interaction.client);
            return interaction.editReply("La saison a été arrêtée manuellement. L'annonce finale a été postée sur le canal du plateau.");
        } else if (subcommand === 'give' || subcommand === 'remove') {
            const targetUser = interaction.options.getUser('joueur');
            const ressource = interaction.options.getString('ressource');
            const valeur = interaction.options.getString('valeur');

            let joueur = await Joueur.findByPk(targetUser.id);
            if (!joueur) {
                if (subcommand === 'remove') return interaction.editReply({ content: "Ce joueur n'existe pas dans la base de donnÃ©es.", flags: 64 });
                joueur = await Joueur.create({ discord_id: targetUser.id });
            }

            if (ressource === 'pieces' || ressource === 'etoiles') {
                const quantite = parseInt(valeur);
                if (isNaN(quantite) || quantite <= 0) return interaction.editReply({ content: "Veuillez entrer un nombre valide et positif.", flags: 64 });
                
                if (subcommand === 'give') {
                    joueur[ressource] += quantite;
                    await joueur.save();
                    await interaction.editReply(`âœ… Ajout de ${quantite} ${ressource} Ã  <@${targetUser.id}>.`);
                } else {
                    joueur[ressource] = Math.max(0, joueur[ressource] - quantite);
                    await joueur.save();
                    await interaction.editReply(`âœ… Retrait de ${quantite} ${ressource} Ã  <@${targetUser.id}>.`);
                }
            } else if (ressource === 'objet') {
                if (subcommand === 'give') {
                    const inventaire = [...joueur.inventaire];
                    if (inventaire.length < 3) {
                        inventaire.push(valeur);
                        joueur.inventaire = inventaire;
                        await joueur.save();
                        await interaction.editReply(`âœ… L'objet "${valeur}" a Ã©tÃ© donnÃ© Ã  <@${targetUser.id}>.`);
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
                        await interaction.editReply(`âœ… L'objet "${valeur}" a Ã©tÃ© retirÃ© Ã  <@${targetUser.id}>.`);
                    } else {
                        return interaction.editReply({ content: `Le joueur ne possÃ¨de pas l'objet "${valeur}".`, flags: 64 });
                    }
                }
            }
        } else if (subcommand === 'set_position') {
            const targetUser = interaction.options.getUser('joueur');
            const caseNum = interaction.options.getInteger('case');
            
            let joueur = await Joueur.findByPk(targetUser.id);
            if (!joueur) return interaction.editReply({ content: "Ce joueur n'existe pas dans la base de donnÃ©es.", flags: 64 });
            
            joueur.position = caseNum;
            await joueur.save();
            await interaction.editReply(`ðŸ“ <@${targetUser.id}> a Ã©tÃ© tÃ©lÃ©portÃ© sur la case ${caseNum}.`);
            
        } else if (subcommand === 'kick') {
            const targetUser = interaction.options.getUser('joueur');
            
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`admin_kick_confirm_${targetUser.id}`)
                        .setLabel('Oui, exclure dÃ©finitivement')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('admin_kick_cancel')
                        .setLabel('Annuler')
                        .setStyle(ButtonStyle.Secondary)
                );

            await interaction.editReply({ 
                content: `âš ï¸ **ÃŠtes-vous sÃ»r de vouloir supprimer dÃ©finitivement <@${targetUser.id}> de cette saison ?** Toutes ses donnÃ©es seront perdues.`, 
                components: [row],
                flags: 64 
            });
            
        } else if (subcommand === 'reset_cooldown') {
            const targetUser = interaction.options.getUser('joueur');
            
            let joueur = await Joueur.findByPk(targetUser.id);
            if (!joueur) return interaction.editReply({ content: "Ce joueur n'existe pas dans la base de donnÃ©es.", flags: 64 });
            
            joueur.a_le_droit_de_jouer = true;
            joueur.last_deviner_time = null;
              joueur.est_fantome = false;
              joueur.jours_inactifs = 0;
            await interaction.editReply(`â³ Le cooldown de <@${targetUser.id}> a Ã©tÃ© rÃ©initialisÃ©. Il peut rejouer immÃ©diatement.`);
            
        } else if (subcommand === 'tour') {
            const numero = interaction.options.getInteger('numero');
            await Plateau.update({ tour: numero }, { where: { id: 1 } });
            await interaction.editReply(`Le tour a Ã©tÃ© dÃ©fini sur **${numero}**.`);
        } else if (subcommand === 'open_black_market') {
            // VÃ©rification si on est dimanche
            const today = new Date();
            if (today.getDay() !== 0) {
                return interaction.editReply({ content: 'Cette commande ne peut Ãªtre utilisÃ©e que le dimanche !', flags: 64 });
            }

            // Ouverture manuelle
            const tousLesJoueurs = await Joueur.findAll();
            for (const j of tousLesJoueurs) {
                j.a_le_droit_de_jouer = true; // Plateau ouvert d'office !
                j.guess_du_jour = 0;
                j.boutique_du_jour = []; // Reset pour forcer la gÃ©nÃ©ration du marchÃ© noir
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
                await channel.send(`${mentionRole}ðŸ›ï¸ **LE MARCHÃ‰ NOIR EST OUVERT ! (Action manuelle du MJ)** ðŸ›ï¸\nLe plateau est dÃ©verrouillÃ©, aucune Ã©nigme aujourd'hui. Les boutiques proposent des objets dÃ©vastateurs exclusifs ! Utilisez \`/jouer\` pour en profiter !`);
            }

            await interaction.editReply({ content: 'âœ… Le MarchÃ© Noir a Ã©tÃ© ouvert manuellement avec succÃ¨s et tous les joueurs ont Ã©tÃ© dÃ©bloquÃ©s.', flags: 64 });
        }
    },
};

