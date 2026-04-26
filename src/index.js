const { Client, GatewayIntentBits, Collection, Events, Partials, Options } = require('discord.js');
const config = require('./config');
const { sequelize, Joueur, Plateau } = require('./db/models');
const { lockUser, unlockUser, getLockedUser } = require('./game/transaction');
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
        if (hourParis >= 18 && p.enigme_indice1 && !p.indice1_publie) {
          await enigmaChannel.send(`💡 **Indice 1 (18h) :** ${p.enigme_indice1}`);
          p.indice1_publie = true;
          await p.save();
        }
        if (hourParis >= 19 && p.enigme_indice2 && !p.indice2_publie) {
          await enigmaChannel.send(`💡 **Indice 2 (19h) :** ${p.enigme_indice2}`);
          p.indice2_publie = true;
          await p.save();
        }
        if (hourParis >= 20 && p.enigme_indice3 && !p.indice3_publie) {
          await enigmaChannel.send(`💡 **Indice 3 (20h) :** ${p.enigme_indice3}`);
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
    isGameAction = true;
  }

  if (isGameCommand || isGameAction) {
    if (processingUsers.has(interaction.user.id)) return interaction.reply({ content: "? Ton action précédente est en cours de traitement !", flags: 64 }).catch(()=>{});
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
            if (plateau.enigme_status === 'active') {
              // Calculer la récompense selon la tranche horaire (heure de Paris)
              const nowParis = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
              const hour = nowParis.getHours();
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

              // Enregistrer la réponse et le gagnant
              plateau.enigme_reponse = mot;
              const gagnants = [...(plateau.enigme_gagnants || [])];
              if (!gagnants.find(g => g.discord_id === userId)) {
                gagnants.push({ discord_id: userId, pieces: reward, tranche: trancheLabel });
                plateau.enigme_gagnants = gagnants;
              }
              await plateau.save();

              // Donner les pièces au joueur
              const joueur = await Joueur.findByPk(userId);
              if (joueur) {
                joueur.pieces += reward;
                joueur.a_trouve_enigme = true;
                joueur.stat_enigmes_trouvees = (joueur.stat_enigmes_trouvees || 0) + 1;
                await joueur.save();
              }

              // Annoncer dans le channel énigme
              await channel.send(`🎉 **<@${userId}> a trouvé l'énigme !** (+${reward} pièces — tranche ${trancheLabel})`);

              // Confirmer au MJ
              await interaction.editReply({ content: `Tu as validé la proposition de <@${userId}>. +${reward} pièces (tranche ${trancheLabel}). L'énigme reste ouverte pour les autres.` });

              // Mettre à jour le message du MJ
              const embed = interaction.message.embeds[0];
              const newEmbed = { ...embed.data, color: 0x2ecc71, title: `Proposition validée (+${reward}p — ${trancheLabel})` };
              await interaction.message.edit({ embeds: [newEmbed], components: [] });

            } else if (plateau.enigme_status === 'finished') {
              // MJ valide en retard (après 21h)
              const j = await Joueur.findByPk(userId);
              if (j) {
                j.pieces += 2;
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
      }
    } else if (interaction.isStringSelectMenu()) {
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
          await handleReplaceChance(interaction);
        }
      } catch (error) {
        if (error.code === 10062) console.warn('[Timeout] Interaction (SelectMenu) a expiré avant réponse (10062).');
        else console.error(error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'Erreur lors de la sélection.', flags: 64 }).catch(e => {
            if (e.code !== 10062) console.error("Impossible de répondre SelectMenu:", e);
          });
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
        if (error.code === 10062) console.warn('[Timeout] Interaction (Modal) a expiré avant réponse (10062).');
        else console.error(error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'Erreur lors de l\'enregistrement.', flags: 64 }).catch(e => {
            if (e.code !== 10062) console.error("Impossible de répondre Modal:", e);
          });
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

// Handler du modal de programmation d'énigme
async function handleProgrammerEnigmeModal(interaction) {
  await interaction.deferReply({ flags: 64 });

  // Extraire la réponse du customId (encodée)
  const encodedReponse = interaction.customId.replace('modal_programmer_enigme_', '');
  const reponse = decodeURIComponent(encodedReponse);

  const enigmeText = interaction.fields.getTextInputValue('enigme_text');
  const indicesText = interaction.fields.getTextInputValue('indices_text');

  // Parser les indices (un par ligne)
  const lines = indicesText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const indice1 = lines[0] || null;
  const indice2 = lines[1] || null;
  const indice3 = lines[2] || null;

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
  confirmMsg += `📝 **Énigme :** ${enigmeText}\n`;
  confirmMsg += `🔑 **Réponse :** ${reponse}\n`;
  if (indice1) confirmMsg += `💡 **Indice 18h :** ${indice1}\n`;
  if (indice2) confirmMsg += `💡 **Indice 19h :** ${indice2}\n`;
  if (indice3) confirmMsg += `💡 **Indice 20h :** ${indice3}\n`;
  confirmMsg += `\n📣 L'énigme sera publiée automatiquement à **17h** dans le salon énigme.`;

  await interaction.editReply({ content: confirmMsg, flags: 64 });
}

client.login(config.token);
