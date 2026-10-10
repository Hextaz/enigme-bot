import { afterGameAction } from '../game/transaction';
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, Client, EmbedBuilder, InteractionEditReplyOptions, SlashCommandBuilder, User, ButtonInteraction } from 'discord.js';
import { Joueur, Plateau } from '../db/models';
import { GameRuleError } from '../domain/types';
import { getActiveBoardCases } from '../gamemodes/registry';
import { generateBoardImage, BoardPlayer, BoardState } from '../utils/canvas';

const ZONES: Record<string, string> = {
  plage: '🏝️ Zone 1 : Plage & Jungle (Cases 1 - 30)',
  volcan: '🌋 Zone 2 : Passage Volcan (Cases 31 - 50)',
  sommet: '⛰️ Zone 3 : Le Sommet (Cases 51 - 73)',
};
const ZONE_BUTTONS: Record<string, string> = { plage: '🏝️ Plage & Jungle', volcan: '🌋 Passage Volcan', sommet: '⛰️ Le Sommet' };

export const data = new SlashCommandBuilder()
  .setName('plateau')
  .setDescription("Affiche la carte du plateau (navigation par zone sur l'île aux défis).");

/** Island map of one zone. Navigation buttons are stateless (zone in the customId), so they survive restarts. */
export async function zonePayload(user: User, zone: string, client: Client, snapshot?: { plateau: BoardState; players: BoardPlayer[] }): Promise<InteractionEditReplyOptions> {
  const plateau = snapshot?.plateau ?? await Plateau.findByPk(1);
  if (!plateau) throw new GameRuleError('CLOSED', 'Aucune partie en cours.');
  if (!ZONES[zone]) throw new GameRuleError('ZONE', 'Zone inconnue.');
  const players = (snapshot?.players ?? await Joueur.findAll()).sort((a, b) => Number(a.discord_id === user.id) - Number(b.discord_id === user.id));
  const image = new AttachmentBuilder(await generateBoardImage(players, plateau, client, zone), { name: 'board_zone.png' });
  const embed = new EmbedBuilder().setTitle("🗺️ L'Île aux Défis - Carte Interactive").setColor('#3498db').setImage('attachment://board_zone.png').setTimestamp()
    .setDescription(`Vous regardez actuellement :\n**${ZONES[zone]}**\n\n*Utilisez les boutons ci-dessous pour naviguer d'une zone à l'autre.*`)
    .setFooter({ text: `Tour ${plateau.tour}/30 | Demandé par ${user.username}` });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(Object.entries(ZONE_BUTTONS).map(([id, label]) =>
    new ButtonBuilder().setCustomId(`plateau_zone_${id}`).setLabel(label).setStyle(id === zone ? ButtonStyle.Success : ButtonStyle.Primary)));
  return { embeds: [embed], files: [image], components: [row] };
}

export async function showZone(interaction: ChatInputCommandInteraction | ButtonInteraction, zone: string): Promise<void> {
  const plateau = await Plateau.findByPk(1);
  if (!plateau) throw new GameRuleError('CLOSED', 'Aucune partie en cours.');
  const snapshot = { plateau: structuredClone(plateau.get({ plain: true })),
    players: (await Joueur.findAll()).map(p => structuredClone(p.get({ plain: true }))) };
  await afterGameAction(async () => interaction.editReply(await zonePayload(interaction.user, zone, interaction.client, snapshot)));
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const plateau = await Plateau.findByPk(1);
  if (!plateau) throw new GameRuleError('CLOSED', 'Aucune partie en cours.');
  if (plateau.game_mode !== 'ile_defis') {
    const state = structuredClone(plateau.get({ plain: true }));
    const players = (await Joueur.findAll()).map(p => structuredClone(p.get({ plain: true })));
    await afterGameAction(async () => {
      const image = new AttachmentBuilder(await generateBoardImage(players, state, interaction.client), { name: 'board.png' });
      await interaction.editReply({ content: `🗺️ **Voici la carte complète du plateau actuel (${state.game_map}) :**`, files: [image] });
    });
    return;
  }
  const joueur = await Joueur.findByPk(interaction.user.id);
  const zone = (joueur && getActiveBoardCases(plateau).find(c => c.id === joueur.position)?.zone) || 'plage';
  await showZone(interaction, zone);
}
