const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
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
    .setName('programmer_enigme')
    .setDescription('Programmer l\'énigme du jour (publiée à 17h, indices à 18h/19h/20h, fin à 21h).')
    .addStringOption(option => option.setName('reponse').setDescription('La réponse attendue à l\'énigme').setRequired(true))
)
.addSubcommand(subcommand =>
  subcommand
    .setName('lancer_enigme')
    .setDescription('Incrémente le tour sans programmer d\'énigme (usage exceptionnel).')
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
    .addIntegerOption(option => option.setName('quantite').setDescription('Quantité (pour pièces/étoiles)').setMinValue(1))
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
    .addIntegerOption(option => option.setName('quantite').setDescription('Quantité (pour pièces/étoiles)').setMinValue(1))
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
)
.addSubcommand(subcommand =>
  subcommand
    .setName('annuler_tour')
    .setDescription('Annule le tour en cours d\'un joueur et le remet à son état initial.')
    .addUserOption(option => option.setName('joueur').setDescription('Le joueur concerné').setRequired(true))
),
async execute(interaction) {
  try {
    const subcommand = interaction.options.getSubcommand();
    const publicSubcommands = ['start', 'lancer_enigme', 'stop', 'tour', 'give', 'remove', 'set_position'];

    if (subcommand !== 'programmer_enigme') {
      if (publicSubcommands.includes(subcommand)) {
        await interaction.deferReply().catch((err) => {
          console.error(`[ADMIN] deferReply failed for ${subcommand}:`, err);
          if (err.code === 10062) {
            console.log(`[ADMIN] Interaction expired for ${subcommand}, attempting to continue...`);
          }
        });
      } else {
        await interaction.deferReply({ flags: 64 }).catch((err) => {
          console.error(`[ADMIN] deferReply failed for ${subcommand}:`, err);
          if (err.code === 10062) {
            console.log(`[ADMIN] Interaction expired for ${subcommand}, attempting to continue...`);
          }
        });
      }
    }

    if (subcommand === 'start') {
      const registry = require('../gamemodes/registry');
      const { EmbedBuilder, StringSelectMenuBuilder } = require('discord.js');
      
      const modes = registry.getAllModes();
      if (modes.length === 0) {
        return interaction.editReply("❌ Aucun mode de jeu n'a été détecté dans `src/gamemodes/` ! Vérifiez l'arborescence.").catch(()=>{});
      }

      const embed = new EmbedBuilder()
        .setTitle('🎮 Initialisation du Plateau - Étape 1/3')
        .setDescription('Sélectionnez le **mode de jeu** à lancer pour cette nouvelle partie. Chaque mode propose ses propres règles et sa propre logique d\'événements.')
        .setColor('#5865F2')
        .setFooter({ text: 'Étape 1 sur 3 — Sélection du Mode' });

      modes.forEach(mode => {
        embed.addFields({
          name: `${mode.emoji} ${mode.name}`,
          value: `${mode.description}\n*(Nombre de tours max : ${mode.maxTours})*`
        });
      });

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('admin_start_mode')
        .setPlaceholder('Sélectionnez le mode de jeu...')
        .addOptions(
          modes.map(mode => ({
            label: mode.name,
            value: mode.id,
            description: mode.description.slice(0, 100),
            emoji: mode.emoji
          }))
        );

      const row = new ActionRowBuilder().addComponents(selectMenu);

      await interaction.editReply({
        content: null,
        embeds: [embed],
        components: [row]
      }).catch((err) => {
        console.error(`[ADMIN] start subcommand reply failed:`, err);
      });

    } else if (subcommand === 'programmer_enigme') {
      const reponse = interaction.options.getString('reponse');

      // Ouvrir le modal pour saisir l'énigme et les indices
      const modal = new ModalBuilder()
        .setCustomId(`modal_programmer_enigme_${encodeURIComponent(reponse)}`)
        .setTitle('Programmer l\'énigme du jour');

      const enigmeInput = new TextInputBuilder()
        .setCustomId('enigme_text')
        .setLabel('Énigme du jour')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
      .setPlaceholder('Entrez le texte de l\'énigme...');

    const indice1Input = new TextInputBuilder()
      .setCustomId('indice_1')
      .setLabel('Indice 18h')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const indice2Input = new TextInputBuilder()
      .setCustomId('indice_2')
      .setLabel('Indice 19h')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const indice3Input = new TextInputBuilder()
      .setCustomId('indice_3')
      .setLabel('Indice 20h')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const firstRow = new ActionRowBuilder().addComponents(enigmeInput);
    const secondRow = new ActionRowBuilder().addComponents(indice1Input);
    const thirdRow = new ActionRowBuilder().addComponents(indice2Input);
    const fourthRow = new ActionRowBuilder().addComponents(indice3Input);
    modal.addComponents(firstRow, secondRow, thirdRow, fourthRow);

    await interaction.showModal(modal);

  } else if (subcommand === 'lancer_enigme') {
    let plateau = await Plateau.findByPk(1);
    if (!plateau) {
      plateau = await Plateau.create({ id: 1 });
    }
    plateau.tour += 1;
    plateau.enigme_resolue = false;
    plateau.enigme_status = 'programmee';
    await plateau.save();

    return interaction.editReply({ content: `📣 **Tour ${plateau.tour}/30** : Le tour a été incrémenté. Utilisez \`/admin programmer_enigme\` pour programmer l'énigme.` }).catch((err) => {
      console.error(`[ADMIN] editReply failed for lancer_enigme:`, err);
      if (err.code === 10062) {
        console.log(`[ADMIN] Interaction expired for lancer_enigme command`);
      }
    });

  } else if (subcommand === 'stop') {
    const { endSeason } = require('../game/endgame');
    await endSeason(interaction.client);
    return interaction.editReply("La saison a été arrêtée manuellement. L'annonce finale a été postée sur le canal du plateau.").catch((err) => {
      console.error(`[ADMIN] editReply failed for stop:`, err);
      if (err.code === 10062) {
        console.log(`[ADMIN] Interaction expired for stop command`);
      }
    });

  } else if (subcommand === 'give' || subcommand === 'remove') {
    const targetUser = interaction.options.getUser('joueur');
    const ressource = interaction.options.getString('ressource');

    let joueur = await Joueur.findByPk(targetUser.id);
    if (!joueur) {
      if (subcommand === 'remove') return interaction.editReply({ content: "Ce joueur n'existe pas dans la base de données.", flags: 64 }).catch((err) => {
        console.error(`[ADMIN] editReply failed for remove (player not found):`, err);
        if (err.code === 10062) {
          console.log(`[ADMIN] Interaction expired for remove command`);
        }
      });
      joueur = await Joueur.create({ discord_id: targetUser.id });
    }

    if (ressource === 'pieces' || ressource === 'etoiles') {
      const quantite = interaction.options.getInteger('quantite');
      if (!quantite || quantite <= 0) {
        return interaction.editReply({ content: "Veuillez entrer une quantité valide et positive.", flags: 64 }).catch((err) => {
          console.error(`[ADMIN] editReply failed for invalid quantity:`, err);
          if (err.code === 10062) {
            console.log(`[ADMIN] Interaction expired for invalid quantity`);
          }
        });
      }

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
        const row = generateGiveObjetSelectMenu(targetUser.id);
        await interaction.editReply({
          content: `Quel objet veux-tu donner à <@${targetUser.id}> ?`,
          components: [row]
        });
      } else {
        if (joueur.inventaire.length === 0) {
          return interaction.editReply({
            content: `<@${targetUser.id}> n'a aucun objet dans son inventaire.`,
            flags: 64
          });
        }

        const row = generateRemoveObjetSelectMenu(targetUser.id, joueur.inventaire);
        await interaction.editReply({
          content: `Quel objet veux-tu retirer à <@${targetUser.id}> ?`,
          components: [row]
        });
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
    await joueur.save();
    await interaction.editReply(`⏳ Le cooldown de <@${targetUser.id}> a été réinitialisé. Il peut rejouer immédiatement.`);

  } else if (subcommand === 'tour') {
    const numero = interaction.options.getInteger('numero');
    await Plateau.update({ tour: numero }, { where: { id: 1 } });
    await interaction.editReply(`Le tour a été défini sur **${numero}**.`);

  } else if (subcommand === 'open_black_market') {
    const today = new Date();
    if (today.getDay() !== 0) {
      return interaction.editReply({ content: 'Cette commande ne peut être utilisée que le dimanche !', flags: 64 });
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

    const config = require('../config');
    const channel = interaction.client.channels.cache.get(config.boardChannelId);

    if (channel) {
      let mentionRole = config.roleEnigmeId ? `<@&${config.roleEnigmeId}> ` : '';
      await channel.send(`${mentionRole}🛍️ **LE MARCHÉ NOIR EST OUVERT ! (Action manuelle du MJ)** 🛍️\nLe plateau est déverrouillé, aucune énigme aujourd'hui. Les boutiques proposent des objets dévastateurs exclusifs ! Utilisez \`/jouer\` pour en profiter !`);
    }

    await interaction.editReply({ content: '✅ Le Marché Noir a été ouvert manuellement avec succès et tous les joueurs ont été débloqués.', flags: 64 });

  } else if (subcommand === 'annuler_tour') {
    const { TourSnapshot } = require('../db/models');
    const { getLockedUser, forceUnlock } = require('../game/transaction');
    const targetUser = interaction.options.getUser('joueur');

    // Vérifier si le joueur est actuellement verrouillé
    const lockedUser = getLockedUser();

    if (lockedUser === targetUser.id) {
      // Forcer le déverrouillage
      forceUnlock();
      console.log(`[ADMIN] Force unlock for user ${targetUser.id} during tour cancellation`);
    }

    const joueur = await Joueur.findByPk(targetUser.id);
    if (!joueur) {
      return interaction.editReply({ content: "Ce joueur n'existe pas dans la base de données.", flags: 64 });
    }

    const plateau = await Plateau.findByPk(1);

    // Trouver le snapshot le plus récent pour ce joueur et ce tour
    const snapshot = await TourSnapshot.findOne({
      where: {
        discord_id: targetUser.id,
        tour: plateau.tour
      },
      order: [['timestamp', 'DESC']]
    });

    if (!snapshot) {
      return interaction.editReply({ content: `Aucun snapshot trouvé pour <@${targetUser.id}> au tour ${plateau.tour}.`, flags: 64 });
    }

    // Restaurer l'état du joueur
    joueur.position = snapshot.position;
    joueur.pieces = snapshot.pieces;
    joueur.etoiles = snapshot.etoiles;
    joueur.inventaire = snapshot.inventaire;
    joueur.a_le_droit_de_jouer = true; // Débloquer le joueur
    joueur.a_joue_ce_tour = false;
    joueur.cases_restantes = 0;
    joueur.jours_inactifs = snapshot.jours_inactifs;
    joueur.est_fantome = snapshot.est_fantome;
    joueur.fantome_unblock_used = snapshot.fantome_unblock_used;
    joueur.bonus_prochain_lancer = snapshot.bonus_prochain_lancer;
    joueur.de_limite = snapshot.de_limite;
    joueur.type_de = snapshot.type_de;
    joueur.de_pipe_valeur = snapshot.de_pipe_valeur;

    await joueur.save();

    // Restaurer l'état global si nécessaire
    if (snapshot.plateau_position_etoile !== plateau.position_etoile) {
      plateau.position_etoile = snapshot.plateau_position_etoile;
      await plateau.save();
    }

    if (JSON.stringify(snapshot.plateau_pieges_actifs) !== JSON.stringify(plateau.pieges_actifs)) {
      plateau.pieges_actifs = snapshot.plateau_pieges_actifs;
      await plateau.save();
    }

    if (JSON.stringify(snapshot.plateau_blocs_caches) !== JSON.stringify(plateau.blocs_caches)) {
      plateau.blocs_caches = snapshot.plateau_blocs_caches;
      await plateau.save();
    }

    // Restaurer les autres joueurs si nécessaire
    if (snapshot.autres_joueurs_snapshot && snapshot.autres_joueurs_snapshot.length > 0) {
      for (const otherSnapshot of snapshot.autres_joueurs_snapshot) {
        const otherJoueur = await Joueur.findByPk(otherSnapshot.discord_id);
        if (otherJoueur) {
          otherJoueur.pieces = otherSnapshot.pieces;
          otherJoueur.etoiles = otherSnapshot.etoiles;
          otherJoueur.inventaire = otherSnapshot.inventaire;
          otherJoueur.position = otherSnapshot.position;
          await otherJoueur.save();
        }
      }
    }

    // Supprimer le snapshot après restauration
    await snapshot.destroy();

    await interaction.editReply(`🔄 **Tour annulé !** <@${targetUser.id}> a été remis dans son état initial du tour ${plateau.tour}. Il peut maintenant rejouer.`).catch((err) => {
      console.error(`[ADMIN] editReply failed for annuler_tour:`, err);
      if (err.code === 10062) {
        console.log(`[ADMIN] Interaction expired for annuler_tour command`);
      }
    });

    // Notifier sur le canal du plateau
    const config = require('../config');
    const channel = interaction.client.channels.cache.get(config.boardChannelId);
    if (channel) {
      await channel.send(`🔄 **ANNULATION DE TOUR** : Le tour de <@${targetUser.id}> a été annulé par un admin. Il a été remis dans son état initial.`).catch((err) => {
        console.error(`[ADMIN] Failed to send tour cancellation notification:`, err);
      });
    }
    }
  } catch (err) {
    console.error(`[ADMIN] Error in admin command ${interaction.options.getSubcommand()}:`, err);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: '❌ Une erreur est survenue lors de l\'exécution de la commande admin.',
          flags: 64
        }).catch((e) => {
          console.error(`[ADMIN] Failed to send error follow-up:`, e);
          if (e.code === 10062) {
            console.log(`[ADMIN] Interaction expired when trying to send error message`);
          }
        });
      }
    } catch (e) {
      console.error(`[ADMIN] Critical error - could not notify user of failure:`, e);
    }
  }
},
};

function generateGiveObjetSelectMenu(userId) {
  const { ITEMS } = require('../game/items');
  const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

  const options = Object.values(ITEMS).map(item => ({
    label: item.name,
    value: item.name
  }));

  const select = new StringSelectMenuBuilder()
    .setCustomId(`admin_give_objet_${userId}`)
    .setPlaceholder('Choisis un objet à donner')
    .addOptions(options);

  return new ActionRowBuilder().addComponents(select);
}

function generateRemoveObjetSelectMenu(userId, inventory) {
  const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

  const options = inventory.map((itemName, index) => ({
    label: `${index + 1}. ${itemName}`,
    value: itemName
  }));

  const select = new StringSelectMenuBuilder()
    .setCustomId(`admin_remove_objet_${userId}`)
    .setPlaceholder('Choisis un objet à retirer')
    .addOptions(options);

  return new ActionRowBuilder().addComponents(select);
}
