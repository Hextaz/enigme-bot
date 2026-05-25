const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { Joueur, Plateau } = require('../db/models');
const { generateBoardImage } = require('../utils/canvas');
const { getCase } = require('../gamemodes/ile_defis/maps/board_game_island/board');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('plateau')
    .setDescription('Affiche la carte interactive du plateau de l\'île aux défis.'),
  async execute(interaction) {
    await interaction.deferReply();

    const userId = interaction.user.id;
    let joueur = await Joueur.findByPk(userId);
    if (!joueur) {
      joueur = await Joueur.create({ discord_id: userId, a_le_droit_de_jouer: true });
    }

    const plateau = await Plateau.findByPk(1);
    const todosLosJoueurs = await Joueur.findAll();

    // Si on n'est pas dans le mode Île aux défis, on affiche simplement le plateau normal
    if (plateau && plateau.game_mode !== 'ile_defis') {
      const buffer = await generateBoardImage(todosLosJoueurs, plateau, interaction.client);
      const attachment = new AttachmentBuilder(buffer, { name: 'board.png' });
      return interaction.editReply({ 
        content: `🗺️ **Voici la carte complète du plateau actuel (${plateau.game_map}) :**`, 
        files: [attachment] 
      });
    }

    // --- MODE L'ÎLE AUX DÉFIS ---
    // Déterminer la zone de départ du joueur appelant
    const playerCase = getCase(joueur.position);
    let activeZone = playerCase ? (playerCase.zone || 'plage') : 'plage';

    // Fonction d'aide pour générer le message de zone
    async function createZonePayload(zone) {
      // Trier pour placer le joueur actif à la fin (dessiné en dernier/devant)
      let sortedPlayers = [...todosLosJoueurs].sort((a, b) => 
        a.discord_id === userId ? 1 : b.discord_id === userId ? -1 : 0
      );
      
      const buffer = await generateBoardImage(sortedPlayers, plateau, interaction.client, zone);
      const attachment = new AttachmentBuilder(buffer, { name: 'board_zone.png' });

      const zoneNames = {
        plage: "🏝️ Zone 1 : Plage & Jungle (Cases 1 - 30)",
        volcan: "🌋 Zone 2 : Passage Volcan (Cases 31 - 50)",
        sommet: "⛰️ Zone 3 : Le Sommet (Cases 51 - 73)"
      };

      const embed = new EmbedBuilder()
        .setTitle(`🗺️ L'Île aux Défis - Carte Interactive`)
        .setDescription(`Vous regardez actuellement :\n**${zoneNames[zone]}**\n\n*Utilisez les boutons ci-dessous pour naviguer instantanément d'une zone à l'autre sans temps de chargement !*`)
        .setColor('#3498db')
        .setImage('attachment://board_zone.png')
        .setFooter({ text: `Tour ${plateau.tour}/30 | Demandé par ${interaction.user.username}` })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('plateau_plage')
          .setLabel('🏝️ Plage & Jungle')
          .setStyle(zone === 'plage' ? ButtonStyle.Success : ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('plateau_volcan')
          .setLabel('🌋 Passage Volcan')
          .setStyle(zone === 'volcan' ? ButtonStyle.Success : ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('plateau_sommet')
          .setLabel('⛰️ Le Sommet')
          .setStyle(zone === 'sommet' ? ButtonStyle.Success : ButtonStyle.Primary)
      );

      return { embeds: [embed], files: [attachment], components: [row] };
    }

    const payload = await createZonePayload(activeZone);
    const message = await interaction.editReply(payload);

    // Collecteur de clics sur les boutons de navigation (valide 5 minutes)
    const collector = message.createMessageComponentCollector({
      filter: (i) => i.user.id === interaction.user.id,
      time: 300000
    });

    collector.on('collect', async (i) => {
      try {
        await i.deferUpdate();
        
        let targetZone = activeZone;
        if (i.customId === 'plateau_plage') targetZone = 'plage';
        else if (i.customId === 'plateau_volcan') targetZone = 'volcan';
        else if (i.customId === 'plateau_sommet') targetZone = 'sommet';

        if (targetZone !== activeZone) {
          activeZone = targetZone;
          const newPayload = await createZonePayload(activeZone);
          await i.editReply(newPayload);
        }
      } catch (err) {
        console.error("[ERROR PLATEAU] Erreur lors de la pagination :", err);
      }
    });

    collector.on('end', async () => {
      try {
        // Désactiver les boutons après expiration
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('pl1').setLabel('🏝️ Plage').setStyle(ButtonStyle.Secondary).setDisabled(true),
          new ButtonBuilder().setCustomId('pl2').setLabel('🌋 Volcan').setStyle(ButtonStyle.Secondary).setDisabled(true),
          new ButtonBuilder().setCustomId('pl3').setLabel('⛰️ Sommet').setStyle(ButtonStyle.Secondary).setDisabled(true)
        );
        await message.edit({ components: [row] }).catch(()=>{});
      } catch(e){}
    });
  }
};
