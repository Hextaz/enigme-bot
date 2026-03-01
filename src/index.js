const { Client, GatewayIntentBits, Collection, Events, Partials } = require('discord.js');
const config = require('./config');
const { sequelize, Joueur, Plateau } = require('./db/models');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
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
});

client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`Aucune commande correspondant à ${interaction.commandName} n'a été trouvée.`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: 'Il y a eu une erreur lors de l\'exécution de cette commande !', ephemeral: true });
                } else {
                    await interaction.reply({ content: 'Il y a eu une erreur lors de l\'exécution de cette commande !', ephemeral: true });
                }
            } catch (e) {
                console.error("Impossible de répondre à l'interaction qui a échoué (déjà expirée).", e);
            }
        }
    } else if (interaction.isButton()) {
        const { handleLancerDe, handleContinuerDeplacement, handleAcheterEtoile, handlePasserEtoile } = require('./game/events');
        
        try {
            if (interaction.customId === 'lancer_de') {
                await handleLancerDe(interaction);
            } else if (interaction.customId === 'continuer_deplacement') {
                await handleContinuerDeplacement(interaction);
            } else if (interaction.customId === 'acheter_etoile') {
                await handleAcheterEtoile(interaction);
            } else if (interaction.customId === 'passer_etoile') {
                await handlePasserEtoile(interaction);
            } else if (interaction.customId === 'voir_plateau') {
                await interaction.deferReply({ ephemeral: true });
                const { generateBoardImage } = require('./utils/canvas');
                const { AttachmentBuilder } = require('discord.js');
                const tousLesJoueurs = await Joueur.findAll();
                const plateau = await Plateau.findByPk(1);
                const buffer = await generateBoardImage(tousLesJoueurs, plateau, interaction.client);
                const attachment = new AttachmentBuilder(buffer, { name: 'board.png' });
                await interaction.editReply({ files: [attachment] });
            } else if (interaction.customId === 'inventaire') {
                const joueur = await Joueur.findByPk(interaction.user.id);
                const inv = joueur && joueur.inventaire.length > 0 ? joueur.inventaire.join(', ') : 'Vide';
                await interaction.reply({ content: `🎒 **Ton inventaire :** ${inv}\n⭐ Étoiles : **${joueur ? joueur.etoiles : 0}** | 🪙 Pièces : **${joueur ? joueur.pieces : 0}**`, ephemeral: true });
            } else if (interaction.customId === 'utiliser_objet') {
                const { handleUtiliserObjet } = require('./game/events');
                await handleUtiliserObjet(interaction);
            } else if (interaction.customId.startsWith('use_')) {
                const { handleUseItem } = require('./game/events');
                await handleUseItem(interaction);
            } else if (interaction.customId.startsWith('boo_pieces') || interaction.customId.startsWith('boo_etoile')) {
                const { handleBooChoice } = require('./game/events');
                await handleBooChoice(interaction);
            } else if (interaction.customId.startsWith('buy_')) {
                const itemId = interaction.customId.split('_')[1];
                if (itemId === 'cancel') {
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
                    return interaction.reply({ content: "Ce bouton n'est pas pour toi.", ephemeral: true });
                }
                
                const joueur = await Joueur.findByPk(userId);
                if (!joueur || !joueur.last_deviner_time) return interaction.reply({ content: "Erreur lors de la récupération du cooldown.", ephemeral: true });
                
                const COOLDOWN_MINUTES = 15;
                const now = new Date();
                const diffMs = now - new Date(joueur.last_deviner_time);
                const diffMins = Math.floor(diffMs / 60000);
                const remainingMins = COOLDOWN_MINUTES - diffMins;
                
                if (remainingMins > 0) {
                    await interaction.reply({ content: `D'accord ! Je t'enverrai un MP dans environ ${remainingMins} minute(s).`, ephemeral: true });
                    
                    setTimeout(async () => {
                        try {
                            await interaction.user.send("🔔 **Ding Dong !** Ton cooldown est terminé, tu peux à nouveau utiliser `/deviner` !");
                        } catch (e) {
                            console.error(`Impossible d'envoyer le MP de rappel à ${interaction.user.tag} (MP bloqués).`);
                        }
                    }, remainingMins * 60000);
                } else {
                    await interaction.reply({ content: "Ton cooldown est déjà terminé, tu peux jouer !", ephemeral: true });
                }
            } else if (interaction.customId.startsWith('reponse_')) {
                // Format: reponse_good_userId_mot ou reponse_bad_userId_mot
                const parts = interaction.customId.split('_');
                const action = parts[1]; // 'good' ou 'bad'
                const userId = parts[2];
                const mot = parts.slice(3).join('_'); // Reconstruct word if it had underscores
                
                const plateau = await Plateau.findByPk(1);
                const channelId = plateau.enigme_channel_id || config.enigmaChannelId;
                const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
                
                if (!channel) {
                    return interaction.reply({ content: "Erreur : Salon d'énigme introuvable.", ephemeral: true });
                }

                if (action === 'bad') {
                    await channel.send(`❌ <@${userId}> a proposé "**${mot}**", mais ce n'est pas ça !`);
                    await interaction.reply({ content: `Tu as refusé la proposition de <@${userId}>.`, ephemeral: true });
                    
                    // Update the original message to show it was processed
                    const embed = interaction.message.embeds[0];
                    const newEmbed = { ...embed.data, color: 0xe74c3c, title: 'Proposition refusée' };
                    await interaction.message.edit({ embeds: [newEmbed], components: [] });
                    
                } else if (action === 'good') {
                    if (plateau.enigme_status === 'active') {
                        // Premier gagnant
                        plateau.enigme_status = 'countdown';
                        plateau.enigme_reponse = mot;
                        plateau.premier_gagnant = userId;
                        await plateau.save();
                        
                        await channel.send(`🚨 **QUELQU'UN A TROUVÉ LA BONNE RÉPONSE !**\nLe compte à rebours est lancé. Il vous reste **30 minutes** pour faire un dernier \`/deviner\` et tenter de gagner des pièces !`);
                        await interaction.reply({ content: `Tu as validé la proposition de <@${userId}>. Le compte à rebours de 30 minutes est lancé !`, ephemeral: true });
                        
                        // Update the original message
                        const embed = interaction.message.embeds[0];
                        const newEmbed = { ...embed.data, color: 0x2ecc71, title: 'Proposition validée (Premier)' };
                        await interaction.message.edit({ embeds: [newEmbed], components: [] });

                        // Lancer le timer de 30 minutes
                        setTimeout(async () => {
                            const p = await Plateau.findByPk(1);
                            if (p.enigme_status === 'countdown') {
                                p.enigme_status = 'finished';
                                await p.save();
                                
                                let finalMsg = `⏰ **FIN DU TEMPS !** La bonne réponse était : **${p.enigme_reponse}**\n\n`;
                                finalMsg += `🏆 <@${p.premier_gagnant}> a été le plus rapide et remporte **10 pièces** !\n`;
                                
                                // Récompenser le premier gagnant
                                const premierJoueur = await Joueur.findByPk(p.premier_gagnant);
                                if (premierJoueur) {
                                    premierJoueur.pieces += 10;
                                    premierJoueur.a_le_droit_de_jouer = true;
                                    await premierJoueur.save();
                                }

                                // Récompenser les autres gagnants
                                if (p.autres_gagnants && p.autres_gagnants.length > 0) {
                                    const autresMentions = p.autres_gagnants.map(id => `<@${id}>`).join(', ');
                                    finalMsg += `👏 ${autresMentions} ont également trouvé la réponse à temps et remportent **5 pièces** !\n`;
                                    
                                    for (const id of p.autres_gagnants) {
                                        const j = await Joueur.findByPk(id);
                                        if (j) {
                                            j.pieces += 5;
                                            j.a_le_droit_de_jouer = true;
                                            await j.save();
                                        }
                                    }
                                }
                                
                                finalMsg += `\n🎲 **Le plateau est maintenant ouvert !** Vous pouvez utiliser \`/jouer\`.`;
                                
                                if (config.roleEnigmeId) {
                                    finalMsg = `<@&${config.roleEnigmeId}>\n` + finalMsg;
                                }

                                await channel.send(finalMsg);
                                
                                // Donner le droit de jouer à tout le monde
                                await Joueur.update({ a_le_droit_de_jouer: true }, { where: {} });
                            }
                        }, 30 * 60000); // 30 minutes

                    } else if (plateau.enigme_status === 'countdown') {
                        // Autres gagnants pendant le compte à rebours
                        if (userId !== plateau.premier_gagnant && !plateau.autres_gagnants.includes(userId)) {
                            const autres = [...plateau.autres_gagnants, userId];
                            plateau.autres_gagnants = autres;
                            await plateau.save();
                        }
                        await interaction.reply({ content: `Tu as validé la proposition de <@${userId}>. Il a été ajouté à la liste des gagnants.`, ephemeral: true });
                        
                        const embed = interaction.message.embeds[0];
                        const newEmbed = { ...embed.data, color: 0x2ecc71, title: 'Proposition validée (Retardataire)' };
                        await interaction.message.edit({ embeds: [newEmbed], components: [] });
                    } else {
                        await interaction.reply({ content: "L'énigme est déjà terminée.", ephemeral: true });
                    }
                }
            } else if (interaction.customId.startsWith('admin_kick_confirm_')) {
                const userId = interaction.customId.split('_')[3];
                await Joueur.destroy({ where: { discord_id: userId } });
                await interaction.update({ content: `✅ Le joueur <@${userId}> a été définitivement supprimé de la base de données.`, components: [] });
            } else if (interaction.customId === 'admin_kick_cancel') {
                await interaction.update({ content: `❌ L'exclusion a été annulée.`, components: [] });
            }
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'Une erreur est survenue lors de l\'action.', ephemeral: true });
        }    } else if (interaction.isStringSelectMenu()) {
        try {
            if (interaction.customId.startsWith('boo_target_')) {
                const { handleBooTarget } = require('./game/events');
                await handleBooTarget(interaction);
            } else if (interaction.customId === 'de_pipe_choix') {
                const { handleDePipeChoix } = require('./game/events');
                await handleDePipeChoix(interaction);
            }
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'Erreur lors de la sélection.', ephemeral: true });
        }    } else if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('modal_pari_')) {
            const { handleModalPari } = require('./game/cron');
            try {
                await handleModalPari(interaction);
            } catch (error) {
                console.error(error);
                await interaction.reply({ content: 'Erreur lors de l\'enregistrement du pari.', ephemeral: true });
            }
        }
    }
});

// Gestion des messages (Énigme du jour)
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;

    // Déclencheur : Le MJ poste un message commençant par "# Enigme du jour" dans le salon #énigme
    if (message.channelId === config.enigmaChannelId && message.content.startsWith('# Enigme du jour')) {
        // Le MJ a posté l'énigme
        // Incrémenter le tour
        let plateau = await Plateau.findByPk(1);
        if (!plateau) {
            plateau = await Plateau.create({ id: 1 });
        }
        plateau.tour += 1;
        plateau.enigme_resolue = false;
        await plateau.save();

        await message.channel.send(`📢 **Tour ${plateau.tour}/30** : L'énigme du jour a commencé ! Proposez vos réponses pour gagner des pièces bonus. Tout le monde a 1 jet de dé par jour via \`/jouer\` !`);
        return;
    }

    // Si on est dans le salon énigme et que ce n'est pas le MJ qui poste l'énigme
    if (message.channelId === config.enigmaChannelId) {
        // Vérifier si l'auteur est le MJ ou le bot
        if (message.author.id === config.mjUserId || message.author.bot) {
            return; // Le MJ et le bot ne gagnent pas de pièces en parlant
        }

        const plateau = await Plateau.findByPk(1);
        if (plateau && plateau.enigme_resolue) {
            return; // L'énigme est déjà résolue, on ne donne plus de pièces
        }

        // Le bot détecte le déclencheur et commence à écouter.
        // Il donne +1 pièce par proposition (max 5 pièces/jour/joueur).
        // La variable a_le_droit_de_jouer du joueur passe sur Vrai.
        
        let joueur = await Joueur.findByPk(message.author.id);
        if (!joueur) {
            joueur = await Joueur.create({ 
                discord_id: message.author.id,
                a_le_droit_de_jouer: true // Nouveau joueur, il a le droit de jouer
            });
        }

        if (joueur.guess_du_jour < 5) {
            joueur.pieces += 1;
            joueur.guess_du_jour += 1;
            await message.react('🪙'); // Réaction pour confirmer le gain
        }
        await joueur.save();
    }
});

// Gestion des réactions (Victoire)
client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('Quelque chose s\'est mal passé lors de la récupération du message :', error);
            return;
        }
    }

    // Le MJ valide la bonne réponse avec la réaction ✅
    if (reaction.message.channelId === config.enigmaChannelId && reaction.emoji.name === '✅') {
        // Vérifier si l'utilisateur qui a réagi est le MJ
        if (user.id === config.mjUserId) {
            const plateau = await Plateau.findByPk(1);
            if (plateau) {
                plateau.enigme_resolue = true;
                await plateau.save();
            }

            const gagnantId = reaction.message.author.id;
            let joueur = await Joueur.findByPk(gagnantId);
            if (!joueur) {
                joueur = await Joueur.create({ discord_id: gagnantId });
            }
            
            joueur.pieces += 10;
            await joueur.save();
            
            const tousLesJoueurs = await Joueur.findAll();
            const participants = tousLesJoueurs.filter(j => j.guess_du_jour > 0);
            
            let recapMsg = `🎉 **Félicitations <@${gagnantId}> !** Tu as trouvé la bonne réponse et remporté **10 pièces** !\n\n`;
            recapMsg += `📊 **Récapitulatif des gains de participation :**\n`;
            
            if (participants.length > 0) {
                participants.forEach(p => {
                    recapMsg += `- <@${p.discord_id}> : +${p.guess_du_jour} pièce(s)\n`;
                });
            } else {
                recapMsg += `*Aucun participant n'a gagné de pièces de participation aujourd'hui.*\n`;
            }
            
            recapMsg += `\nVous pouvez maintenant utiliser la commande \`/jouer\` pour avancer sur le plateau !`;

            await reaction.message.channel.send(recapMsg);
        }
    }

    // Le MJ annule un guess avec la réaction 🛑
    if (reaction.message.channelId === config.enigmaChannelId && reaction.emoji.name === '🛑') {
        if (user.id === config.mjUserId) {
            const cibleId = reaction.message.author.id;
            let joueur = await Joueur.findByPk(cibleId);
            
            if (joueur && joueur.guess_du_jour > 0) {
                joueur.pieces = Math.max(0, joueur.pieces - 1);
                joueur.guess_du_jour -= 1;
                await joueur.save();
                
                // Retirer la réaction 🪙 du bot si elle existe
                const botReaction = reaction.message.reactions.cache.get('🪙');
                if (botReaction && botReaction.users.cache.has(client.user.id)) {
                    await botReaction.users.remove(client.user.id);
                }
            }
        }
    }
});

// Capture globale des promesses rejetées pour éviter un crash total de l'application
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught Exception:', error);
});

client.login(config.token);
