import fs from 'node:fs';
import path from 'node:path';
let root = __dirname;
while (!fs.existsSync(path.join(root, 'package.json'))) {
  const parent = path.dirname(root);
  if (parent === root) throw new Error('Racine du projet introuvable');
  root = parent;
}
export const projectRoot = root;
