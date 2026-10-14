import { editReply } from '../discord/replies';
import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { Joueur, Plateau } from '../db/models';
import { GameRuleError } from '../domain/types';
import {
  handle15hReminder, handle17hTransition, handleSaturday10hBets, handleSaturday21hBetsResult,
  handleSaturday8hReminder, handleSunday11hBlackMarket, publishHint,
} from '../game/cron';
import { triggerEnigmaEnd } from '../game/enigma';
import { devClockOffset, gameNow, resetDevClock, setDevClock } from '../utils/clock';
import { parisDayAt } from '../utils/time';
import config = require('../config');

type Client = ChatInputCommandInteraction['client'];

/** The same handlers as the crons (src/game/cron.ts#initCronJobs), triggered on demand. */
const STEPS: Record<string, (client: Client) => Promise<unknown>> = {
  rappel_15h: client => handle15hReminder(client),
  publication_17h: client => handle17hTransition(client),
  indice_1: client => publishHint(client, 1),
  indice_2: client => publishHint(client, 2),
  indice_3: client => publishHint(client, 3),
  cloture_21h: client => triggerEnigmaEnd(client),
  rappel_samedi: client => handleSaturday8hReminder(client),
  ouverture_paris: client => handleSaturday10hBets(client),
  resultat_paris: client => handleSaturday21hBetsResult(client),
  marche_noir: client => handleSunday11hBlackMarket(client),
};
const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

export const devOnly = true;
export const data = new SlashCommandBuilder()
  .setName('dev')
  .setDescription('[Bot de dev] Outils de test : étapes planifiées, horloge virtuelle, état.')
  .setDefaultMemberPermissions(0)
  .addSubcommand(s => s.setName('etape').setDescription('Exécute maintenant une étape planifiée (même code que le cron).')
    .addStringOption(o => o.setName('etape').setDescription("L'étape à exécuter").setRequired(true)
      .addChoices(...Object.keys(STEPS).map(name => ({ name, value: name })))))
  .addSubcommand(s => s.setName('horloge').setDescription("Simule l'heure du jeu (prochain jour choisi, à l'heure de Paris).")
    .addIntegerOption(o => o.setName('jour').setDescription('Jour simulé').setRequired(true)
      .addChoices(...DAYS.map((name, value) => ({ name, value }))))
    .addIntegerOption(o => o.setName('heure').setDescription('Heure (0-23)').setRequired(true).setMinValue(0).setMaxValue(23))
    .addIntegerOption(o => o.setName('minute').setDescription('Minute (0-59)').setMinValue(0).setMaxValue(59)))
  .addSubcommand(s => s.setName('horloge_reset').setDescription("Revient à l'heure réelle."))
  .addSubcommand(s => s.setName('etat').setDescription("Résumé de l'état du plateau, de l'énigme et de ton joueur."));

function formatGameTime(): string {
  const time = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(gameNow());
  return devClockOffset() ? `${time} (simulée)` : `${time} (réelle)`;
}

async function stateSummary(userId: string): Promise<string> {
  const plateau = await Plateau.findByPk(1);
  const joueur = await Joueur.findByPk(userId);
  const lines = [`🕒 **Horloge du jeu :** ${formatGameTime()}`];
  if (!plateau) lines.push('Aucun plateau.');
  else {
    const hints = [plateau.indice1_publie, plateau.indice2_publie, plateau.indice3_publie].map(published => (published ? '✅' : '—')).join(' ');
    lines.push(`🎲 **Plateau :** ${plateau.game_mode} · tour ${plateau.tour} · étoile case ${plateau.position_etoile}`,
      `🧩 **Énigme :** ${plateau.enigme_status} · indices ${hints} · gagnants ${plateau.enigme_gagnants.length}`,
      `🏇 **Paris ouverts :** ${plateau.mode_data.paris_ouverts === true ? 'oui' : 'non'}`);
  }
  lines.push(joueur
    ? `👤 **Toi :** case ${joueur.position} · ${joueur.pieces} pièces · ${joueur.etoiles} étoiles · peut jouer : ${joueur.a_le_droit_de_jouer ? 'oui' : 'non'} · énigme trouvée : ${joueur.a_trouve_enigme ? 'oui' : 'non'} · propositions ${joueur.guess_du_jour}/3${joueur.est_fantome ? ' · 👻 fantôme' : ''}`
    : "👤 **Toi :** pas encore inscrit (utilise `/jouer`).");
  return lines.join('\n');
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!config.devMode) throw new GameRuleError('DEV_ONLY', 'Commande disponible uniquement sur le bot de dev (DEV_MODE=1).');
  const subcommand = interaction.options.getSubcommand();
  const userId = interaction.user.id;
  switch (subcommand) {
    case 'etape': {
      const name = interaction.options.getString('etape', true);
      const step = STEPS[name];
      if (!step) throw new GameRuleError('STEP', `Étape inconnue : ${name}.`);
      console.log(`[ADMIN] /dev etape ${name} par ${userId}`);
      await step(interaction.client);
      await editReply(interaction, `⚙️ Étape **${name}** exécutée.\n\n${await stateSummary(userId)}`);
      return;
    }
    case 'horloge': {
      const target = parisDayAt(interaction.options.getInteger('jour', true), interaction.options.getInteger('heure', true), interaction.options.getInteger('minute') ?? 0);
      setDevClock(target);
      console.log(`[ADMIN] /dev horloge ${target.toISOString()} par ${userId}`);
      await editReply(interaction, `🕒 Horloge virtuelle réglée.\n\n${await stateSummary(userId)}`);
      return;
    }
    case 'horloge_reset':
      resetDevClock();
      console.log(`[ADMIN] /dev horloge_reset par ${userId}`);
      await editReply(interaction, `🕒 Retour à l'heure réelle.\n\n${await stateSummary(userId)}`);
      return;
    case 'etat':
      await editReply(interaction, await stateSummary(userId));
      return;
    default:
      throw new GameRuleError('STEP', `Sous-commande inconnue : ${subcommand}.`);
  }
}
