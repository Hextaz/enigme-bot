FROM node:20-bullseye-slim

# Installer les dépendances système requises par node-canvas
RUN apt-get update && apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dépendances Node.js
RUN npm install

# Copier le reste du code
COPY . .

# Créer le dossier pour la base de données
RUN mkdir -p /app/data

# Configurer la mémoire limite de Node (très important pour les VM de 256MB comme Fly.io)
ENV NODE_OPTIONS="--max-old-space-size=120"

# Démarrer directement node pour ne pas gaspiller la mémoire avec l'interpréteur npm
CMD ["node", "src/index.js"]
