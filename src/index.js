const { Client, GatewayIntentBits, Collection, Events, Partials, Options } = require('discord.js');
const config = require('./config');
const { sequelize, Joueur, Plateau } = require('./db/models');
const { lockUser, unlockUser, getLockedUser, getLockInfo } = require('./game/transaction');
const { triggerEnigmaEnd } = require('./game/enigma');
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
  rest: { timeout: 60000 },
});

// Connection status tracking for health checks
let isReady = false;

// Handle WebSocket errors
client.on(Events.Error, error => {
  console.error('Discord client error:', error);
});

client.on(Events.ShardError, error => {
  console.error('Discord shard error:', error);
});

// Handle disconnection
client.on(Events.Disconnect, () => {
  isReady = false;
  console.warn('Discord client disconnected. Attempting to reconnect...');
});

// Handle reconnection
client.on(Events.Reconnecting, () => {
  console.warn('Discord client reconnecting...');
});

// Handle successful resume
client.on(Events.Resume, () => {
  isReady = true;
  console.log('Discord client resumed connection.');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  client.destroy().then(() => process.exit(0));
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  client.destroy().then(() => process.exit(0));
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
  isReady = true;

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

  // Restart safety : reprendre les timers de l'énigme si le bot a redémarré
  const p = await Plateau.findByPk(1);
  if (p) {
    if (p.enigme_status === 'active' && p.fin_enigme_timestamp) {
      const remainingMs = p.fin_enigme_timestamp - Date.now();
      if (remainingMs <= 0) {
        console.log("[RESTART] L'énigme est déjà terminée, clôture immédiate...");
        await triggerEnigmaEnd(client);
      } else {
        console.log(`[RESTART] Reprise du timer de fin d'énigme : il reste ${Math.floor(remainingMs / 60000)} minutes.`);
        setTimeout(() => triggerEnigmaEnd(client), remainingMs);
      }
      // Reprendre aussi les indices non publiés
      const nowParis = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
      const hourParis = nowParis.getHours();
      const enigmaChannel = client.channels.cache.get(config.enigmaChannelId);

      if (enigmaChannel) {
        const roleMention = config.roleEnigmeId ? `<@&${config.roleEnigmeId}> ` : '';
        if (hourParis >= 18 && p.enigme_indice1 && !p.indice1_publie) {
          await enigmaChannel.send(`${roleMention}💡 **Indice 1 (18h) :** ${p.enigme_indice1}`);
          p.indice1_publie = true;
          await p.save();
        }
        if (hourParis >= 19 && p.enigme_indice2 && !p.indice2_publie) {
          await enigmaChannel.send(`${roleMention}💡 **Indice 2 (19h) :** ${p.enigme_indice2}`);
          p.indice2_publie = true;
          await p.save();
        }
        if (hourParis >= 20 && p.enigme_indice3 && !p.indice3_publie) {
          await enigmaChannel.send(`${roleMention}💡 **Indice 3 (20h) :** ${p.enigme_indice3}`);
          p.indice3_publie = true;
          await p.save();
        }
      }
    } else if (p.enigme_status === 'programmee') {
      // L'énigme est programmée mais pas encore publiée
      // Le cron s'en charge à 17h, mais si le bot redémarre après 17h sans que le cron ait tourné
      console.log("[RESTART] Enigme programmée en attente de publication par le cron à 17h.");
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
    const id = interaction.customId;
    isGameAction = (!id || (!id.startsWith('admin_') && !id.startsWith('modal_programmer_enigme_')));
  }

  if (isGameCommand || isGameAction) {
    if (processingUsers.has(interaction.user.id)) {
      console.log(`[LOCK] Utilisateur ${interaction.user.id} déjà en cours de traitement`);
      return interaction.reply({ content: "? Ton action précédente est en cours de traitement !", flags: 64 }).catch(()=>{});
    }

    const lockedId = getLockedUser();
    if (lockedId && lockedId !== interaction.user.id) {
      const lockInfo = getLockInfo();
      const lockAge = lockInfo ? Math.floor(lockInfo.duration / 1000) : 'inconnu';
      console.log(`[LOCK] Action refusée pour ${interaction.user.id} - verrou détenu par ${lockedId} (depuis ${lockAge}s)`);
      return interaction.reply({ content: "? Un autre joueur effectue actuellement son action !", flags: 64 }).catch(()=>{});
    }

    processingUsers.add(interaction.user.id);
    const lockAcquired = lockUser(interaction.user.id);
    if (!lockAcquired) {
      console.error(`[LOCK] Échec de l'acquisition du verrou pour ${interaction.user.id}`);
      processingUsers.delete(interaction.user.id);
      return interaction.reply({ content: "? Erreur de verrouillage. Veuillez réessayer.", flags: 64 }).catch(()=>{});
    }
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
        if (error.code === 10062) {
          console.warn('[Timeout] Interaction (ChatInputCommand) a expiré avant réponse (10062).');
        } else {
          console.error('[ERROR] Erreur lors de l\'exécution de la commande:', error);
        }
        try {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'Il y a eu une erreur lors de l\'exécution de cette commande !', flags: 64 });
          } else {
            await interaction.reply({ content: 'Il y a eu une erreur lors de l\'exécution de cette commande !', flags: 64 });
          }
        } catch (e) {
          if (e.code !== 10062) {
            console.error("[ERROR] Impossible de répondre à l'interaction qui a échoué:", e);
          } else {
            console.warn('[Timeout] Impossible de répondre - interaction déjà expirée (10062).');
          }
        }
      }
    } else if (interaction.isButton()) {
      const { handleLancerDe, handleContinuerDeplacement, handleAcheterEtoile, handlePasserEtoile, handleUnblockFantome } = require('./game/events');

      try {
        if (interaction.customId.startsWith('admin_start_confirm::')) {
          await handleAdminStartConfirm(interaction);
        } else if (interaction.customId === 'admin_start_cancel') {
          await handleAdminStartCancel(interaction);
        } else if (interaction.customId === 'unblock_fantome') {
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

          await interaction.deferReply({ flags: 64 });

          const joueur = await Joueur.findByPk(userId);
          if (!joueur || !joueur.last_deviner_time) {
            return interaction.editReply({ content: "Erreur lors de la récupération du cooldown." });
          }

          const COOLDOWN_MINUTES = 30;
          const now = new Date();
          const diffMs = now - new Date(joueur.last_deviner_time);
          const diffMins = Math.floor(diffMs / 60000);
          const remainingMins = COOLDOWN_MINUTES - diffMins;

          if (remainingMins > 0) {
            await interaction.editReply({ content: `D'accord ! Je t'enverrai un MP dans environ ${remainingMins} minute(s).` });

            setTimeout(async () => {
              try {
                await interaction.user.send("🔔 **Ding Dong !** Ton cooldown est terminé, tu peux à nouveau utiliser `/deviner` !");
              } catch (e) {
                console.error(`Impossible d'envoyer le MP de rappel à ${interaction.user.tag} (MP bloqués).`);
              }
            }, remainingMins * 60000);
          } else {
            await interaction.editReply({ content: "Ton cooldown est déjà terminé, tu peux jouer !" });
          }
        } else if (interaction.customId.startsWith('reponse_')) {
          await interaction.deferReply({ flags: 64 });
          // Format: reponse_good_userId_mot ou reponse_bad_userId_mot
          const parts = interaction.customId.split('_');
          const action = parts[1]; // 'good' ou 'bad' ou 'spam'
          const userId = parts[2];
          const mot = parts.slice(3).join('_');

          const plateau = await Plateau.findByPk(1);
          const channelId = config.enigmaChannelId;
          const channel = await interaction.client.channels.fetch(channelId).catch(() => null);

          if (!channel) {
            return interaction.editReply({ content: "Erreur : Salon d'énigme introuvable." });
          }

          if (action === 'bad') {
            const embed = interaction.message.embeds[0];
            const newEmbed = { ...embed.data, color: 0xe74c3c, title: 'Proposition refusée' };
            await channel.send({ embeds: [newEmbed] });
            await interaction.editReply({ content: `Tu as refusé la proposition de <@${userId}>.` });
            await interaction.message.edit({ embeds: [newEmbed], components: [] });

          } else if (action === 'spam') {
            const embed = interaction.message.embeds[0];
            const newEmbed = { ...embed.data, color: 0xe74c3c, title: 'Proposition refusée (Non conforme)' };
            await channel.send({ embeds: [newEmbed] });
            const p_joueur = await Joueur.findByPk(userId);
            if (p_joueur && p_joueur.pieces > 0) {
              p_joueur.pieces -= 1;
              await p_joueur.save();
            }
            await interaction.editReply({ content: `Tu as refusé la proposition non conforme de <@${userId}> et 1 pièce de participation lui a été retirée.` });
            await interaction.message.edit({ embeds: [newEmbed], components: [] });

          } else if (action === 'good') {
            if (plateau.enigme_status === 'active' || plateau.enigme_status === 'finished') {
              // Calculer la récompense selon la tranche horaire de la soumission (heure de Paris)
              const submitParis = new Date(interaction.message.createdAt.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
              const hour = submitParis.getHours();
              let reward = 2;
              let trancheLabel = '20h-21h';
              if (hour < 18) {
                reward = 10;
                trancheLabel = '17h-18h';
              } else if (hour < 19) {
                reward = 7;
                trancheLabel = '18h-19h';
              } else if (hour < 20) {
                reward = 4;
                trancheLabel = '19h-20h';
              }

              const isIleDefis = plateau.game_mode === 'ile_defis';
              let rewardText = `+${reward} pièces`;
              let diceName = 'none';

              if (isIleDefis) {
                if (trancheLabel === '17h-18h') {
                  diceName = 'gold';
                  rewardText = "Dé d'Or 🎲✨";
                } else if (trancheLabel === '18h-19h') {
                  diceName = 'silver';
                  rewardText = "Dé d'Argent 🥈";
                } else if (trancheLabel === '19h-20h') {
                  diceName = 'bronze';
                  rewardText = "Dé de Bronze 🥉";
                } else {
                  diceName = 'chocolat';
                  rewardText = "Dé en Chocolat 🍫";
                }
              }

              // Enregistrer le gagnant
              const gagnants = [...(plateau.enigme_gagnants || [])];
              if (!gagnants.find(g => g.discord_id === userId)) {
                gagnants.push({ discord_id: userId, pieces: isIleDefis ? 0 : reward, tranche: trancheLabel });
                plateau.enigme_gagnants = gagnants;
              }
              await plateau.save();

              // Donner les récompenses au joueur
              const joueur = await Joueur.findByPk(userId);
              if (joueur) {
                if (isIleDefis) {
                  let mData = joueur.mode_data || {};
                  mData.bonus_de = diceName;
                  joueur.mode_data = mData;
                } else {
                  joueur.pieces += reward;
                }
                joueur.a_trouve_enigme = true;
                joueur.stat_enigmes_trouvees = (joueur.stat_enigmes_trouvees || 0) + 1;
                // Si validé après 21h, s'assurer que le joueur a le droit de jouer
                if (plateau.enigme_status === 'finished') {
                  joueur.a_le_droit_de_jouer = true;
                }
                await joueur.save();
              }

              // Si l'énigme est toujours active, annoncer dans le channel
              if (plateau.enigme_status === 'active') {
                await channel.send(`🎉 **<@${userId}> a trouvé l'énigme !** (${rewardText} — tranche ${trancheLabel})`);
                await interaction.editReply({ content: `Tu as validé la proposition de <@${userId}>. ${rewardText} (tranche ${trancheLabel}). L'énigme reste ouverte pour les autres.` });
              } else {
                // Si validé en retard (après 21h)
                await channel.send(`🎉 **<@${userId}> a trouvé l'énigme !** (Validé avec retard par le MJ, ${rewardText} — tranche ${trancheLabel})`);
                await interaction.editReply({ content: `Tu as validé tardivement la proposition de <@${userId}>. ${rewardText} (tranche ${trancheLabel}).` });
              }

              // Mettre à jour le message du MJ
              const embed = interaction.message.embeds[0];
              const titleSuffix = plateau.enigme_status === 'finished' ? ' (Retardataire)' : '';
              const newEmbed = { ...embed.data, color: 0x2ecc71, title: `Proposition validée (${rewardText} — ${trancheLabel})${titleSuffix}` };
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
        if (error.code === 10062) {
          console.warn('[Timeout] Interaction (Button) a expiré avant réponse (10062).');
        } else {
          console.error('[ERROR] Erreur lors du traitement du bouton:', error);
        }
        try {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'Une erreur est survenue lors de l\'action.', flags: 64 });
          } else {
            await interaction.reply({ content: 'Une erreur est survenue lors de l\'action.', flags: 64 });
          }
        } catch (e) {
          if (e.code !== 10062) {
            console.error("[ERROR] Impossible de répondre à l'interaction Button:", e);
          } else {
            console.warn('[Timeout] Impossible de répondre - interaction Button déjà expirée (10062).');
          }
        }
      }
    } else if (interaction.isStringSelectMenu()) {
      try {
        if (interaction.customId === 'admin_start_mode') {
          await handleAdminStartMode(interaction);
        } else if (interaction.customId.startsWith('admin_start_variant_')) {
          await handleAdminStartVariant(interaction);
        } else if (interaction.customId.startsWith('admin_start_map::')) {
          await handleAdminStartMap(interaction);
        } else if (interaction.customId.startsWith('boo_target_')) {
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
          await handleReplaceChance(interaction);
        } else if (interaction.customId.startsWith('admin_give_objet_')) {
          await handleAdminGiveObjet(interaction);
        } else if (interaction.customId.startsWith('admin_remove_objet_')) {
          await handleAdminRemoveObjet(interaction);
        }
      } catch (error) {
        if (error.code === 10062) {
          console.warn('[Timeout] Interaction (SelectMenu) a expiré avant réponse (10062).');
        } else {
          console.error('[ERROR] Erreur lors du traitement du SelectMenu:', error);
        }

        const errorMsg = 'Erreur lors du traitement. Regarde les logs pour plus de détails.';
        try {
          if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ content: errorMsg, flags: 64 }).catch(()=>{});
          } else {
            await interaction.reply({ content: errorMsg, flags: 64 }).catch(e => {
              if (e.code !== 10062) {
                console.error("[ERROR] Impossible de répondre SelectMenu:", e);
              } else {
                console.warn('[Timeout] Impossible de répondre - interaction SelectMenu déjà expirée (10062).');
              }
            });
          }
        } catch (e) {
          if (e.code !== 10062) {
            console.error("[ERROR] Impossible de répondre à l'erreur SelectMenu:", e);
          }
        }
      }
    } else if (interaction.isModalSubmit()) {
      try {
        if (interaction.customId.startsWith('modal_pari_')) {
          const { handleModalPari } = require('./game/cron');
          await handleModalPari(interaction);
        } else if (interaction.customId.startsWith('modal_programmer_enigme_')) {
          // Handler du modal de /admin programmer_enigme
          await handleProgrammerEnigmeModal(interaction);
        }
      } catch (error) {
        if (error.code === 10062) {
          console.warn('[Timeout] Interaction (Modal) a expiré avant réponse (10062).');
        } else {
          console.error('[ERROR] Erreur lors du traitement du Modal:', error);
        }
        try {
          if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ content: 'Erreur lors de l\'enregistrement de l\'énigme. Vérifie que tu as bien rempli les champs ou regarde les logs du bot.', flags: 64 }).catch(()=>{});
          } else {
            await interaction.reply({ content: 'Erreur lors de l\'enregistrement.', flags: 64 }).catch(e => {
              if (e.code !== 10062) {
                console.error("[ERROR] Impossible de répondre Modal:", e);
              } else {
                console.warn('[Timeout] Impossible de répondre - interaction Modal déjà expirée (10062).');
              }
            });
          }
        } catch (e) {
          if (e.code !== 10062) {
            console.error("[ERROR] Impossible de répondre à l'erreur Modal:", e);
          }
        }
      }
    }
  } finally {
    if (isGameCommand || isGameAction) {
      processingUsers.delete(interaction.user.id);
      // Libérer le verrou seulement si l'utilisateur n'a plus d'interactions actives
      if (!activeInteractionTokens || !activeInteractionTokens.has(interaction.user.id)) {
        unlockUser(interaction.user.id);
      } else {
        console.log(`[LOCK] Verrou maintenu pour ${interaction.user.id} - interaction toujours active`);
      }
    }
  }
});

// Handler du modal de programmation d'énigme
async function handleProgrammerEnigmeModal(interaction) {
  await interaction.deferReply({ flags: 64 });

  // Extraire la réponse du customId (encodée)
  const encodedReponse = interaction.customId.replace('modal_programmer_enigme_', '');
  const reponse = decodeURIComponent(encodedReponse);

  let enigmeText = "Énigme";
  try { enigmeText = interaction.fields.getTextInputValue('enigme_text'); } catch(e) {}
  
  let indice1 = null;
  try {
    const val = interaction.fields.getTextInputValue('indice_1');
    if (val && val.trim().length > 0) indice1 = val.trim();
  } catch(e) {}
  
  let indice2 = null;
  try {
    const val = interaction.fields.getTextInputValue('indice_2');
    if (val && val.trim().length > 0) indice2 = val.trim();
  } catch(e) {}
  
  let indice3 = null;
  try {
    const val = interaction.fields.getTextInputValue('indice_3');
    if (val && val.trim().length > 0) indice3 = val.trim();
  } catch(e) {}

  const plateau = await Plateau.findByPk(1);
  if (!plateau) {
    return interaction.editReply({ content: "Erreur : Plateau introuvable.", flags: 64 });
  }

  //Sauvegarder l'énigme programmée
  plateau.enigme_text = enigmeText;
  plateau.enigme_indice1 = indice1;
  plateau.enigme_indice2 = indice2;
  plateau.enigme_indice3 = indice3;
  plateau.enigme_reponse = reponse;
  plateau.enigme_status = 'programmee';
  plateau.enigme_publiee = false;
  plateau.indice1_publie = false;
  plateau.indice2_publie = false;
  plateau.indice3_publie = false;
  plateau.enigme_gagnants = [];
  plateau.enigme_resolue = false;

  // Calculer le timestamp de 21h aujourd'hui (Paris)
  const nowParis = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  const finEnigme = new Date(nowParis.getFullYear(), nowParis.getMonth(), nowParis.getDate(), 21, 0, 0);
  const offsetMs = Date.now() - new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' })).getTime();
  plateau.fin_enigme_timestamp = finEnigme.getTime() - offsetMs;

  await plateau.save();

  // Reset a_trouve_enigme pour tous les joueurs
  await Joueur.update({ a_trouve_enigme: false }, { where: {} });

  // Confirmation à l'admin
  let confirmMsg = `✅ **Énigme programmée avec succès !**\n\n`;
  confirmMsg += `📝 **Titre :** ${enigmeText.split('\n')[0] || 'Énigme du jour'}\n`;
  confirmMsg += `🔑 **Réponse :** ${reponse}\n`;
  confirmMsg += `💡 **Indices :** ${[indice1, indice2, indice3].filter(Boolean).length} indice(s) programmé(s)\n`;
  confirmMsg += `\n📣 L'énigme sera publiée automatiquement à **17h** dans le salon énigme.`;

  await interaction.editReply({ content: confirmMsg, flags: 64 });
}

async function handleAdminGiveObjet(interaction) {
  const customId = interaction.customId;
  const userId = customId.replace('admin_give_objet_', '');

  const joueur = await Joueur.findByPk(userId);

  if (!joueur) {
    return interaction.update({
      content: "Le joueur n'existe plus dans la base de données.",
      components: []
    });
  }

  const selectedItem = interaction.values[0];
  const inventaire = [...joueur.inventaire];

  if (inventaire.length >= 3) {
    return interaction.update({
      content: `L'inventaire de <@${userId}> est plein (max 3).`,
      components: []
    });
  }

  inventaire.push(selectedItem);
  joueur.inventaire = inventaire;
  await joueur.save();

  await interaction.update({
    content: `✅ L'objet "${selectedItem}" a été donné à <@${userId}>.`,
    components: []
  });
}

async function handleAdminRemoveObjet(interaction) {
  const customId = interaction.customId;
  const userId = customId.replace('admin_remove_objet_', '');

  const joueur = await Joueur.findByPk(userId);

  if (!joueur) {
    return interaction.update({
      content: "Le joueur n'existe plus dans la base de données.",
      components: []
    });
  }

  const selectedItem = interaction.values[0];
  const inventaire = [...joueur.inventaire];
  const index = inventaire.indexOf(selectedItem);

  if (index === -1) {
    return interaction.update({
      content: `Erreur: l'objet "${selectedItem}" n'est pas dans l'inventaire.`,
      components: []
    });
  }

  inventaire.splice(index, 1);
  joueur.inventaire = inventaire;
  await joueur.save();

  await interaction.update({
    content: `✅ L'objet "${selectedItem}" a été retiré à <@${userId}>.`,
    components: []
  });
}

async function handleAdminStartMode(interaction) {
  const { EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
  const registry = require('./gamemodes/registry');
  
  const selectedMode = interaction.values[0];
  const mode = registry.getMode(selectedMode);
  
  if (!mode) {
    return interaction.update({ content: "❌ Mode de jeu introuvable !", components: [] }).catch(()=>{});
  }

  const variants = registry.getVariantsForMode(selectedMode);
  if (variants.length === 0) {
    return interaction.update({ content: `❌ Aucune variante trouvée pour le mode **${mode.name}** !`, components: [] }).catch(()=>{});
  }

  const embed = new EmbedBuilder()
    .setTitle('🎮 Initialisation du Plateau - Étape 2/3')
    .setDescription(`Vous avez choisi le mode **${mode.name}**.\n\nSélectionnez maintenant la **variante de règles** à appliquer. Les variantes définissent les paramètres par défaut comme les gains, les prix ou d'autres comportements.`)
    .setColor('#5865F2')
    .setFooter({ text: 'Étape 2 sur 3 — Sélection de la Variante' });

  variants.forEach(v => {
    embed.addFields({
      name: `📜 ${v.name}`,
      value: `Variante de jeu disponible pour le mode ${mode.name}.`
    });
  });

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`admin_start_variant_${selectedMode}`)
    .setPlaceholder('Sélectionnez la variante...')
    .addOptions(
      variants.map(v => ({
        label: v.name,
        value: v.id,
        description: `Lancer la variante ${v.name}`
      }))
    );

  const row = new ActionRowBuilder().addComponents(selectMenu);

  await interaction.update({
    embeds: [embed],
    components: [row]
  }).catch((err) => {
    console.error(`[ADMIN] handleAdminStartMode failed:`, err);
  });
}

async function handleAdminStartVariant(interaction) {
  const { EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
  const registry = require('./gamemodes/registry');

  const modeId = interaction.customId.replace('admin_start_variant_', '');
  const selectedVariant = interaction.values[0];

  const mode = registry.getMode(modeId);
  const variants = registry.getVariantsForMode(modeId);
  const variant = variants.find(v => v.id === selectedVariant);

  if (!mode || !variant) {
    return interaction.update({ content: "❌ Mode ou variante introuvable !", components: [] }).catch(()=>{});
  }

  const maps = registry.getMapsForMode(modeId);
  if (maps.length === 0) {
    return interaction.update({ content: `❌ Aucune map trouvée pour le mode **${mode.name}** !`, components: [] }).catch(()=>{});
  }

  const embed = new EmbedBuilder()
    .setTitle('🎮 Initialisation du Plateau - Étape 3/3')
    .setDescription(`Mode : **${mode.name}** | Variante : **${variant.name}**\n\nSélectionnez maintenant la **map (plateau)** sur laquelle se déroulera la partie.`)
    .setColor('#5865F2')
    .setFooter({ text: 'Étape 3 sur 3 — Sélection de la Map' });

  maps.forEach(m => {
    embed.addFields({
      name: `🗺️ ${m.name}`,
      value: `Plateau de jeu "${m.name}" avec ses propres coordonnées de cases.`
    });
  });

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`admin_start_map::${modeId}::${selectedVariant}`)
    .setPlaceholder('Sélectionnez la map...')
    .addOptions(
      maps.map(m => ({
        label: m.name,
        value: m.id,
        description: `Charger la map ${m.name}`
      }))
    );

  const row = new ActionRowBuilder().addComponents(selectMenu);

  await interaction.update({
    embeds: [embed],
    components: [row]
  }).catch((err) => {
    console.error(`[ADMIN] handleAdminStartVariant failed:`, err);
  });
}

async function handleAdminStartMap(interaction) {
  const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
  const registry = require('./gamemodes/registry');

  // Format: admin_start_map::${modeId}::${variantId}
  const suffix = interaction.customId.slice('admin_start_map::'.length);
  const [modeId, variantId] = suffix.split('::');
  const selectedMap = interaction.values[0];

  const mode = registry.getMode(modeId);
  const variant = registry.getVariantsForMode(modeId).find(v => v.id === variantId);
  const map = registry.getMapsForMode(modeId).find(m => m.id === selectedMap);

  if (!mode || !variant || !map) {
    return interaction.update({ content: "❌ Paramètres d'initialisation invalides !", components: [] }).catch(()=>{});
  }

  const embed = new EmbedBuilder()
    .setTitle('⚠️ Confirmation de l\'initialisation')
    .setDescription(`Veuillez confirmer le lancement de la saison avec les paramètres suivants :\n\n• **Mode de jeu :** ${mode.emoji} **${mode.name}**\n• **Variante :** 📜 **${variant.name}**\n• **Map / Plateau :** 🗺️ **${map.name}**\n\n🚨 **ATTENTION :** Confirmer lancera une réinitialisation complète de la base de données. Tous les joueurs inscrits seront supprimés et les scores remis à zéro !`)
    .setColor('#FF9900');

  const btnConfirm = new ButtonBuilder()
    .setCustomId(`admin_start_confirm::${modeId}::${variantId}::${selectedMap}`)
    .setLabel('Confirmer et lancer')
    .setStyle(ButtonStyle.Success);

  const btnCancel = new ButtonBuilder()
    .setCustomId('admin_start_cancel')
    .setLabel('Annuler')
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder().addComponents(btnConfirm, btnCancel);

  await interaction.update({
    embeds: [embed],
    components: [row]
  }).catch((err) => {
    console.error(`[ADMIN] handleAdminStartMap failed:`, err);
  });
}

async function handleAdminStartConfirm(interaction) {
  // Format: admin_start_confirm::${modeId}::${variantId}::${mapId}
  const suffix = interaction.customId.slice('admin_start_confirm::'.length);
  const [modeId, variantId, mapId] = suffix.split('::');

  const registry = require('./gamemodes/registry');
  const mode = registry.getMode(modeId);

  if (!mode) {
    return interaction.update({ content: "❌ Impossible de démarrer : mode introuvable !", components: [], embeds: [] }).catch(()=>{});
  }

  const { TourSnapshot } = require('./db/models');

  await interaction.deferUpdate().catch(()=>{});

  try {
    // 1. Reset de la base de données joueurs & snapshots
    await Joueur.destroy({ where: {} });
    await TourSnapshot.destroy({ where: {} });

    // 2. Récupérer les cases de la map choisie pour placer l'étoile et les blocs cachés
    const boardCases = mode.getBoardCases(mapId);
    
    // Placer l'étoile sur une case aléatoire valide (excluant départ, boutique, boo)
    const validCases = boardCases.filter(ca => ca.type !== 'Boutique' && ca.type !== 'Boo' && ca.id !== 1).map(ca => ca.id);
    const randomStarPos = validCases.length > 0 ? validCases[Math.floor(Math.random() * validCases.length)] : 10;

    // Placer les 4 blocs cachés : pool = cases valides SANS la case de l'étoile pour éviter toute collision
    let pool = validCases.filter(id => id !== randomStarPos);
    pool.sort(() => Math.random() - 0.5);

    const blocks = {
      etoile: pool[0] || 12,
      pieces_20: pool[1] || 16,
      pieces_10: pool[2] || 22,
      pieces_5: pool[3] || 28
    };

    // 3. Mettre à jour ou créer l'état global du plateau
    let plateau = await Plateau.findByPk(1);
    const plateauData = {
      position_etoile: randomStarPos,
      pieges_actifs: [],
      tour: 0,
      enigme_resolue: true,
      blocs_caches: blocks,
      enigme_status: 'finished', // 'finished' = plateau déverrouillé, les joueurs peuvent jouer
      game_mode: modeId,
      game_variant: variantId,
      game_map: mapId
    };

    if (plateau) {
      await plateau.update(plateauData);
    } else {
      await Plateau.create({ id: 1, ...plateauData });
    }

    // 4. Invalider les caches du canvas et du board pour forcer le rechargement de la nouvelle map
    global.cachedBgs = {}; // Vider TOUT le cache d'images (pas seulement la nouvelle map)
    global.cachedBg = null;
    // Invalider le cache des cases du proxy board
    const boardProxy = require('./game/board');
    if (boardProxy._invalidateCache) boardProxy._invalidateCache();
    try {
      const canvasUtils = require('./utils/canvas');
      if (canvasUtils.invalidateBoardCache) canvasUtils.invalidateBoardCache();
    } catch(e){}

    // 5. Envoyer le message de confirmation finale sur l'interaction
    await interaction.editReply({
      content: `🎉 **La saison a été initialisée avec succès !**\n\n• **Mode :** ${mode.emoji} **${mode.name}**\n• **Variante :** 📜 **${variantId}**\n• **Map :** 🗺️ **${mapId}**\n\nL'étoile a été placée sur la case **${randomStarPos}**.\nLe plateau est prêt à accueillir les joueurs ! Utilisez \`/jouer\` pour rejoindre la partie.`,
      embeds: [],
      components: []
    }).catch(()=>{});

    // 6. Notifier les joueurs dans le salon public du plateau
    const config = require('./config');
    const channel = interaction.client.channels.cache.get(config.boardChannelId);
    if (channel) {
      const mentionRole = config.roleEnigmeId ? `<@&${config.roleEnigmeId}> ` : '';
      await channel.send(`🏁 ${mentionRole}**UNE NOUVELLE SAISON COMMENCE !** 🏁\n\nLe plateau a été réinitialisé par un administrateur avec les configurations suivantes :\n• **Mode de jeu :** ${mode.emoji} **${mode.name}**\n• **Variante :** 📜 **${variantId}**\n• **Map / Plateau :** 🗺️ **${mapId}**\n\n🌟 L'étoile a atterri sur la case **${randomStarPos}** !\n\nTous les scores sont remis à zéro. Utilisez la commande \`/jouer\` pour lancer votre dé et faire partie de l'aventure ! Bonne chance à tous ! 🎲✨`).catch((err) => {
        console.error(`[ADMIN] Failed to send startup notification to board channel:`, err);
      });
    }

  } catch (error) {
    console.error(`[ADMIN] Erreur lors de l'initialisation du plateau:`, error);
    await interaction.editReply({
      content: `❌ Une erreur technique est survenue lors de l'initialisation de la partie. Consultez les logs.`,
      embeds: [],
      components: []
    }).catch(()=>{});
  }
}

async function handleAdminStartCancel(interaction) {
  await interaction.update({
    content: '❌ **Initialisation annulée.** Le plateau actuel n\'a pas été modifié.',
    embeds: [],
    components: []
  }).catch(()=>{});
}

client.login(config.token);

// Export for health checks
module.exports.isReady = () => isReady;
