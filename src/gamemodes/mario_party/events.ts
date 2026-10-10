/** Facts captured at the instant of each effect, before subsequent mutations. */
export type LandingEvent =
  | { kind: 'hidden_star'; actorId: string }
  | { kind: 'hidden_twenty'; actorId: string }
  | { kind: 'hidden_ten'; actorId: string }
  | { kind: 'hidden_five'; actorId: string }
  | { kind: 'coin_trap_transfer'; actorName: string; amount: number; playerCoins: number; ownerId: string; ownerCoins: number }
  | { kind: 'coin_trap_loss'; actorName: string; amount: number; playerCoins: number }
  | { kind: 'star_trap_transfer'; actorName: string; playerStars: number; ownerId: string; ownerStars: number }
  | { kind: 'star_trap_loss'; actorName: string; playerStars: number }
  | { kind: 'star_trap_empty'; actorName: string }
  | { kind: 'blue_coins'; actorName: string; amount: number; playerCoins: number }
  | { kind: 'red_coins'; actorName: string; amount: number; playerCoins: number }
  | { kind: 'chance_coins'; actorName: string; amount: number; playerCoins: number }
  | { kind: 'chance_item'; actorName: string; item: string }
  | { kind: 'chance_full'; actorName: string }
  | { kind: 'chance_steal'; actorName: string; amount: number; targetId: string; playerCoins: number; targetCoins: number }
  | { kind: 'chance_no_target'; actorName: string }
  | { kind: 'chance_fill' }
  | { kind: 'unlucky_coins'; actorName: string; amount: number; playerCoins: number }
  | { kind: 'unlucky_item'; actorName: string; item: string }
  | { kind: 'unlucky_empty'; actorName: string }
  | { kind: 'unlucky_die' }
  | { kind: 'unlucky_bowser'; actorName: string }
  | { kind: 'bowser_half'; actorName: string; playerCoins: number }
  | { kind: 'bowser_star'; actorName: string; playerStars: number }
  | { kind: 'bowser_redistribute'; share: number }
  | { kind: 'bowser_inventory' }
  | { kind: 'bowser_gift'; actorName: string; amount: number; targetId: string; playerCoins: number; targetCoins: number }
  | { kind: 'bowser_last'; actorName: string }
  | { kind: 'fate_positions'; actorName: string; targetId: string }
  | { kind: 'fate_no_positions'; actorName: string }
  | { kind: 'fate_lottery'; targetId: string; targetCoins: number }
  | { kind: 'fate_star'; position: number }
  | { kind: 'fate_steal'; thiefId: string; amount: number; victimId: string; thiefCoins: number; victimCoins: number }
  | { kind: 'fate_no_steal' }
  | { kind: 'fate_duel'; targetId: string; actorName: string; playerRoll: number; targetRoll: number }
  | { kind: 'duel_win'; actorName: string; amount: number; playerCoins: number; targetId: string; targetCoins: number }
  | { kind: 'duel_loss'; targetId: string; amount: number; targetCoins: number; actorName: string; playerCoins: number }
  | { kind: 'duel_tie' }
  | { kind: 'duel_no_target' }
  | { kind: 'fate_gift'; actorName: string; amount: number; targetId: string; playerCoins: number; targetCoins: number }
  | { kind: 'fate_no_gift' }
  | { kind: 'fate_coins'; actorName: string; targetId: string; playerCoins: number; targetCoins: number }
  | { kind: 'fate_no_coins' }
  | { kind: 'fate_stars'; actorName: string; targetId: string; playerStars: number; targetStars: number }
  | { kind: 'fate_no_stars' };
