import { editReply } from '../discord/replies';
import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { Joueur } from '../db/models';

export const data = new SlashCommandBuilder()
  .setName('settings')
  .setDescription('Modifier tes paramètres pour recevoir des rappels automatiques.')
  .addBooleanOption(option => option.setName('rappel_enigme').setDescription('Recevoir un MP quand le délai de 30 min pour faire un nouveau /deviner est fini.').setRequired(false))
  .addBooleanOption(option => option.setName('rappel_tour').setDescription("Recevoir un MP 2h avant la fin du tour si tu n'as pas encore joué.").setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const [joueur] = await Joueur.findOrCreate({ where: { discord_id: interaction.user.id } });
  const guess = interaction.options.getBoolean('rappel_enigme');
  const turn = interaction.options.getBoolean('rappel_tour');
  if (guess !== null) joueur.auto_remind_guess = guess;
  if (turn !== null) joueur.auto_remind_turn = turn;
  if (joueur.changed()) await joueur.save();
  const embed = new EmbedBuilder().setTitle('⚙️ Tes Paramètres de Rappel').setColor('#3498db')
    .addFields(
      { name: 'Rappel Énigme (30 min)', value: joueur.auto_remind_guess ? '✅ Activé' : '❌ Désactivé', inline: true },
      { name: 'Rappel Fin de Tour (2h avant)', value: joueur.auto_remind_turn ? '✅ Activé' : '❌ Désactivé', inline: true })
    .setFooter({ text: 'Utilise /settings en ajoutant les options pour modifier ces valeurs.' });
  await editReply(interaction, { embeds: [embed] });
}
