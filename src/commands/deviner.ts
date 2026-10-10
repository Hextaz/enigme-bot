import { afterGameAction } from '../game/transaction';
import { editReply } from '../discord/replies';
import { ids } from '../discord/custom-ids';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { Joueur, Plateau } from '../db/models';
import { recordGuess } from '../services/enigma';
import config = require('../config');

const COOLDOWN_MS = 30 * 60_000;

export const data = new SlashCommandBuilder()
  .setName('deviner')
  .setDescription("Proposer une réponse à l'énigme du jour.")
  .addStringOption(option => option.setName('mot').setDescription('Ta proposition de réponse').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const mot = interaction.options.getString('mot', true);
  const userId = interaction.user.id;
  const guess = await recordGuess(userId, new Date());
  if (guess.remainingMinutes > 0) {
    const joueur = await Joueur.findByPk(userId);
    if (joueur?.auto_remind_guess) {
      await editReply(interaction, { content: `⏳ Vous devez attendre encore ${guess.remainingMinutes} minute(s). Vous avez le rappel automatique activé, je vous enverrai un MP quand ce sera bon !` });
      return;
    }
    await editReply(interaction, {
      content: `⏳ Vous devez attendre encore ${guess.remainingMinutes} minute(s). Voulez-vous que je vous envoie un rappel en MP quand vous pourrez rejouer ?`,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`rappel_deviner_${userId}`).setLabel('Oui, rappelle-moi').setStyle(ButtonStyle.Primary))],
    });
    return;
  }
  const joueur = await Joueur.findByPk(userId);
  if (joueur?.auto_remind_guess) {
    // In-memory reminder: a restart drops it, which only costs a DM.
    setTimeout(() => {
      void (async () => {
        const plateau = await Plateau.findByPk(1);
        if (plateau?.enigme_status !== 'active') return;
        await interaction.user.send("⏰ Coucou ! Ton délai de 30 minutes est écoulé, tu peux de nouveau utiliser `/deviner` pour tenter une réponse !");
      })().catch(error => console.warn(`[WARN] Rappel /deviner impossible pour ${userId} :`, error instanceof Error ? error.message : error));
    }, COOLDOWN_MS).unref();
  }
  const mjId = config.mjUserId;
  if (!mjId) throw new Error('MJ_USER_ID manquant');
  await afterGameAction(async () => {
  const mj = await interaction.client.users.fetch(mjId);
  await mj.send({
    embeds: [new EmbedBuilder().setTitle("Nouvelle proposition d'énigme").setDescription(`Tentative de <@${userId}> : **${mot}**`).setColor('#f1c40f').setTimestamp()],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ids.judge.encode({ action: 'bad', userId })).setLabel('❌ Mauvaise réponse').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(ids.judge.encode({ action: 'spam', userId })).setLabel('🚫 Réponse non conforme').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ids.judge.encode({ action: 'good', userId })).setLabel('✅ Bonne réponse').setStyle(ButtonStyle.Success))],
  });
  await editReply(interaction, { content: `Ta proposition "**${mot}**" a bien été envoyée au Maître du Jeu !${guess.coinGranted ? '\n🪙 *+1 pièce de participation !*' : ''}` });
  });
}
