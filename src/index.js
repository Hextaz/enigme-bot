const { Client, GatewayIntentBits, Collection, Events, Partials, Options } = require('discord.js');
const config = require('./config');
const { sequelize, Joueur, Plateau } = require('./db/models');
const { lockUser, unlockUser, getLockedUser } = require('./game/transaction');
const { activeInteractionTokens } = require('./game/events');
const fs = require('fs');
const path = require('path');

// Gestion globale des erreurs non interceptées pour éviter le crash du bot
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
    makeCache: Options.cacheWithLimits({
        ...Options.DefaultMakeCacheSettings,
        MessageManager: 20,
        ThreadManager: 10,
        PresenceManager: 0,
        VoiceStateManager: 0,
        ReactionManager: 10,
        GuildMemberManager: 50,
        UserManager: 50,
    }),
    rest: { timeout: 60000 }, // Augmente le timeout de l'API REST à 60s
});

client.commands = new Collection();

// Charger les commandes
const commandsPath = path.join(__dirname, 'commands');
if (!fs.existsSync(commandsPath)) {
    fs.mkdirSync(commandsPath);
}
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        console.log(`[WARNING] La commande à ${filePath} manque une propriété "data" ou "execute".`);
    }
}

client.once(Events.ClientReady, async c => {
    console.log(`Prêt ! Connecté en tant que ${c.user.tag}`);

    try {
        const guild = await c.guilds.fetch(config.guildId).catch(() => null);
        if (guild) {
            let winnerRole = await guild.roles.fetch('1490005606273388555').catch(() => null);
            if (!winnerRole) {
                console.log(`[WARNING] Le rôle vainqueur 1490005606273388555 est introuvable.`);
            } else {
                console.log(`Rôle vainqueur trouvé.`);
            }
        }
    } catch (e) {
        console.error("Erreur lors de la vérification du rôle vainqueur:", e);
    }

    // Synchroniser la base de données
    await sequelize.sync({ alter: true });
    console.log('Base de données synchronisée.');

    // Initialiser le plateau s'il n'existe pas
    const plateau = await Plateau.findByPk(1);
    if (!plateau) {
        await Plateau.create({ id: 1, position_etoile: 1, pieges_actifs: [] });
    }

    // Initialiser les tâches planifiées (CRON)
    const { initCronJobs } = require('./game/cron');
    initCronJobs(client);

    // Relancer le minuteur de l'énigme s'il y a eu un redémarrage
    if (plateau && plateau.enigme_status === 'countdown' && plateau.fin_enigme_timestamp) {
        const remainingMs = plateau.fin_enigme_timestamp - Date.now();
        if (remainingMs <= 0) {
            console.log("Le temps de l'énigme est déjà écoulé, clôture immédiate...");
            triggerEnigmaEnd(client);
        } else {
            console.log(`Reprise du compte à rebours de l'énigme : il reste ${Math.floor(remainingMs / 60000)} minutes.`);
            setTimeout(() => triggerEnigmaEnd(client), remainingMs);
        }
    }
});

const processingUsers = new Set();

client.on(Events.InteractionCreate, async interaction => {
  console.log(`[INTERACTION] ${interaction.user?.id} - ${interaction.customId || interaction.commandName} - ${new Date().toISOString()}`);
    // --- L'ACCES SE FAIT ICI POUR LE MUTEX GLOBAL ---
    const isGameCommand = interaction.isChatInputCommand() && ['jouer'].includes(interaction.commandName);
    
    let isGameAction = false;
    if (interaction.isButton()) {
        const id = interaction.customId;
        isGameAction = (!id || (!id.startsWith('rappel_') && !id.startsWith('pari_') && !id.startsWith('reponse_') && !id.startsWith('admin_')));
    } else if (interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
        isGameAction = true;
    }

    if (isGameCommand || isGameAction) {
        if (processingUsers.has(interaction.user.id)) return interaction.reply({ content: "? Ton action pr�c�dente est en cours de traitement !", flags: 64 }).catch(()=>{});
        const lockedId = getLockedUser();
        if (lockedId && lockedId !== interaction.user.id) return interaction.reply({ content: "? Un autre joueur effectue actuellement son action !", flags: 64 }).catch(()=>{});
        processingUsers.add(interaction.user.id);
        lockUser(interaction.user.id);
    }

    try {
    if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`Aucune commande correspondant à ${interaction.commandName} n'a été trouvée.`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            if (error.code === 10062) console.warn('[Timeout] Interaction (ChatInputCommand) a expiré avant réponse (10062).');
            else console.error(error);
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: 'Il y a eu une erreur lors de l\'exécution de cette commande !', flags: 64 });
                } else {
                    await interaction.reply({ content: 'Il y a eu une erreur lors de l\'exécution de cette commande !', flags: 64 });
                }
            } catch (e) {
                if (e.code !== 10062) console.error("Impossible de répondre à l'interaction qui a échoué.", e);
            }
        }
    } else if (interaction.isButton()) {
        const { handleLancerDe, handleContinuerDeplacement, handleAcheterEtoile, handlePasserEtoile, handleUnblockFantome } = require('./game/events');

        try {
            if (interaction.customId === 'unblock_fantome') {
                await handleUnblockFantome(interaction);
            } else if (interaction.customId === 'lancer_de') {
                await handleLancerDe(interaction);
            } else if (interaction.customId.startsWith('choix_direction_')) {
                const { handleDirectionChoice } = require('./game/events');
                await handleDirectionChoice(interaction);
            } else if (interaction.customId === 'continuer_deplacement') {
                await handleContinuerDeplacement(interaction);
            } else if (interaction.customId === 'acheter_etoile') {
                await handleAcheterEtoile(interaction);
            } else if (interaction.customId === 'passer_etoile') {
                await handlePasserEtoile(interaction);
            } else if (interaction.customId === 'voir_plateau') {
                await interaction.deferReply({ flags: 64 });
                const { generateBoardImage } = require('./utils/canvas');
                const { AttachmentBuilder } = require('discord.js');
                const tousLesJoueurs = await Joueur.findAll();
                const plateau = await Plateau.findByPk(1);
                const buffer = await generateBoardImage(tousLesJoueurs, plateau, interaction.client);
                const attachment = new AttachmentBuilder(buffer, { name: 'board.png' });
                await interaction.editReply({ files: [attachment] });
            } else if (interaction.customId === 'inventaire') {
                await interaction.deferReply({ flags: 64 }).catch(()=>{});
                const joueur = await Joueur.findByPk(interaction.user.id);
                const inv = joueur && joueur.inventaire.length > 0 ? joueur.inventaire.join(', ') : 'Vide';
                await interaction.editReply({ content: `🎒 **Ton inventaire :** ${inv}\n⭐ Étoiles : **${joueur ? joueur.etoiles : 0}** | 🪙 Pièces : **${joueur ? joueur.pieces : 0}**` });
            } else if (interaction.customId === 'utiliser_objet') {
                const { handleUtiliserObjet } = require('./game/events');
                await handleUtiliserObjet(interaction);
            } else if (interaction.customId.startsWith('use_')) {
                const { handleUseItem } = require('./game/events');
                await handleUseItem(interaction);
            } else if (interaction.customId.startsWith('boo_pieces') || interaction.customId.startsWith('boo_etoile') || interaction.customId.startsWith('boo_annuler')) {
                const { handleBooChoice } = require('./game/events');
                await handleBooChoice(interaction);
            } else if (interaction.customId === 'discard_new_item') {
                await interaction.update({ content: 'Tu as choisi de garder ton inventaire tel quel. Le nouvel objet est jeté.', components: [] }).catch(()=>{});
            } else if (interaction.customId.startsWith('buy_')) {
                // e.g. buy_cancel or buy_sifflet or buy_piege_pieces
                if (interaction.customId === 'buy_cancel') {
                    const { handleBuyCancel } = require('./game/events');
                    await handleBuyCancel(interaction);
                    return;
                }
                const { handleBuyItem } = require('./game/events');
                await handleBuyItem(interaction);
            } else if (interaction.customId.startsWith('pari_')) {
                const { handlePari } = require('./game/cron');
                await handlePari(interaction);
            } else if (interaction.customId.startsWith('rappel_deviner_')) {
                const userId = interaction.customId.split('_')[2];
                if (interaction.user.id !== userId) {
                    return interaction.reply({ content: "Ce bouton n'est pas pour toi.", flags: 64 });
                }
                
                const joueur = await Joueur.findByPk(userId);
                if (!joueur || !joueur.last_deviner_time) return interaction.reply({ content: "Erreur lors de la récupération du cooldown.", flags: 64 });
                
                const COOLDOWN_MINUTES = 30;
                const now = new Date();
                const diffMs = now - new Date(joueur.last_deviner_time);
                const diffMins = Math.floor(diffMs / 60000);
                const remainingMins = COOLDOWN_MINUTES - diffMins;
                
                if (remainingMins > 0) {
                    await interaction.reply({ content: `D'accord ! Je t'enverrai un MP dans environ ${remainingMins} minute(s).`, flags: 64 });
                    
                    setTimeout(async () => {
                        try {
                            await interaction.user.send("🔔 **Ding Dong !** Ton cooldown est terminé, tu peux à nouveau utiliser `/deviner` !");
                        } catch (e) {
                            console.error(`Impossible d'envoyer le MP de rappel à ${interaction.user.tag} (MP bloqués).`);
                        }
                    }, remainingMins * 60000);
                } else {
                    await interaction.reply({ content: "Ton cooldown est déjà terminé, tu peux jouer !", flags: 64 });
                }
            } else if (interaction.customId.startsWith('reponse_')) {
                await interaction.deferReply({ flags: 64 });
                // Format: reponse_good_userId_mot ou reponse_bad_userId_mot
                const parts = interaction.customId.split('_');
                const action = parts[1]; // 'good' ou 'bad'
                const userId = parts[2];
                const mot = parts.slice(3).join('_'); // Reconstruct word if it had underscores
                
                const plateau = await Plateau.findByPk(1);
                const channelId = config.enigmaChannelId;
                const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
                
                if (!channel) {
                    return interaction.editReply({ content: "Erreur : Salon d'énigme introuvable." });
                }

                if (action === 'bad') {
                    // Create the rejected embed
                    const embed = interaction.message.embeds[0];
                    const newEmbed = { ...embed.data, color: 0xe74c3c, title: 'Proposition refusée' };

                    // Send the embed to the enigma channel
                    await channel.send({ embeds: [newEmbed] });

                    await interaction.editReply({ content: `Tu as refusé la proposition de <@${userId}>.` });
                    
                    // Update the original PM message to show it was processed
                    await interaction.message.edit({ embeds: [newEmbed], components: [] });
                    
                } else if (action === 'spam') {
                    // Create the rejected embed
                    const embed = interaction.message.embeds[0];
                    const newEmbed = { ...embed.data, color: 0xe74c3c, title: 'Proposition refusée (Non conforme)' };

                    // Send the embed to the enigma channel
                    await channel.send({ embeds: [newEmbed] });

                    // Puni le try guess random en supprimant 1 piece
                    const p_joueur = await Joueur.findByPk(userId);
                    if (p_joueur && p_joueur.pieces > 0) {
                        p_joueur.pieces -= 1;
                        await p_joueur.save();
                    }

                    await interaction.editReply({ content: `Tu as refusé la proposition non conforme de <@${userId}> et 1 pièce de participation lui a été retirée.` });
                    
                    // Update the original PM message to show it was processed
                    await interaction.message.edit({ embeds: [newEmbed], components: [] });
                    
                } else if (action === 'good') {
                    if (plateau.enigme_status === 'active') {
                        // Premier gagnant
                        plateau.enigme_status = 'countdown';
                        plateau.enigme_reponse = mot;
                        plateau.premier_gagnant = userId;
                        await plateau.save();
                        
                        const roleMention = config.roleEnigmeId ? `<@&${config.roleEnigmeId}> ` : '';
                        await channel.send(`${roleMention}🚨 **<@${userId}> A TROUVÉ L'ÉNIGME !**\nLe compte à rebours est lancé. Il vous reste **30 minutes** pour faire un dernier \`/deviner\` et tenter de gagner des pièces !`);
                        await interaction.editReply({ content: `Tu as validé la proposition de <@${userId}>. Le compte à rebours de 30 minutes est lancé !` });
                        
                        // Update the original message
                        const embed = interaction.message.embeds[0];
                        const newEmbed = { ...embed.data, color: 0x2ecc71, title: 'Proposition validée (Premier)' };
                        await interaction.message.edit({ embeds: [newEmbed], components: [] });

                        plateau.fin_enigme_timestamp = Date.now() + 30 * 60000; await plateau.save(); setTimeout(() => triggerEnigmaEnd(interaction.client), 30 * 60000);
                    } else if (plateau.enigme_status === 'countdown') {
                        // Autres gagnants pendant le compte à rebours
                        if (userId !== plateau.premier_gagnant && !plateau.autres_gagnants.includes(userId)) {
                            const autres = [...plateau.autres_gagnants, userId];
                            plateau.autres_gagnants = autres;
                            await plateau.save();
                            await channel.send(`🎉 **<@${userId}> a également trouvé la réponse !**`);
                        }
                        await interaction.editReply({ content: `Tu as validé la proposition de <@${userId}>. Il a été ajouté à la liste des gagnants.` });
                        
                        const embed = interaction.message.embeds[0];
                        const newEmbed = { ...embed.data, color: 0x2ecc71, title: 'Proposition validée (Retardataire)' };
                        await interaction.message.edit({ embeds: [newEmbed], components: [] });
                    } else if (plateau.enigme_status === 'finished') {
                        // Si le MJ valide en retard (après la fin du chrono) mais que le joueur a posté à temps
                        const j = await Joueur.findByPk(userId);
                        if (j) {
                            j.pieces += 5;
                            // S'assurer qu'il a le droit de jouer car le plateau a sûrement déjà ouvert
                            j.a_le_droit_de_jouer = true;
                            j.stat_enigmes_trouvees = (j.stat_enigmes_trouvees || 0) + 1;
                            await j.save();
                        }

                        const embed = interaction.message.embeds[0];
                        const newEmbed = { ...embed.data, color: 0x2ecc71, title: 'Proposition validée (Retardataire)' };
                        await interaction.message.edit({ embeds: [newEmbed], components: [] });
                    } else {
                        await interaction.editReply({ content: "L'énigme n'est pas active." });
                    }
                }
            } else if (interaction.customId.startsWith('admin_kick_confirm_')) {
                await interaction.deferUpdate();
                const userId = interaction.customId.split('_')[3];
                await Joueur.destroy({ where: { discord_id: userId } });
                await interaction.editReply({ content: `✅ Le joueur <@${userId}> a été définitivement supprimé de la base de données.`, components: [] });
            } else if (interaction.customId === 'admin_kick_cancel') {
                await interaction.update({ content: `❌ L'exclusion a été annulée.`, components: [] });
            }
        } catch (error) {
            if (error.code === 10062) console.warn('[Timeout] Interaction (Button) a expiré avant réponse (10062).');
            else console.error(error);
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: 'Une erreur est survenue lors de l\'action.', flags: 64 });
                } else {
                    await interaction.reply({ content: 'Une erreur est survenue lors de l\'action.', flags: 64 });
                }
            } catch (e) {
                if (e.code !== 10062) console.error("Impossible de répondre à l'interaction Button.", e);
            }
        }    } else if (interaction.isStringSelectMenu()) {
        try {
            if (interaction.customId.startsWith('boo_target_')) {
                const { handleBooTarget } = require('./game/events');
                await handleBooTarget(interaction);
            } else if (interaction.customId === 'de_pipe_choix') {
                const { handleDePipeChoix } = require('./game/events');
                await handleDePipeChoix(interaction);
            } else if (interaction.customId.startsWith('replace_buy_')) {
                const { handleReplaceBuy } = require('./game/events');
                await handleReplaceBuy(interaction);
            } else if (interaction.customId.startsWith('replace_chance_')) {
                const { handleReplaceChance } = require('./game/events');
                await handleReplaceChance(interaction);}
        } catch (error) {
            if (error.code === 10062) console.warn('[Timeout] Interaction (SelectMenu) a expiré avant réponse (10062).');
            else console.error(error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'Erreur lors de la sélection.', flags: 64 }).catch(e => {
                    if (e.code !== 10062) console.error("Impossible de répondre SelectMenu:", e);
                });
            }
        }    } else if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('modal_pari_')) {
            const { handleModalPari } = require('./game/cron');
            try {
                await handleModalPari(interaction);
            } catch (error) {
                if (error.code === 10062) console.warn('[Timeout] Interaction (Modal) a expiré avant réponse (10062).');
                else console.error(error);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: 'Erreur lors de l\'enregistrement du pari.', flags: 64 }).catch(e => {
                        if (e.code !== 10062) console.error("Impossible de répondre Modal:", e);
                    });
                }
            }
        }
            }
    } finally {
        if (isGameCommand || isGameAction) {
            processingUsers.delete(interaction.user.id);
            if (!activeInteractionTokens || !activeInteractionTokens.has(interaction.user.id)) {
                unlockUser(interaction.user.id);
            }
        }
    }
});

// Gestion des messages (Énigme du jour)


async function triggerEnigmaEnd(client) {
    const { Joueur, Plateau } = require('./db/models');
    const config = require('./config');
    try {
        const p = await Plateau.findByPk(1);
        if (!p || p.enigme_status !== 'countdown') return;

        p.enigme_status = 'finished';
        p.fin_enigme_timestamp = null;
        await p.save();

        const channelId = config.enigmaChannelId;
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return;

        let finalMsg = '⏰ **FIN DU TEMPS !** La bonne réponse était : **' + p.enigme_reponse + '**\n\n';
        finalMsg += '🏆 <@' + p.premier_gagnant + '> a été le plus rapide et remporte **10 pièces** !\n';

        const premierJoueur = await Joueur.findByPk(p.premier_gagnant);
        if (premierJoueur) {
            premierJoueur.pieces += 10;
            premierJoueur.a_le_droit_de_jouer = true;
            premierJoueur.stat_enigmes_trouvees = (premierJoueur.stat_enigmes_trouvees || 0) + 1;
            await premierJoueur.save();
        }

        if (p.autres_gagnants && p.autres_gagnants.length > 0) {
            const autresMentions = p.autres_gagnants.map(id => '<@' + id + '>').join(', ');
            finalMsg += '👏 ' + autresMentions + ' ont également trouvé la réponse à temps et remportent **5 pièces** !\n';

            for (const id of p.autres_gagnants) {
                const j = await Joueur.findByPk(id);
                if (j) {
                    j.pieces += 5;
                    j.a_le_droit_de_jouer = true;
                    j.stat_enigmes_trouvees = (j.stat_enigmes_trouvees || 0) + 1;
                    await j.save();
                }
            }
        }
        finalMsg += '\n🎲 **Le plateau est maintenant ouvert !** Vous pouvez utiliser `/jouer`.';

        if (config.roleEnigmeId) {
            finalMsg = '<@&' + config.roleEnigmeId + '>\n' + finalMsg;
        }

        await channel.send(finalMsg);
        await Joueur.update({ a_le_droit_de_jouer: true }, { where: {} });
    } catch(err) {
        console.error('Erreur dans triggerEnigmaEnd:', err);
    }
}

client.login(config.token);
