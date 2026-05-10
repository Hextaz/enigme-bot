let activeLock = null;
let lockTimeout = null;
let lockStartTime = null;

function lockUser(userId) {
    if (activeLock && activeLock !== userId) {
        const lockAge = lockStartTime ? Date.now() - lockStartTime : 0;
        console.warn(`[LOCK] Verrou refusé pour ${userId} - déjà verrouillé par ${activeLock} (âge: ${Math.floor(lockAge/1000)}s)`);
        return false;
    }

    if (activeLock === userId) {
        // Renouveler le timeout si le même utilisateur acquiert à nouveau le verrou
        if (lockTimeout) clearTimeout(lockTimeout);
        lockTimeout = setTimeout(() => {
            console.warn(`[LOCK TIMEOUT] Verrou expiré pour l'utilisateur ${activeLock} après 50s - libération automatique`);
            activeLock = null;
            lockStartTime = null;
        }, 50000); // 50 seconds max per turn (under Discord's 60s limit)
        console.log(`[LOCK] Verrou renouvelé pour ${userId}`);
        return true;
    }

    // Nouveau verrou
    activeLock = userId;
    lockStartTime = Date.now();
    lockTimeout = setTimeout(() => {
        console.warn(`[LOCK TIMEOUT] Verrou expiré pour l'utilisateur ${activeLock} après 50s - libération automatique`);
        activeLock = null;
        lockStartTime = null;
    }, 50000); // 50 seconds max per turn (under Discord's 60s limit)
    console.log(`[LOCK] Verrou acquis pour ${userId}`);
    return true;
}

function unlockUser(userId) {
    if (activeLock === userId) {
        const lockDuration = lockStartTime ? Date.now() - lockStartTime : 0;
        console.log(`[LOCK] Verrou libéré pour ${userId} (durée: ${Math.floor(lockDuration/1000)}s)`);
        activeLock = null;
        lockStartTime = null;
        if (lockTimeout) clearTimeout(lockTimeout);
    } else if (activeLock) {
        console.warn(`[LOCK] Tentative de libération du verrou par ${userId} mais le verrou appartient à ${activeLock}`);
    }
}

// Global brute unlock (e.g. for admin commands or fallback)
function forceUnlock() {
    const previousLock = activeLock;
    console.log(`[LOCK] Libération forcée du verrou (était: ${previousLock})`);
    activeLock = null;
    lockStartTime = null;
    if (lockTimeout) clearTimeout(lockTimeout);
}

function getLockedUser() {
    return activeLock;
}

function getLockInfo() {
    if (!activeLock || !lockStartTime) return null;
    return {
        userId: activeLock,
        duration: Date.now() - lockStartTime,
        remaining: 50000 - (Date.now() - lockStartTime)
    };
}

module.exports = { lockUser, unlockUser, forceUnlock, getLockedUser, getLockInfo };
