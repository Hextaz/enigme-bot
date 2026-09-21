const config = require('../config');

/**
 * Vérifie l'état de santé du client Discord et de la base de données SQLite.
 *
 * @param {import('discord.js').Client} client
 * @param {object} [customSequelize]
 * @returns {Promise<{ ok: boolean, discord: { up: boolean, ping: number }, database: { up: boolean, error?: string } }>}
 */
async function checkHealth(client, customSequelize = null) {
  const sequelize = customSequelize || require('../db/models').sequelize;

  // 1. Vérification Discord WebSocket
  const isClientReady = Boolean(client && typeof client.isReady === 'function' ? client.isReady() : false);
  const wsStatus = client?.ws?.status;
  const discordUp = isClientReady && wsStatus === 0;
  const ping = typeof client?.ws?.ping === 'number' && client.ws.ping >= 0 ? client.ws.ping : 0;

  // 2. Vérification SQLite avec timeout de sécurité (5s) pour éviter les deadlocks
  let dbUp = false;
  let dbError = null;

  try {
    if (!sequelize || typeof sequelize.authenticate !== 'function') {
      throw new Error('Instance Sequelize non initialisée');
    }

    await Promise.race([
      sequelize.authenticate(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout de la vérification SQLite (5s)')), 5000)
      )
    ]);
    dbUp = true;
  } catch (err) {
    dbUp = false;
    dbError = err?.message || String(err);
  }

  const ok = discordUp && dbUp;

  return {
    ok,
    discord: {
      up: discordUp,
      ping
    },
    database: {
      up: dbUp,
      ...(dbError ? { error: dbError } : {})
    }
  };
}

/**
 * Envoie une pulsation (Heartbeat) à l'URL de Push Uptime Kuma.
 *
 * @param {string} pushBaseUrl
 * @param {object} health
 * @param {object} [options]
 * @returns {Promise<boolean>}
 */
async function sendHeartbeatPing(pushBaseUrl, health, options = {}) {
  const fetchFn = options.fetchFn || globalThis.fetch;
  if (!fetchFn || !pushBaseUrl) {
    return false;
  }

  try {
    const url = new URL(pushBaseUrl);
    if (health.ok) {
      url.searchParams.set('status', 'up');
      url.searchParams.set('msg', 'OK');
      url.searchParams.set('ping', String(health.discord?.ping || 0));
    } else {
      const reasons = [];
      if (!health.discord?.up) reasons.push('Discord_down');
      if (!health.database?.up) reasons.push('SQLite_down');
      url.searchParams.set('status', 'down');
      url.searchParams.set('msg', reasons.join('+') || 'Degraded');
    }

    const response = await fetchFn(url.toString(), { method: 'GET' });
    return Boolean(response && (response.ok || response.status === 200));
  } catch (err) {
    console.warn(`[HEALTH] Impossible d'envoyer le heartbeat à Uptime Kuma: ${err.message}`);
    return false;
  }
}

let currentHeartbeatTimer = null;

/**
 * Démarre la boucle de surveillance Uptime Kuma en mode Push Heartbeat avec auto-healing.
 *
 * @param {import('discord.js').Client} client
 * @param {object} [options]
 * @returns {object|null}
 */
function startKumaHeartbeat(client, options = {}) {
  const pushUrl = options.pushUrl !== undefined ? options.pushUrl : config.kumaPushUrl;
  const intervalMs = options.intervalMs || (config.kumaPushIntervalSec * 1000);
  const maxFailures = options.maxFailures !== undefined ? options.maxFailures : config.kumaMaxFailures;
  const onExit = options.onExit || (() => process.exit(1));
  const sequelizeInstance = options.sequelizeInstance || null;
  const fetchFn = options.fetchFn || globalThis.fetch;

  if (!pushUrl) {
    console.log('[HEALTH] Aucune variable KUMA_PUSH_URL configurée. Surveillance Push Uptime Kuma inactive.');
    return null;
  }

  console.log(`[HEALTH] Surveillance Push Uptime Kuma activée (intervalle: ${Math.round(intervalMs / 1000)}s, seuil auto-healing: ${maxFailures} échecs).`);

  let consecutiveFailures = 0;
  let isChecking = false;

  const performCheck = async () => {
    if (isChecking) return;
    isChecking = true;

    try {
      const health = await checkHealth(client, sequelizeInstance);

      if (health.ok) {
        if (consecutiveFailures > 0) {
          console.log('[HEALTH] Rétablissement de la santé globale (Discord WebSocket & SQLite).');
        }
        consecutiveFailures = 0;
        await sendHeartbeatPing(pushUrl, health, { fetchFn });
      } else {
        consecutiveFailures++;
        console.warn(`[HEALTH] Vérification échouée (${consecutiveFailures}/${maxFailures}) - Discord: ${health.discord.up ? 'UP' : 'DOWN'}, SQLite: ${health.database.up ? 'UP' : 'DOWN'}`);
        await sendHeartbeatPing(pushUrl, health, { fetchFn });

        if (consecutiveFailures >= maxFailures) {
          console.error(`[AUTO-HEALING] Seuil critique de ${consecutiveFailures} échecs consécutifs atteint. Arrêt pour redémarrage propre par PM2...`);
          stopKumaHeartbeat(timer);
          onExit(1);
        }
      }
    } catch (err) {
      console.error(`[HEALTH] Erreur inattendue dans le check de santé:`, err);
    } finally {
      isChecking = false;
    }
  };

  const timer = setInterval(performCheck, intervalMs);
  currentHeartbeatTimer = timer;

  return {
    timer,
    stop: () => stopKumaHeartbeat(timer)
  };
}

/**
 * Arrête la boucle de pulsation active.
 *
 * @param {object|NodeJS.Timeout} [handle]
 */
function stopKumaHeartbeat(handle = null) {
  const target = handle?.timer || handle || currentHeartbeatTimer;
  if (target) {
    clearInterval(target);
    if (target === currentHeartbeatTimer) {
      currentHeartbeatTimer = null;
    }
    console.log('[HEALTH] Surveillance Push Uptime Kuma arrêtée.');
  }
}

module.exports = {
  checkHealth,
  sendHeartbeatPing,
  startKumaHeartbeat,
  stopKumaHeartbeat
};
