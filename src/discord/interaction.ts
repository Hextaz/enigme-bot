import { Interaction, MessageFlags } from 'discord.js';
import { GameBusyError, PresentationError, withGameLock } from '../game/transaction';
import { GameRuleError } from '../domain/types';
import config = require('../config');

const PUBLIC_ADMIN_SUBCOMMANDS = ['start', 'lancer_enigme', 'stop', 'tour', 'give', 'remove', 'set_position'];

/** Replies visible by the whole channel; everything else is private to the user. */
export function isPublicReply(interaction: Interaction): boolean {
  if (!interaction.isChatInputCommand()) return false;
  if (interaction.commandName === 'plateau') return true;
  return interaction.commandName === 'admin' && PUBLIC_ADMIN_SUBCOMMANDS.includes(interaction.options.getSubcommand());
}
/** `showModal` must be the first response, so these interactions are not acknowledged in advance. */
export function opensModal(interaction: Interaction): boolean {
  if (interaction.isChatInputCommand()) return interaction.commandName === 'admin' && interaction.options.getSubcommand() === 'programmer_enigme';
  return interaction.isButton() && interaction.customId.startsWith('pari_');
}
function isPrivileged(customId: string): boolean {
  return customId.startsWith('admin_') || customId.startsWith('reponse_') || customId.startsWith('modal_programmer_enigme');
}

export async function handleInteraction(interaction: Interaction, dispatch: (value: Interaction) => Promise<unknown>): Promise<void> {
  if (!interaction.isRepliable()) return;
  const id = 'customId' in interaction ? interaction.customId : '';
  const privileged = isPrivileged(id);
  try {
  if (privileged && interaction.user.id !== config.mjUserId) {
    await interaction.reply({ content: 'Cette action est réservée au Maître du Jeu.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (interaction.isMessageComponent() && !privileged && !id.startsWith('pari_')) {
    const owner = interaction.message.interactionMetadata?.user.id ?? interaction.message.interaction?.user.id;
    if (owner && owner !== interaction.user.id) {
      await interaction.reply({ content: "Ce bouton n'est pas pour toi.", flags: MessageFlags.Ephemeral });
      return;
    }
  }
    // Lock acquisition never waits for interactive traffic, so modal responses stay immediate.
    if (!opensModal(interaction)) {
        if (interaction.isMessageComponent()) await interaction.deferUpdate();
        else if (isPublicReply(interaction)) await interaction.deferReply();
        else await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }
    await withGameLock(interaction.user.id, () => dispatch(interaction));
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
    if (code === 10062 || code === 40060) {
      console.warn('[TIMEOUT] Interaction non acquittable :', code);
      return;
    }
    const expected = error instanceof GameBusyError || error instanceof GameRuleError || error instanceof PresentationError;
    if (error instanceof PresentationError) console.error('[ERROR] Publication après validation :', error);
    if (!expected) console.error('[ERROR] Interaction échouée :', error);
    const content = expected ? (error as Error).message : 'Une erreur est survenue. Réessaie dans un instant.';
    try {
      if (interaction.deferred || interaction.replied) await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
      else await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    } catch (responseError) { console.warn('[WARN] Réponse Discord impossible :', responseError); }
  }
}
