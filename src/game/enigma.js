const { Joueur, Plateau } = require('../db/models');
const config = require('../config');

async function triggerEnigmaEnd(client) {
  try {
    const p = await Plateau.findByPk(1);
    if (!p || p.enigme_status !== 'active') return;

    p.enigme_status = 'finished';
    p.fin_enigme_timestamp = null;
    await p.save();

    const channelId = config.enigmaChannelId;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    let finalMsg = '⏰ **FIN DE L\'ÉNIGME !** La bonne réponse était : **' + p.enigme_reponse + '**\n\n';

    const gagnants = p.enigme_gagnants || [];
    if (gagnants.length > 0) {
      finalMsg += '🏆 **Gagnants :**\n';
      for (const g of gagnants) {
        finalMsg += `• <@${g.discord_id}> — **+${g.pieces} pièces** (${g.tranche})\n`;
      }
    } else {
      finalMsg += '😢 *Personne n\'a trouvé la réponse aujourd\'hui...*\n';
    }

    finalMsg += '\n🎲 **Le plateau est maintenant ouvert !** Vous pouvez utiliser `/jouer` jusqu\'à 17h demain.';

    if (config.roleEnigmeId) {
      finalMsg = '<@&' + config.roleEnigmeId + '>\n' + finalMsg;
    }

    await channel.send(finalMsg);

    await Joueur.update({ a_le_droit_de_jouer: true }, { where: {} });

    console.log('[ENIGME] Énigme terminée à 21h, plateau ouvert.');
  } catch (err) {
    console.error('Erreur dans triggerEnigmaEnd:', err);
  }
}

module.exports = { triggerEnigmaEnd };
