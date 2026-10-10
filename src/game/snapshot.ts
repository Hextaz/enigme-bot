import { Transaction } from 'sequelize';
import { Joueur, Plateau, TourSnapshot } from '../db/models';

/** Capture the historical undo scope before the turn, inside its transaction. */
export async function saveTurnSnapshot(joueur: Joueur, plateau: Plateau, transaction: Transaction): Promise<void> {
    const others = await Joueur.findAll({ transaction });
    await TourSnapshot.create({
      discord_id: joueur.discord_id, tour: plateau.tour, temp_choix_direction: joueur.temp_choix_direction,
      position: joueur.position, pieces: joueur.pieces, etoiles: joueur.etoiles, inventaire: joueur.inventaire,
      a_le_droit_de_jouer: joueur.a_le_droit_de_jouer, a_joue_ce_tour: joueur.a_joue_ce_tour, cases_restantes: joueur.cases_restantes,
      jours_inactifs: joueur.jours_inactifs, est_fantome: joueur.est_fantome, fantome_unblock_used: joueur.fantome_unblock_used,
      bonus_prochain_lancer: joueur.bonus_prochain_lancer, de_limite: joueur.de_limite, type_de: joueur.type_de, de_pipe_valeur: joueur.de_pipe_valeur,
      plateau_position_etoile: plateau.position_etoile, plateau_pieges_actifs: plateau.pieges_actifs, plateau_blocs_caches: plateau.blocs_caches,
      autres_joueurs_snapshot: others.filter(j => j.discord_id !== joueur.discord_id)
        .map(j => ({ discord_id: j.discord_id, pieces: j.pieces, etoiles: j.etoiles, inventaire: j.inventaire, position: j.position })),
    }, { transaction });
}
