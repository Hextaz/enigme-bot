import { afterGameAction } from '../game/transaction';
import { editGameReply, GameView } from '../discord/game-view';
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction, ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { Joueur, Plateau } from '../db/models';
import { GameRuleError } from '../domain/types';
import { getActiveMode } from '../gamemodes/registry';
import { PromptRow } from '../gamemodes/mode-interface';
import { BOARD_IMAGE_EXTENSION, generateZoomedBoardImage } from '../utils/canvas';
import { parisClock } from '../utils/time';

export const data = new SlashCommandBuilder()
  .setName('jouer')
  .setDescription('Affiche le menu privé pour jouer sur le plateau.');

const button = (id: string, label: string, style: ButtonStyle, disabled = false) =>
  new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);

export async function execute(interaction: ChatInputCommandInteraction | ButtonInteraction): Promise<void> {
  const plateau = await Plateau.findByPk(1);
  if (!plateau) throw new GameRuleError('CLOSED', "Aucune partie n'est configurée. Le Maître du Jeu doit lancer `/admin start`.");
  const mode = getActiveMode(plateau);
  const [joueur] = await Joueur.findOrCreate({ where: { discord_id: interaction.user.id },
    defaults: { discord_id: interaction.user.id, a_le_droit_de_jouer: true, mode_data: mode.getInitialPlayerData(plateau.game_variant) } });
  const players = await Joueur.findAll();
  const rank = [...players].sort((a, b) => b.etoiles - a.etoiles || b.pieces - a.pieces).findIndex(j => j.discord_id === joueur.discord_id) + 1;
  const playerSnapshot = structuredClone(joueur.get({ plain: true }));
  const boardSnapshot = structuredClone(plateau.get({ plain: true }));
  const playerSnapshots = players.map(p => structuredClone(p.get({ plain: true })));
  const render = (view: GameView) => afterGameAction(async () => {
    const image = new AttachmentBuilder(await generateZoomedBoardImage(playerSnapshot, playerSnapshots, boardSnapshot, interaction.client), { name: `zoomed_board.${BOARD_IMAGE_EXTENSION}` });
    await editGameReply(interaction, { ...view, files: [image] });
  });
  const viewRow = () => new ActionRowBuilder<ButtonBuilder>().addComponents(button('voir_plateau', '🗺️ Voir le plateau', ButtonStyle.Success));
  const header = `**Tour ${plateau.tour}/30**`;

  if (plateau.enigme_status === 'season_ended') {
    await render({ components: [viewRow()],
      content: '🏆 **LA SAISON EST TERMINÉE !** 🏆\n\nLe podium final a été annoncé et les vainqueurs ont été récompensés. Merci à tous pour votre participation ! 🎉' });
    return;
  }
  if (joueur.est_fantome) {
    let content = `${header}\n\n👻 **MODE FANTÔME ACTIVÉ** 👻\nTu n'as pas joué pendant 3 jours. Tu es en mode fantôme et ton personnage est bloqué.\n`;
    const components: ActionRowBuilder<ButtonBuilder>[] = [];
    if (!joueur.fantome_unblock_used) {
      content += '\nTu peux te débloquer **UNE SEULE FOIS** pour cette partie. Veux-tu revenir dans la partie ?';
      components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(button('unblock_fantome', '🔓 Me débloquer (Unique)', ButtonStyle.Success)));
    } else content += "\n💥 Tu as déjà utilisé ton déblocage unique pour cette partie. Tu es donc définitivement éliminé(e) jusqu'à la prochaine partie de 30 tours.";
    await render({ content, components });
    return;
  }

  let content = `${header}\n**Tes statistiques :**\n⭐ Étoiles : **${joueur.etoiles}** | 🪙 Pièces : **${joueur.pieces}** | 🏆 Classement : **${rank}/${players.length}**\n\nTu es sur la case **${joueur.position}**. Que veux-tu faire ?`;
  const saturday = parisClock().weekday === 6 && mode.hasShop;
  const locked = plateau.enigme_status === 'active';
  const canPlay = joueur.a_le_droit_de_jouer && !saturday && !locked;
  const components: PromptRow[] = [];
  const pending = mode.getInteractions().renderPending(joueur, plateau);
  const actions = new ActionRowBuilder<ButtonBuilder>();
  if (pending) {
    content += `\n\n⏸️ **Un choix t'attend :** ${pending.content}`;
    components.push(...pending.components);
  } else if (joueur.cases_restantes > 0) actions.addComponents(button('continuer_deplacement', `🚶 Continuer (${joueur.cases_restantes} cases)`, ButtonStyle.Success, saturday || locked));
  else actions.addComponents(button('lancer_de', '🎲 Lancer le dé', ButtonStyle.Primary, !canPlay));
  actions.addComponents(button('inventaire', '🎒 Inventaire', ButtonStyle.Secondary), button('voir_plateau', '🗺️ Voir le plateau', ButtonStyle.Success));
  if (joueur.inventaire.length) actions.addComponents(button('utiliser_objet', '🪄 Utiliser un objet', ButtonStyle.Danger, !canPlay || !!pending));
  components.push(actions);
  if (saturday) content += "\n\n🎰 *C'est samedi ! Il n'y a pas de lancer de dé aujourd'hui. Place aux paris sur la course de Yoshis !*";
  else if (!joueur.a_le_droit_de_jouer && joueur.cases_restantes <= 0 && !pending) content += "\n\n⏳ *Tu as déjà joué aujourd'hui ! Reviens demain après la nouvelle énigme.*";
  await render({ content, components });
}
