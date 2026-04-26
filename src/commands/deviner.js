const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { Joueur, Plateau } = require('../db/models');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('deviner')
    .setDescription('Proposer une réponse à l\'énigme du jour.')
    .addStringOption(option =>
      option.setName('mot')
        .setDescription('Ta proposition de réponse')
        .setRequired(true)
    ),
  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });
    const mot = interaction.options.getString('mot');
    const userId = interaction.user.id;

    let joueur = await Joueur.findByPk(userId);
    if (!joueur) {
      joueur = await Joueur.create({ discord_id: userId });
    }

    if (joueur.est_fantome) {
      return interaction.editReply({ content: "👻 Tu es en mode fantôme ! Utilise la commande `/jouer` pour te débloquer avant de pouvoir deviner.", flags: 64 });
    }

    const plateau = await Plateau.findByPk(1);

    // Vérifications du statut de l'énigme
    if (plateau.enigme_status === 'programmee') {
      return interaction.editReply({ content: "⏳ L'énigme n'est pas encore publiée ! Reviens à **17h** pour tenter ta chance.", flags: 64 });
    }
    if (plateau.enigme_status === 'finished') {
      return interaction.editReply({ content: "L'énigme du jour est déjà terminée !", flags: 64 });
    }
    if (plateau.enigme_status !== 'active') {
      return interaction.editReply({ content: "Aucune énigme n'est en cours actuellement.", flags: 64 });
    }

    // Vérifier si le joueur a déjà trouvé
    if (joueur.a_trouve_enigme) {
      return interaction.editReply({ content: "🎉 Tu as déjà trouvé la bonne réponse aujourd'hui ! Tu ne peux plus deviner.", flags: 64 });
    }

    // Cooldown check (30 minutes)
    const COOLDOWN_MINUTES = 30;
    const now = new Date();
    if (joueur.last_deviner_time) {
      const diffMs = now - new Date(joueur.last_deviner_time);
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < COOLDOWN_MINUTES) {
        const remainingMins = COOLDOWN_MINUTES - diffMins;

        if (joueur.auto_remind_guess) {
          return interaction.editReply({
            content: `⏳ Vous devez attendre encore ${remainingMins} minute(s). Vous avez le rappel automatique activé, je vous enverrai un MP quand ce sera bon !`,
            flags: 64
          });
        } else {
          const row = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`rappel_deviner_${userId}`)
                .setLabel('Oui, rappelle-moi')
                .setStyle(ButtonStyle.Primary)
            );

          return interaction.editReply({
            content: `⏳ Vous devez attendre encore ${remainingMins} minute(s). Voulez-vous que je vous envoie un rappel en MP quand vous pourrez rejouer ?`,
            components: [row],
            flags: 64
          });
        }
      }
    }

    // Update cooldown & Add coins si guess_du_jour < 3 (max 3 pièces de participation)
    let coinMessage = "";
    if (joueur.guess_du_jour < 3) {
      joueur.pieces += 1;
      joueur.guess_du_jour += 1;
      coinMessage = "\n🪙 *+1 pièce de participation !*";
    }
    joueur.last_deviner_time = now;
    await joueur.save();

    if (joueur.auto_remind_guess) {
      setTimeout(async () => {
        const p = await Plateau.findByPk(1);
        if (p && p.enigme_status !== 'finished') {
          try {
            const notifyUser = await interaction.client.users.fetch(userId);
            if (notifyUser) {
              await notifyUser.send("⏰ Coucou ! Ton délai de 30 minutes est écoulé, tu peux de nouveau utiliser `/deviner` pour tenter une réponse !");
            }
          } catch (e) {
            console.error("Impossible d'envoyer le rappel:", e);
          }
        }
      }, COOLDOWN_MINUTES * 60000);
    }

    // Send to MJ
    try {
      const mjUser = await interaction.client.users.fetch(config.mjUserId);
      if (mjUser) {
        const embed = new EmbedBuilder()
          .setTitle('Nouvelle proposition d\'énigme')
          .setDescription(`Tentative de <@${userId}> : **${mot}**`)
          .setColor('#f1c40f')
          .setTimestamp();

        const safeMot = mot.substring(0, 50);

        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`reponse_bad_${userId}_${safeMot}`)
              .setLabel('❌ Mauvaise réponse')
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(`reponse_spam_${userId}_${safeMot}`)
              .setLabel('🚫 Réponse non conforme')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId(`reponse_good_${userId}_${safeMot}`)
              .setLabel('✅ Bonne réponse')
              .setStyle(ButtonStyle.Success)
          );

        await mjUser.send({ embeds: [embed], components: [row] });
      }
    } catch (error) {
      console.error("Erreur lors de l'envoi au MJ:", error);
      return interaction.editReply({ content: "Une erreur est survenue lors de l'envoi de ta réponse au MJ.", flags: 64 });
    }

    await interaction.editReply({ content: `Ta proposition "**${mot}**" a bien été envoyée au Maître du Jeu !${coinMessage}`, flags: 64 });
  },
};
