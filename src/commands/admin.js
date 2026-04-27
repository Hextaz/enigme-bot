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
  const publicSubcommands = ['start', 'lancer_enigme', 'stop', 'tour', 'give', 'remove', 'set_position'];

  if (subcommand !== 'programmer_enigme') {
    if (publicSubcommands.includes(subcommand)) {
      await interaction.deferReply();
    } else {
      await interaction.deferReply({ flags: 64 });
    }
  }

  if (subcommand === 'start') {
    await Joueur.destroy({ where: {} });
    const randomStarPos = Math.floor(Math.random() * 33) + 10;

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

    await interaction.editReply(`La saison a été réinitialisée et lancée ! L'Étoile est apparue sur la case ${randomStarPos}. 4 blocs cachés ont été placés secrètement. Utilisez \`/admin programmer_enigme\` pour le **Tour 1**.`);

  } else if (subcommand === 'programmer_enigme') {
    const reponse = interaction.options.getString('reponse');
    const plateau = await Plateau.findByPk(1);

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
      .setRequired(false);

    const indice2Input = new TextInputBuilder()
      .setCustomId('indice_2')
      .setLabel('Indice 19h')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false);

    const indice3Input = new TextInputBuilder()
      .setCustomId('indice_3')
      .setLabel('Indice 20h')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false);

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

    return interaction.editReply({ content: `📣 **Tour ${plateau.tour}/30** : Le tour a été incrémenté. Utilisez \`/admin programmer_enigme\` pour programmer l'énigme.` });

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
  }
},
};
