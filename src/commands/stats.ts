import { editReply } from '../discord/replies';
import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { Joueur } from '../db/models';

export const data = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('Affiche le classement et les statistiques des joueurs.');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const joueurs = await Joueur.findAll({ order: [['etoiles', 'DESC'], ['pieces', 'DESC']] });
  if (!joueurs.length) {
    await editReply(interaction, { content: "Aucun joueur n'a encore participé." });
    return;
  }
  // Discord limits an embed to 25 fields.
  const embed = new EmbedBuilder().setTitle('🏆 Classement de la Saison').setColor('#FFD700')
    .setDescription('Voici les statistiques actuelles des joueurs :')
    .addFields(joueurs.slice(0, 25).map((joueur, index) => {
      const user = interaction.client.users.cache.get(joueur.discord_id);
      return {
        name: `#${index + 1} - ${user ? user.username : `Joueur Inconnu (${joueur.discord_id})`}`,
        value: `⭐ Étoiles : ${joueur.etoiles} | 💰 Pièces : ${joueur.pieces} | 📍 Position : ${joueur.position}\n🎒 Inventaire : ${joueur.inventaire.length ? joueur.inventaire.join(', ') : 'Vide'}`,
      };
    }));
  await editReply(interaction, { embeds: [embed] });
}
