const cron = require('node-cron');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config');
const { Joueur, Plateau } = require('../db/models');

// Variables globales pour les paris
let parisActifs = false;
let coureurs = [];


function initCronJobs(client) {
  async function applyGhostRules(tousLesJoueurs) {
    const channel = client.channels.cache.get(config.boardChannelId);
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

  // ---- HOTFIX : REPRISE DES PARIS SI CRASH/RESTART LE SAMEDI ----
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', hour: 'numeric', hour12: false });
  const parts = formatter.formatToParts(now);
  const weekday = parts.find(p => p.type === 'weekday').value;
  const hour = parseInt(parts.find(p => p.type === 'hour').value);

  if (weekday.toLowerCase() === 'samedi' && hour >= 10 && hour < 21) {
    parisActifs = true;
    const noms = ['Yoshi Vert', 'Yoshi Rouge', 'Yoshi Bleu', 'Yoshi Jaune', 'Yoshi Noir'];
    coureurs = noms.map((nom, index) => ({ id: index, nom: nom }));
    console.log("Restauration de l'état des paris suite au redémarrage !");
  }
  // ---------------------------------------------------------------

  // 15h00 (lun-ven) — Rappel 2h avant la fin du tour (le tour se termine à 17h)
  cron.schedule('0 15 * * 1-5', async () => {
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
  }, {
    timezone: "Europe/Paris"
  });

  // Samedi 8h00 — Rappel 2h avant les paris (10h)
  cron.schedule('0 8 * * 6', async () => {
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
  }, {
    timezone: "Europe/Paris"
  });

  // ===== SYSTÈME D'ÉNIGME (17h-21h en semaine) =====

  // 17h00 (lun-ven) — Publication de l'énigme + Verrouillage du plateau
  cron.schedule('0 17 * * 1-5', async () => {
    const plateau = await Plateau.findByPk(1);
    if (plateau && plateau.tour >= 30) {
      const { endSeason } = require('./endgame');
      await endSeason(client);
      return;
    }

    if (plateau && plateau.enigme_status === 'programmee' && plateau.enigme_text) {
      // Appliquer les règles fantôme sur le tour précédent
      const tousLesJoueurs = await Joueur.findAll();
      await applyGhostRules(tousLesJoueurs);

      // Reset joueurs pour la nouvelle session
      for (const j of tousLesJoueurs) {
        j.a_le_droit_de_jouer = false; // Verrouillage plateau pendant l'énigme
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

      // Calculer le timestamp de 21h aujourd'hui (Europe/Paris)
      const nowParis = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
      const finEnigme = new Date(nowParis.getFullYear(), nowParis.getMonth(), nowParis.getDate(), 21, 0, 0);
      // Convertir en timestamp ms (le Date utilise le timezone local du serveur, on compense)
      const offsetMs = new Date().getTime() - new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' })).getTime();
      plateau.fin_enigme_timestamp = finEnigme.getTime() - offsetMs;

      await plateau.save();

      // Poster l'énigme dans le channel
      const enigmaChannel = client.channels.cache.get(config.enigmaChannelId);
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

      console.log(`[ENIGME] Énigme du Tour ${plateau.tour} publiée à 17h.`);
    } else {
      // Pas d'énigme programmée — on applique quand même les règles fantôme et le reset partiel
      console.warn('[ENIGME] ⚠️ Aucune énigme programmée pour aujourd\'hui ! Le plateau reste ouvert.');

      const tousLesJoueurs = await Joueur.findAll();
      await applyGhostRules(tousLesJoueurs);
      for (const j of tousLesJoueurs) {
        j.guess_du_jour = 0;
        j.boutique_du_jour = [];
        j.last_deviner_time = null;
        j.a_trouve_enigme = false;
        await j.save();
      }

      // Incrémenter le tour même sans énigme
      if (plateau) {
        plateau.tour += 1;
        plateau.enigme_resolue = true;
        plateau.enigme_status = 'finished';
        await plateau.save();
      }

      const channel = client.channels.cache.get(config.boardChannelId);
      if (channel) {
        const roleMention = config.roleEnigmeId ? `<@&${config.roleEnigmeId}> ` : '';
        await channel.send(`${roleMention}⚠️ **Aucune énigme n'a été programmée aujourd'hui !** Le plateau reste ouvert. N'oubliez pas d'utiliser \`/admin programmer_enigme\` demain.`);
      }
    }
  }, {
    timezone: "Europe/Paris"
  });

  // 18h00 (lun-ven) — Indice 1
  cron.schedule('0 18 * * 1-5', async () => {
    const plateau = await Plateau.findByPk(1);
    if (plateau && plateau.enigme_status === 'active' && plateau.enigme_indice1 && !plateau.indice1_publie) {
      const enigmaChannel = client.channels.cache.get(config.enigmaChannelId);
      if (enigmaChannel) {
        await enigmaChannel.send(`💡 **Indice 1 (18h) :** ${plateau.enigme_indice1}`);
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
      const enigmaChannel = client.channels.cache.get(config.enigmaChannelId);
      if (enigmaChannel) {
        await enigmaChannel.send(`💡 **Indice 2 (19h) :** ${plateau.enigme_indice2}`);
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
      const enigmaChannel = client.channels.cache.get(config.enigmaChannelId);
      if (enigmaChannel) {
        await enigmaChannel.send(`💡 **Indice 3 (20h) :** ${plateau.enigme_indice3}`);
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
  cron.schedule('0 11 * * 0', async () => {
    const plateauCheck = await Plateau.findByPk(1);
    if (plateauCheck && plateauCheck.tour >= 30) {
      const { endSeason } = require('./endgame');
      await endSeason(client);
      return;
    }

    const tousLesJoueurs = await Joueur.findAll();
    for (const j of tousLesJoueurs) {
      j.a_le_droit_de_jouer = true;
      j.guess_du_jour = 0;
      j.boutique_du_jour = [];
      j.last_deviner_time = null;
      await j.save();
    }

    const plateau = await Plateau.findByPk(1);
    if (plateau) {
      plateau.tour += 1;
      plateau.enigme_resolue = true;
      await plateau.save();
    }

    const channel = client.channels.cache.get(config.boardChannelId);
    if (channel) {
      let mentionRole = config.roleEnigmeId ? `<@&${config.roleEnigmeId}> ` : '';
      await channel.send(`${mentionRole}🛍️ **LE MARCHÉ NOIR EST OUVERT !** 🛍️\nLe plateau est déverrouillé, aucune énigme aujourd'hui. Les boutiques proposent des objets dévastateurs exclusifs ! Utilisez \`/jouer\` pour en profiter !`);
    }
  }, {
    timezone: "Europe/Paris"
  });

  // Samedi 10h00 : Lancement des paris (Le plateau est fermé)
  cron.schedule('0 10 * * 6', async () => {
    const plateauCheck = await Plateau.findByPk(1);
    if (plateauCheck && plateauCheck.tour >= 30) {
      const { endSeason } = require('./endgame');
      await endSeason(client);
      return;
    }

    const tousLesJoueurs = await Joueur.findAll();
    await applyGhostRules(tousLesJoueurs);
    for (const j of tousLesJoueurs) {
      j.a_le_droit_de_jouer = false;
      j.pari_coureurId = null;
      j.pari_montant = 0;
      await j.save();
    }

    const channel = client.channels.cache.get(config.boardChannelId);
    if (!channel) return;

    parisActifs = true;

    const noms = ['Yoshi Vert', 'Yoshi Rouge', 'Yoshi Bleu', 'Yoshi Jaune', 'Yoshi Noir'];

    coureurs = noms.map((nom, index) => ({
      id: index,
      nom: nom
    }));

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
  }, {
    timezone: "Europe/Paris"
  });

  // Samedi 21h00 : Résultat des paris
  cron.schedule('0 21 * * 6', async () => {
    if (!parisActifs) return;
    parisActifs = false;

    const channel = client.channels.cache.get(config.boardChannelId);
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

      const { Op } = require('sequelize');
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

  }, {
    timezone: "Europe/Paris"
  });

  // Annonce de fin de tour à 17h (lun-ven), pour signaler que le plateau se verrouille
  cron.schedule('0 17 * * 1-5', async () => {
    const plateauCheck = await Plateau.findByPk(1);
    if (plateauCheck && plateauCheck.tour >= 30) return;

    const channel = client.channels.cache.get(config.boardChannelId);
    if (channel) {
      const tousLesJoueurs = await Joueur.findAll();
      const oublis = tousLesJoueurs.filter(j => j.a_le_droit_de_jouer);

      let msg = '⏰ **Fin du tour de jeu !** Le plateau est maintenant verrouillé jusqu\'à 21h (résolution de l\'énigme).\n';

      if (oublis.length > 0) {
        msg += `\n⚠️ **Ils ont oublié de jouer aujourd'hui :**\n`;
        for (const j of oublis) {
          try {
            const user = await client.users.fetch(j.discord_id);
            msg += `- **${user.username}**\n`;
          } catch (e) {
            msg += `- **Joueur inconnu** (ID: ${j.discord_id})\n`;
          }
        }
        msg += `\n*Tant pis pour eux ! N'hésitez pas à activer un rappel avec la commande \`/settings\` pour ne plus oublier votre tour.*`;
      }

      await channel.send(msg);
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
  handleModalPari
};
