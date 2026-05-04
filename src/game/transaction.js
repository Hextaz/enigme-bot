let activeLock = null;
let lockTimeout = null;

function lockUser(userId) {
    if (activeLock && activeLock !== userId) {
        return false;
    }
    activeLock = userId;
    if (lockTimeout) clearTimeout(lockTimeout);
    lockTimeout = setTimeout(() => {
        console.warn(`Lock timeout for user ${activeLock} - releasing lock`);
        activeLock = null;
    }, 120000); // 120 seconds max per turn
    return true; // Successfully acquired or already owned
}

function unlockUser(userId) {
    if (activeLock === userId) {
        activeLock = null;
        if (lockTimeout) clearTimeout(lockTimeout);
    }
}

// Global brute unlock (e.g. for admin commands or fallback)
function forceUnlock() {
    activeLock = null;
    if (lockTimeout) clearTimeout(lockTimeout);
}

function getLockedUser() {
    return activeLock;
}

module.exports = { lockUser, unlockUser, forceUnlock, getLockedUser };
