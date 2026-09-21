module.exports = {
  apps: [
    {
      name: 'enigme-bot',
      script: 'src/index.js',
      // Redémarrage automatique en cas de crash ou process.exit(1) (Auto-Healing)
      autorestart: true,
      // Temporisation progressive pour éviter le redémarrage en boucle rapide
      exp_backoff_restart_delay: 100,
      // Limite mémoire : redémarrage automatique en cas de fuite de mémoire (> 300 Mo)
      max_memory_restart: '300M',
      // Délai pour laisser le temps au bot de se déconnecter proprement (SIGINT)
      kill_timeout: 5000,
      // Délai de 2s avant redémarrage
      restart_delay: 2000,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
