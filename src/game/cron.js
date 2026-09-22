const cron = require('node-cron');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config');
const { Joueur, Plateau, TourSnapshot } = require('../db/models');
const { Op } = require('sequelize');

// Variables globales pour les paris
let parisActifs = false;
let coureurs = [];

/**
 * Vérifie si une saison est active et en cours de déroulement régulier.
 * Une saison n'est pas active si le plateau est absent, si elle est terminée (season_ended),
 * si elle est en attente du tour 1 (tour === 0), ou si elle a atteint ou dépassé le tour maximal (30).
 */
function isSeasonActive(plateau) {
  if (!plateau) return false;
  if (plateau.enigme_status === 'season_ended') return false;
  if (plateau.tour === 0) return false;
  if (plateau.tour >= 30) return false;
  return true;
}

/**
 * Récupère un salon Discord via fetch sécurisé avec fallback sur le cache.
 * @param {object} client Client Discord.js
 * @param {string} channelId ID du salon Discord
 * @returns {Promise<object|null>}
 */
async function getChannel(client, channelId) {
  if (!client || !client.channels || !channelId) return null;
  let channel = null;
  if (typeof client.channels.fetch === 'function') {
    channel = await client.channels.fetch(channelId).catch(() => null);
  }
  if (!channel && client.channels.cache && typeof client.channels.cache.get === 'function') {
    channel = client.channels.cache.get(channelId);
  }
  return channel || null;
}

/**
 * Applique les règles de passage en mode fantôme pour les joueurs inactifs.
 */
async function applyGhostRules(tousLesJoueurs, client) {
  const channel = await getChannel(client, config.boardChannelId);
  for (const j of tousLesJoueurs) {
    if (!j.a_joue_ce_tour) {
      j.jours_inactifs += 1;
      if (j.jours_inactifs >= 3 && !j.est_fantome) {
        j.est_fantome = true;
        if (channel) {
          await channel.send(`👻 **<@${j.discord_id}>** ne donne plus de nouvelles depuis 3 tours et s'est transformé(e) en fantôme ! Son personnage est maintenant bloqué jusqu'à son possible réveil.`);
        }
      }
    } else {
      j.jours_inactifs = 0;
    }
    j.a_joue_ce_tour = false;
  }
}

/**
 * Rappel de 15h (lun-ven) : 2h avant la fin du tour.
 */
async function handle15hReminder(client) {
  const plateau = await Plateau.findByPk(1);
  if (!isSeasonActive(plateau)) return;

  const joueursARappeler = await Joueur.findAll({
    where: {
      a_le_droit_de_jouer: true,
      auto_remind_turn: true
    }
  });

  for (const j of joueursARappeler) {
    try {
      const user = await client.users.fetch(j.discord_id);
      if (user) {
        await user.send("⏰ **Rappel automatique** : Le tour en cours sur le plateau se termine dans 2 heures ! N'oublie pas de faire `/jouer` !");
      }
    } catch (e) {
      console.error(`Impossible d'envoyer le rappel au joueur ${j.discord_id}`, e);
    }
  }
  console.log(`Rappel de fin de tour en semaine envoyé à ${joueursARappeler.length} joueur(s).`);
}

/**
 * Rappel de 8h le samedi : 2h avant les paris.
 */
async function handleSaturday8hReminder(client) {
  const plateau = await Plateau.findByPk(1);
  if (!isSeasonActive(plateau)) return;

  const registry = require('../gamemodes/registry');
  const mode = registry.getActiveMode(plateau);
  if (mode.hasShop === false || plateau.game_mode === 'ile_defis') return;

  const joueursARappeler = await Joueur.findAll({
    where: {
      a_le_droit_de_jouer: true,
      auto_remind_turn: true
    }
  });

  for (const j of joueursARappeler) {
    try {
      const user = await client.users.fetch(j.discord_id);
      if (user) {
        await user.send("⏰ **Rappel automatique** : Le tour en cours sur le plateau se termine dans 2 heures ! N'oublie pas de faire `/jouer` ! (Les paris commencent à 10h00)");
      }
    } catch (e) {
      console.error(`Impossible d'envoyer le rappel au joueur ${j.discord_id}`, e);
    }
  }
  console.log(`Rappel de fin de tour du samedi envoyé à ${joueursARappeler.length} joueur(s).`);
}

/**
 * Transition unique de 17h00 (lun-ven) :
 * Publication de l'énigme OU annonce de plateau ouvert (si pas d'énigme en cours de saison),
 * verrouillage du plateau, et vérification de fin de saison.
 */
async function handle17hTransition(client) {
  const plateau = await Plateau.findByPk(1);
  if (!plateau || plateau.enigme_status === 'season_ended') return;

  if (plateau.tour >= 30) {
    if (plateau.enigme_status !== 'season_ended') {
      const { endSeason } = require('./endgame');
      await endSeason(client);
    }
    return;
  }

  // Si le tour est à 0 et qu'aucune énigme n'a été programmée, la saison attend son lancement : ne rien faire.
  if (plateau.tour === 0 && (plateau.enigme_status !== 'programmee' || !plateau.enigme_text)) {
    return;
  }

  if (plateau.enigme_status === 'programmee' && plateau.enigme_text) {
    const tousLesJoueurs = await Joueur.findAll();
    // Identifier les oublis avant d'altérer l'état des joueurs
    const oublis = tousLesJoueurs.filter(j => j.a_le_droit_de_jouer);

    // Appliquer les règles fantôme sur le tour écoulé
    await applyGhostRules(tousLesJoueurs, client);

    // Reset joueurs pour la nouvelle session
    for (const j of tousLesJoueurs) {
      j.a_le_droit_de_jouer = false; // Verrouillage du plateau pendant l'énigme
      j.guess_du_jour = 0;
      j.boutique_du_jour = [];
      j.last_deviner_time = null;
      j.a_trouve_enigme = false;
      await j.save();
    }

    // Publier l'énigme
    plateau.enigme_status = 'active';
    plateau.enigme_publiee = true;
    plateau.tour += 1;
    plateau.enigme_resolue = false;
    plateau.enigme_gagnants = [];
    plateau.enigme_reponse = plateau.enigme_reponse || null;

    // Timestamp de 21h aujourd'hui (Europe/Paris)
    const nowParis = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
    const finEnigme = new Date(nowParis.getFullYear(), nowParis.getMonth(), nowParis.getDate(), 21, 0, 0);
    const offsetMs = Date.now() - new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' })).getTime();
    plateau.fin_enigme_timestamp = finEnigme.getTime() - offsetMs;

    await plateau.save();

    // Poster l'énigme dans le salon dédié
    const enigmaChannel = await getChannel(client, config.enigmaChannelId);
    if (enigmaChannel) {
      const roleMention = config.roleEnigmeId ? `<@&${config.roleEnigmeId}> ` : '';
      let msg = `${roleMention}🧩 **ÉNIGME DU JOUR — Tour ${plateau.tour}/30**\n\n`;
      msg += plateau.enigme_text;
      msg += '\n\n💡 *Des indices seront publiés à 18h, 19h et 20h.*';
      msg += '\n🎲 Utilisez `/deviner [votre réponse]` pour proposer une réponse au Maître du Jeu.';
      msg += '\n🪙 Chaque proposition rapporte **1 pièce** de participation (max 3/jour).';
      msg += '\n⏰ **Récompenses :** 17h-18h → 10 pièces | 18h-19h → 7 pièces | 19h-20h → 4 pièces | 20h-21h → 2 pièces';
      await enigmaChannel.send(msg);
    }

    // Annonce unique de fin de tour et de verrouillage dans le salon du plateau
    const boardChannel = await getChannel(client, config.boardChannelId);
    if (boardChannel) {
      let lockMsg = `⏰ **Fin du tour de jeu !** Le plateau est maintenant verrouillé jusqu'à 21h (résolution de l'énigme).\n`;
      if (oublis.length > 0) {
        lockMsg += `\n⚠️ **Ils ont oublié de jouer aujourd'hui :**\n`;
        for (const j of oublis) {
          try {
            const user = await client.users.fetch(j.discord_id);
            lockMsg += `- **${user.username}**\n`;
          } catch (e) {
            lockMsg += `- **Joueur inconnu** (ID: ${j.discord_id})\n`;
          }
        }
        lockMsg += `\n*Tant pis pour eux ! N'hésitez pas à activer un rappel avec la commande \`/settings\` pour ne plus oublier votre tour.*`;
      }
      await boardChannel.send(lockMsg);
    }

    console.log(`[ENIGME] Énigme du Tour ${plateau.tour} publiée à 17h.`);
  } else {
    // Aucune énigme programmée pendant une saison en cours (tour >= 1)
    const tousLesJoueurs = await Joueur.findAll();
    if (tousLesJoueurs.length === 0) {
      console.warn('[ENIGME] ⚠️ Aucune énigme programmée et 0 joueur actif. Aucun ping envoyé et tour inchangé.');
      return;
    }

    console.warn('[ENIGME] ⚠️ Aucune énigme programmée pour aujourd\'hui ! Le plateau reste ouvert.');

    await applyGhostRules(tousLesJoueurs, client);
    for (const j of tousLesJoueurs) {
      if (!j.est_fantome) j.a_le_droit_de_jouer = true;
      j.guess_du_jour = 0;
      j.boutique_du_jour = [];
      j.last_deviner_time = null;
      j.a_trouve_enigme = false;
      await j.save();
    }

    plateau.tour += 1;
    plateau.enigme_resolue = true;
    plateau.enigme_status = 'finished';
    await plateau.save();

    const channel = await getChannel(client, config.boardChannelId);

    if (channel) {
      const roleMention = config.roleEnigmeId ? `<@&${config.roleEnigmeId}> ` : '';
      await channel.send(`${roleMention}⚠️ **Aucune énigme n'a été programmée aujourd'hui !** Le plateau reste ouvert. N'oubliez pas d'utiliser \`/admin programmer_enigme\` demain.`);
    }

    if (plateau.tour >= 30) {
      const { endSeason } = require('./endgame');
      await endSeason(client);
    }
  }
}

/**
 * Samedi 10h00 : Lancement des paris (Le plateau est fermé).
 */
async function handleSaturday10hBets(client) {
  const plateau = await Plateau.findByPk(1);
  if (!isSeasonActive(plateau)) return;

  const registry = require('../gamemodes/registry');
  const mode = registry.getActiveMode(plateau);
  if (mode.hasShop === false || plateau.game_mode === 'ile_defis') return;

  const tousLesJoueurs = await Joueur.findAll();
  await applyGhostRules(tousLesJoueurs, client);
  for (const j of tousLesJoueurs) {
    j.a_le_droit_de_jouer = false;
    j.pari_coureurId = null;
    j.pari_montant = 0;
    await j.save();
  }

  const channel = await getChannel(client, config.boardChannelId);
  if (!channel) return;

  parisActifs = true;
  const noms = ['Yoshi Vert', 'Yoshi Rouge', 'Yoshi Bleu', 'Yoshi Jaune', 'Yoshi Noir'];
  coureurs = noms.map((nom, index) => ({ id: index, nom: nom }));

  let msg = '🏇 **LES PARIS DU SAMEDI SONT OUVERTS !** 🏇\n\n';
  if (config.roleEnigmeId) {
    msg = `<@&${config.roleEnigmeId}> ` + msg;
  }
  msg += 'Misez sur votre Yoshi favori ! Le système fonctionne comme les prédictions Twitch : le pot total sera partagé entre les gagnants proportionnellement à leur mise.\n\n';

  const row = new ActionRowBuilder();
  coureurs.forEach(c => {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`pari_${c.id}`)
        .setLabel(`Parier sur ${c.nom}`)
        .setStyle(ButtonStyle.Primary)
    );
  });
  msg += '*Vous avez jusqu\'à 21h00 pour parier (Max 30 pièces). Un ticket gratuit de 3 pièces est offert à tous !*';

  await channel.send({ content: msg, components: [row] });
}

/**
 * Samedi 21h00 : Résultat des paris.
 */
async function handleSaturday21hBetsResult(client) {
  if (!parisActifs) return;
  parisActifs = false;

  const channel = await getChannel(client, config.boardChannelId);
  if (!channel) return;

  await channel.send('🏁 **LA COURSE DE YOSHIS COMMENCE !** 🏁');

  setTimeout(async () => {
    await channel.send('Les Yoshis sont dans le dernier virage...');
  }, 3000);

  setTimeout(async () => {
    await channel.send('C\'est très serré !');
  }, 6000);

  setTimeout(async () => {
    const gagnant = coureurs[Math.floor(Math.random() * coureurs.length)];
    let resultMsg = `🏆 **${gagnant.nom.toUpperCase()} REMPORTE LA COURSE !** 🏆\n\n`;

    let potTotal = 0;
    let totalMiseGagnant = 0;

    const laBaseDeParis = await Joueur.findAll({
      where: {
        pari_coureurId: {
          [Op.ne]: null
        }
      }
    });

    for (const p of laBaseDeParis) {
      potTotal += p.pari_montant;
      if (p.pari_coureurId === gagnant.id) {
        totalMiseGagnant += p.pari_montant;
      }
    }

    let gagnantsCount = 0;

    if (totalMiseGagnant > 0) {
      for (const joueur of laBaseDeParis) {
        if (joueur.pari_coureurId === gagnant.id) {
          const part = joueur.pari_montant / totalMiseGagnant;
          const gain = Math.floor(part * potTotal);

          joueur.pieces += gain;
          let oldMise = joueur.pari_montant;
          joueur.pari_coureurId = null;
          joueur.pari_montant = 0;
          await joueur.save();

          resultMsg += `<@${joueur.discord_id}> gagne **${gain} pièces** (Mise: ${oldMise}) ! *(Total: ${joueur.pieces} 🪙)*\n`;
          gagnantsCount++;
        } else {
          joueur.pari_coureurId = null;
          joueur.pari_montant = 0;
          await joueur.save();
        }
      }
    } else {
      for (const joueur of laBaseDeParis) {
        joueur.pari_coureurId = null;
        joueur.pari_montant = 0;
        await joueur.save();
      }
    }

    if (gagnantsCount === 0) {
      resultMsg += `*Personne n'a parié sur ${gagnant.nom}... Le pot de ${potTotal} pièces est perdu ! 🤖💰*`;
    } else {
      resultMsg += `\n*Pot total de ${potTotal} pièces partagé entre les gagnants !*`;
    }

    await channel.send(resultMsg);
  }, 9000);
}

/**
 * Dimanche 11h00 : Ouverture automatique pour le Marché Noir.
 */
async function handleSunday11hBlackMarket(client) {
  const plateau = await Plateau.findByPk(1);
  if (!isSeasonActive(plateau)) return;

  const registry = require('../gamemodes/registry');
  const mode = registry.getActiveMode(plateau);
  if (mode.hasShop === false || plateau.game_mode === 'ile_defis') return;

  const tousLesJoueurs = await Joueur.findAll();
  for (const j of tousLesJoueurs) {
    j.a_le_droit_de_jouer = true;
    j.guess_du_jour = 0;
    j.boutique_du_jour = [];
    j.last_deviner_time = null;
    await j.save();
  }

  plateau.tour += 1;
  plateau.enigme_resolue = true;
  await plateau.save();

  if (plateau.tour >= 30) {
    const { endSeason } = require('./endgame');
    await endSeason(client);
    return;
  }

  const channel = await getChannel(client, config.boardChannelId);
  if (channel) {
    let mentionRole = config.roleEnigmeId ? `<@&${config.roleEnigmeId}> ` : '';
    await channel.send(`${mentionRole}🛍️ **LE MARCHÉ NOIR EST OUVERT !** 🛍️\nLe plateau est déverrouillé, aucune énigme aujourd'hui. Les boutiques proposent des objets dévastateurs exclusifs ! Utilisez \`/jouer\` pour en profiter !`);
  }
}

function initCronJobs(client) {
  // ---- HOTFIX : REPRISE DES PARIS SI CRASH/RESTART LE SAMEDI ----
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', hour: 'numeric', hour12: false });
  const parts = formatter.formatToParts(now);
  const weekday = parts.find(p => p.type === 'weekday').value;
  const hour = parseInt(parts.find(p => p.type === 'hour').value);

  if (weekday.toLowerCase() === 'samedi' && hour >= 10 && hour < 21) {
    Plateau.findByPk(1).then(plateau => {
      if (plateau && isSeasonActive(plateau) && plateau.game_mode !== 'ile_defis') {
        parisActifs = true;
        const noms = ['Yoshi Vert', 'Yoshi Rouge', 'Yoshi Bleu', 'Yoshi Jaune', 'Yoshi Noir'];
        coureurs = noms.map((nom, index) => ({ id: index, nom: nom }));
        console.log("[CRON] Restauration de l'état des paris suite au redémarrage !");
      }
    }).catch(e => console.error("[CRON] Erreur vérification état des paris au redémarrage:", e));
  }
  // ---------------------------------------------------------------

  // 15h00 (lun-ven) — Rappel 2h avant la fin du tour (le tour se termine à 17h)
  cron.schedule('0 15 * * 1-5', () => handle15hReminder(client), {
    timezone: "Europe/Paris"
  });

  // Samedi 8h00 — Rappel 2h avant les paris (10h)
  cron.schedule('0 8 * * 6', () => handleSaturday8hReminder(client), {
    timezone: "Europe/Paris"
  });

  // ===== SYSTÈME D'ÉNIGME (17h-21h en semaine) =====

  // 17h00 (lun-ven) — Transition unique de fin de tour / énigme / verrouillage
  cron.schedule('0 17 * * 1-5', () => handle17hTransition(client), {
    timezone: "Europe/Paris"
  });

  // 18h00 (lun-ven) — Indice 1
  cron.schedule('0 18 * * 1-5', async () => {
    const plateau = await Plateau.findByPk(1);
    if (plateau && plateau.enigme_status === 'active' && plateau.enigme_indice1 && !plateau.indice1_publie) {
      const enigmaChannel = await getChannel(client, config.enigmaChannelId);
      if (enigmaChannel) {
        const roleMention = config.roleEnigmeId ? `<@&${config.roleEnigmeId}> ` : '';
        await enigmaChannel.send(`${roleMention}💡 **Indice 1 (18h) :** ${plateau.enigme_indice1}`);
      }
      plateau.indice1_publie = true;
      await plateau.save();
      console.log('[ENIGME] Indice 1 publié à 18h.');
    }
  }, {
    timezone: "Europe/Paris"
  });

  // 19h00 (lun-ven) — Indice 2
  cron.schedule('0 19 * * 1-5', async () => {
    const plateau = await Plateau.findByPk(1);
    if (plateau && plateau.enigme_status === 'active' && plateau.enigme_indice2 && !plateau.indice2_publie) {
      const enigmaChannel = await getChannel(client, config.enigmaChannelId);
      if (enigmaChannel) {
        const roleMention = config.roleEnigmeId ? `<@&${config.roleEnigmeId}> ` : '';
        await enigmaChannel.send(`${roleMention}💡 **Indice 2 (19h) :** ${plateau.enigme_indice2}`);
      }
      plateau.indice2_publie = true;
      await plateau.save();
      console.log('[ENIGME] Indice 2 publié à 19h.');
    }
  }, {
    timezone: "Europe/Paris"
  });

  // 20h00 (lun-ven) — Indice 3
  cron.schedule('0 20 * * 1-5', async () => {
    const plateau = await Plateau.findByPk(1);
    if (plateau && plateau.enigme_status === 'active' && plateau.enigme_indice3 && !plateau.indice3_publie) {
      const enigmaChannel = await getChannel(client, config.enigmaChannelId);
      if (enigmaChannel) {
        const roleMention = config.roleEnigmeId ? `<@&${config.roleEnigmeId}> ` : '';
        await enigmaChannel.send(`${roleMention}💡 **Indice 3 (20h) :** ${plateau.enigme_indice3}`);
      }
      plateau.indice3_publie = true;
      await plateau.save();
      console.log('[ENIGME] Indice 3 publié à 20h.');
    }
  }, {
    timezone: "Europe/Paris"
  });

  // 21h00 (lun-ven) — Fin de l'énigme + Ouverture du plateau
  cron.schedule('0 21 * * 1-5', async () => {
    const plateau = await Plateau.findByPk(1);
    if (!plateau || plateau.enigme_status !== 'active') return;

    const { triggerEnigmaEnd } = require('./enigma');
    await triggerEnigmaEnd(client);
  }, {
    timezone: "Europe/Paris"
  });

  // ===== FIN SYSTÈME D'ÉNIGME =====

  // Dimanche 11h00 : Ouverture automatique pour le Marché Noir (Pas d'énigme)
  cron.schedule('0 11 * * 0', () => handleSunday11hBlackMarket(client), {
    timezone: "Europe/Paris"
  });

  // Samedi 10h00 : Lancement des paris (Le plateau est fermé)
  cron.schedule('0 10 * * 6', () => handleSaturday10hBets(client), {
    timezone: "Europe/Paris"
  });

  // Samedi 21h00 : Résultat des paris
  cron.schedule('0 21 * * 6', () => handleSaturday21hBetsResult(client), {
    timezone: "Europe/Paris"
  });

  // Nettoyer les snapshots anciens tous les jours à minuit
  cron.schedule('0 0 * * *', async () => {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const deletedCount = await TourSnapshot.destroy({
        where: {
          timestamp: {
            [Op.lt]: sevenDaysAgo
          }
        }
      });

      if (deletedCount > 0) {
        console.log(`[CLEANUP] ${deletedCount} anciens snapshots de tours supprimés.`);
      }
    } catch (error) {
      console.error('[CLEANUP] Erreur lors du nettoyage des snapshots:', error);
    }
  }, {
    timezone: "Europe/Paris"
  });
}

async function handlePari(interaction) {
  if (!parisActifs) {
    return interaction.reply({ content: 'Les paris sont fermés !', flags: 64 });
  }

  const coureurId = parseInt(interaction.customId.split('_')[1]);
  const coureur = coureurs.find(c => c.id === coureurId);

  if (!coureur) return interaction.reply({ content: 'Coureur introuvable.', flags: 64 });

  const joueur = await Joueur.findByPk(interaction.user.id);
  if (!joueur) return interaction.reply({ content: "Tu n'es pas inscrit !", flags: 64 });
  if (joueur.est_fantome) return interaction.reply({ content: "👻 Tu es en mode fantôme, tu ne peux pas parier !", flags: 64 });
  if (joueur.pari_coureurId !== null) {
    return interaction.reply({ content: 'Tu as déjà parié !', flags: 64 });
  }

  const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

  const modal = new ModalBuilder()
    .setCustomId(`modal_pari_${coureurId}`)
    .setTitle(`Pari sur ${coureur.nom}`);

  const montantInput = new TextInputBuilder()
    .setCustomId('montant')
    .setLabel("Montant du pari (Max 30, 3 offerts)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue("3");

  const firstActionRow = new ActionRowBuilder().addComponents(montantInput);
  modal.addComponents(firstActionRow);

  await interaction.showModal(modal);
}

async function handleModalPari(interaction) {
  const coureurId = parseInt(interaction.customId.split('_')[2]);
  const montantStr = interaction.fields.getTextInputValue('montant');
  let montant = parseInt(montantStr);

  if (isNaN(montant) || montant < 3 || montant > 30) {
    return interaction.reply({ content: 'Montant invalide. Doit être entre 3 et 30 (3 pièces sont offertes).', flags: 64 });
  }

  const joueur = await Joueur.findByPk(interaction.user.id);
  if (!joueur) {
    return interaction.reply({ content: 'Tu n\'es pas inscrit au jeu.', flags: 64 });
  }
  if (joueur.est_fantome) {
    return interaction.reply({ content: 'Tu es en mode fantôme, tu ne peux pas parier.', flags: 64 });
  }

  let coutReel = Math.max(0, montant - 3);

  if (joueur.pieces < coutReel) {
    return interaction.reply({ content: `Tu n'as pas genug de pièces. Il te faut ${coutReel} pièces (3 sont offertes).`, flags: 64 });
  }

  joueur.pieces -= coutReel;
  joueur.pari_coureurId = coureurId;
  joueur.pari_montant = montant;
  await joueur.save();

  const coureur = coureurs.find(c => c.id === coureurId);
  await interaction.reply({ content: `Tu as parié **${montant} pièces** sur **${coureur.nom}** ! *(Il te reste ${joueur.pieces} 🪙)*`, flags: 64 });
}

module.exports = {
  initCronJobs,
  handlePari,
  handleModalPari,
  isSeasonActive,
  getChannel,
  applyGhostRules,
  handle17hTransition,
  handle15hReminder,
  handleSaturday8hReminder,
  handleSaturday10hBets,
  handleSaturday21hBetsResult,
  handleSunday11hBlackMarket
};
