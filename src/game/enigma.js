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

    const isIleDefis = p.game_mode === 'ile_defis';
    const gagnants = p.enigme_gagnants || [];
    if (gagnants.length > 0) {
      finalMsg += '🏆 **Gagnants :**\n';
      for (const g of gagnants) {
        if (isIleDefis) {
          let diceType = 'none';
          if (g.tranche === '17h-18h') diceType = 'gold';
          else if (g.tranche === '18h-19h') diceType = 'silver';
          else if (g.tranche === '19h-20h') diceType = 'bronze';
          else if (g.tranche === '20h-21h') diceType = 'chocolat';
          
          finalMsg += `• <@${g.discord_id}> — **Dé ${diceType === 'gold' ? 'd\'Or 🎲✨' : diceType === 'silver' ? 'd\'Argent 🥈' : diceType === 'bronze' ? 'de Bronze 🥉' : 'en Chocolat 🍫'}** (${g.tranche})\n`;
          
          // Sauvegarder le dé bonus pour le joueur
          const j = await Joueur.findByPk(g.discord_id);
          if (j) {
            let mData = j.mode_data || {};
            mData.bonus_de = diceType;
            j.mode_data = mData;
            await j.save();
          }
        } else {
          finalMsg += `• <@${g.discord_id}> — **+${g.pieces} pièces** (${g.tranche})\n`;
        }
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

    // S'assurer de vider les caches d'images de plateau lors du passage au tour suivant
    try {
      const canvasUtils = require('../utils/canvas');
      if (typeof canvasUtils.invalidateBoardCache === 'function') {
        canvasUtils.invalidateBoardCache();
      }
    } catch(e){}

    console.log('[ENIGME] Énigme terminée à 21h, plateau ouvert.');
  } catch (err) {
    console.error('Erreur dans triggerEnigmaEnd:', err);
  }
}

module.exports = { triggerEnigmaEnd };
