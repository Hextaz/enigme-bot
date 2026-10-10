import { InteractionEditReplyOptions } from 'discord.js';
import { afterGameAction } from '../game/transaction';

/** Command replies are sent after releasing the game lock. Build their payload before calling. */
export async function editReply(target: { editReply(payload: InteractionEditReplyOptions): Promise<unknown> }, payload: InteractionEditReplyOptions | string): Promise<void> {
  await afterGameAction(() => target.editReply(typeof payload === 'string' ? { content: payload } : payload));
}
