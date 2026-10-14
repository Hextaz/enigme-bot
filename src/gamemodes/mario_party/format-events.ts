import { LandingEvent } from './events';
import type { ItemUse } from './turn';

export function formatItemUse(used: ItemUse): { privateText: string; publicText: string | null } {
  const effect = used.effect;
  const mention = `<@${used.actorId}>`;
  let detail: string;
  let publicText: string | null = null;
  switch (effect.kind) {
    case 'modifier': detail = effect.modifier === 'champignon' ? 'Ton prochain lancer aura +3 !'
      : effect.modifier === 'double_de' ? 'Ton prochain lancer sera entre 2 et 20 !' : 'Ton prochain lancer sera entre 3 et 30 !'; break;
    case 'trap': detail = `Un piège à ${effect.resource === 'pieces' ? 'pièces' : 'Étoile'} a été posé sur la case ${effect.position} !`; break;
    case 'loaded_die': detail = `Ton prochain lancer fera exactement ${effect.value} !`; break;
    case 'teleport':
      detail = effect.golden ? `Tu as été téléporté juste devant l'Étoile (case ${effect.position}) !` : `Tu as été téléporté sur la case ${effect.position} !`;
      publicText = effect.golden ? `🏆 ${mention} a utilisé un Tuyau Doré et atterrit devant l'Étoile !` : `🧪 ${mention} a utilisé un Tuyau et atterrit sur la case ${effect.position} !`; break;
    case 'mirror':
      detail = effect.targetId ? `Tu as échangé ta position avec <@${effect.targetId}> !` : "Mais il n'y a personne avec qui échanger !";
      if (effect.targetId) publicText = `🪞 ${mention} a utilisé un Miroir et échangé sa place avec <@${effect.targetId}> !`; break;
    case 'star_moved': detail = "L'Étoile s'est déplacée !";
      publicText = `🎺 ${mention} a utilisé un Sifflet ! L'Étoile se déplace sur la case ${effect.position} !`; break;
  }
  return { privateText: `Tu as utilisé **${used.item.name}** ! ${detail}`, publicText };
}

export function formatLandingEvent(event: LandingEvent): string {
  switch (event.kind) {
    case 'hidden_star': return `\n\n🤫✨ **INCROYABLE !** <@${event.actorId}> a découvert un **BLOC CACHÉ** sur cette case et obtient une **ÉTOILE** (+1 🌟) !`;
    case 'hidden_twenty': return `\n\n🤫💰 **GÉNIAL !** <@${event.actorId}> a découvert un **BLOC CACHÉ** riche en joyaux sur cette case et obtient **20 PIÈCES** (+20 🪙) !`;
    case 'hidden_ten': return `\n\n🤫🪙 **SUPER !** <@${event.actorId}> a découvert un **BLOC CACHÉ** sur cette case et y trouve **10 PIÈCES** (+10 🪙) !`;
    case 'hidden_five': return `\n\n🤫🪙 **CHANCEUX !** <@${event.actorId}> a découvert un petit **BLOC CACHÉ** sur cette case et obtient **5 PIÈCES** (+5 🪙) !`;
    case 'coin_trap_transfer': return `\n💥 **PIÈGE !** **${event.actorName}** tombe sur un piège à pièces et perd ${event.amount} pièces ! *(Reste: ${event.playerCoins} 🪙 | <@${event.ownerId}> a maintenant ${event.ownerCoins} 🪙)*`;
    case 'coin_trap_loss': return `\n💥 **PIÈGE !** **${event.actorName}** tombe sur un piège à pièces et perd ${event.amount} pièces ! *(Reste: ${event.playerCoins} 🪙)*`;
    case 'star_trap_transfer': return `\n💥 **PIÈGE !** **${event.actorName}** tombe sur un piège à Étoile et perd 1 Étoile ! *(Reste: ${event.playerStars} ⭐ | <@${event.ownerId}> a maintenant ${event.ownerStars} ⭐)*`;
    case 'star_trap_loss': return `\n💥 **PIÈGE !** **${event.actorName}** tombe sur un piège à Étoile et perd 1 Étoile ! *(Reste: ${event.playerStars} ⭐)*`;
    case 'star_trap_empty': return `\n💥 **PIÈGE !** **${event.actorName}** tombe sur un piège à Étoile mais n'a pas d'Étoile à voler !`;
    case 'blue_coins': return `\n**${event.actorName}** gagne ${event.amount} pièces ! 💰 *(Total: ${event.playerCoins} 🪙)*`;
    case 'red_coins': return `\n**${event.actorName}** perd ${event.amount} pièces ! 💸 *(Reste: ${event.playerCoins} 🪙)*`;
    case 'chance_coins': return `\n🍀 **Chance !** **${event.actorName}** gagne +${event.amount} pièces ! *(Total: ${event.playerCoins} 🪙)*`;
    case 'chance_item': return `\n🍀 **Chance !** **${event.actorName}** obtient : ${event.item} !`;
    case 'chance_full': return `\n🍀 **Chance !** **${event.actorName}** devait obtenir un objet mais son inventaire est plein !`;
    case 'chance_steal': return `\n🍀 **Chance !** **${event.actorName}** vole ${event.amount} pièces à <@${event.targetId}> ! *(${event.actorName} a ${event.playerCoins} 🪙 | <@${event.targetId}> a ${event.targetCoins} 🪙)*`;
    case 'chance_no_target': return `\n🍀 **Chance !** **${event.actorName}** voulait voler des pièces mais personne n'en a !`;
    case 'chance_fill': return `\n🍀 **Chance !** Son inventaire a été rempli au maximum !`;
    case 'unlucky_coins': return `\n🌩️ **Malchance !** **${event.actorName}** perd ${event.amount} pièces ! *(Reste: ${event.playerCoins} 🪙)*`;
    case 'unlucky_item': return `\n🌩️ **Malchance !** **${event.actorName}** perd son objet : ${event.item} !`;
    case 'unlucky_empty': return `\n🌩️ **Malchance !** **${event.actorName}** devait perdre un objet mais son inventaire est vide !`;
    case 'unlucky_die': return `\n🌩️ **Malchance !** Son dé sera limité à 3 au prochain tour !`;
    case 'unlucky_bowser': return `\n🌩️ **Malchance !** Bowser apparaît devant **${event.actorName}** et lance sa roulette infernale !`;
    case 'bowser_half': return `\n🔥 **BOWSER !** **${event.actorName}** perd la moitié de ses pièces ! *(Reste: ${event.playerCoins} 🪙)* 🔥`;
    case 'bowser_star': return `\n🔥 **BOWSER !** **${event.actorName}** perd 1 étoile ! *(Reste: ${event.playerStars} ⭐)* 🔥`;
    case 'bowser_redistribute': return `\n🔥 **BOWSER !** Révolution communiste ! Toutes les pièces du serveur sont redistribuées équitablement (${event.share} pièces chacun) ! 🔥`;
    case 'bowser_inventory': return `\n🔥 **BOWSER !** Destruction totale de son inventaire ! 🔥`;
    case 'bowser_gift': return `\n🔥 **BOWSER !** Don forcé ! **${event.actorName}** donne la moitié de ses pièces (${event.amount}) au dernier du classement (<@${event.targetId}>) ! *(Reste: ${event.playerCoins} 🪙 | <@${event.targetId}> a ${event.targetCoins} 🪙)* 🔥`;
    case 'bowser_last': return `\n🔥 **BOWSER !** **${event.actorName}** est déjà le dernier, Bowser a pitié de lui ! 🔥`;
    case 'fate_positions': return `\n🎭 **Coup du Sort !** **${event.actorName}** échange sa position avec <@${event.targetId}> !`;
    case 'fate_no_positions': return `\n🎭 **Coup du Sort !** **${event.actorName}** devait échanger sa position mais personne d'autre n'est sur le plateau !`;
    case 'fate_lottery': return `\n🎭 **Coup du Sort !** Grande Loterie : <@${event.targetId}> gagne 20 pièces ! *(Total: ${event.targetCoins} 🪙)*`;
    case 'fate_star': return `\n🎭 **Coup du Sort !** Étoile Filante : L'Étoile se déplace sur la case ${event.position} !`;
    case 'fate_steal': return `\n🎭 **Coup du Sort !** Roulette de vol : <@${event.thiefId}> vole ${event.amount} pièces à <@${event.victimId}> ! *(<@${event.thiefId}>: ${event.thiefCoins} 🪙 | <@${event.victimId}>: ${event.victimCoins} 🪙)*`;
    case 'fate_no_steal': return `\n🎭 **Coup du Sort !** Roulette de vol annulée, pas assez de joueurs.`;
    case 'fate_duel': return `\n🎭 **Coup du Sort !** Duel de dés contre <@${event.targetId}> ! (**${event.actorName}**: ${event.playerRoll} 🎲 vs <@${event.targetId}>: ${event.targetRoll} 🎲)`;
    case 'duel_win': return `\n🏆 **${event.actorName}** gagne le duel et vole ${event.amount} pièces ! *(${event.actorName}: ${event.playerCoins} 🪙 | <@${event.targetId}>: ${event.targetCoins} 🪙)*`;
    case 'duel_loss': return `\n🏆 <@${event.targetId}> gagne le duel et vole ${event.amount} pièces ! *(<@${event.targetId}>: ${event.targetCoins} 🪙 | ${event.actorName}: ${event.playerCoins} 🪙)*`;
    case 'duel_tie': return `\n🤝 Égalité ! Rien ne se passe.`;
    case 'duel_no_target': return `\n🎭 **Coup du Sort !** Duel annulé, pas d'adversaire.`;
    case 'fate_gift': return `\n🎭 **Coup du Sort !** **${event.actorName}** doit donner ${event.amount} pièces à <@${event.targetId}> ! *(Reste: ${event.playerCoins} 🪙 | <@${event.targetId}> a ${event.targetCoins} 🪙)*`;
    case 'fate_no_gift': return `\n🎭 **Coup du Sort !** Don annulé, personne à qui donner.`;
    case 'fate_coins': return `\n🎭 **Coup du Sort !** **${event.actorName}** échange ses pièces avec <@${event.targetId}> ! *(${event.actorName} a maintenant ${event.playerCoins} 🪙 | <@${event.targetId}> a ${event.targetCoins} 🪙)*`;
    case 'fate_no_coins': return `\n🎭 **Coup du Sort !** Échange annulé, pas d'adversaire.`;
    case 'fate_stars': return `\n🎭 **Coup du Sort !** **${event.actorName}** échange ses étoiles avec <@${event.targetId}> ! *(${event.actorName} a maintenant ${event.playerStars} ⭐ | <@${event.targetId}> a ${event.targetStars} ⭐)*`;
    case 'fate_no_stars': return `\n🎭 **Coup du Sort !** Échange annulé, pas d'adversaire.`;
  }
}
export const formatLandingEvents = (events: LandingEvent[]): string => events.map(formatLandingEvent).join('');
