import standard = require('./variants/standard');

export interface MarioVariant { name: string; description: string; settings: { starPrice: number; bonusStarsCount: number } }
const variants: Record<string, MarioVariant> = { standard };
export function marioVariant(id: string): MarioVariant {
  const variant = variants[id];
  if (!variant) throw new Error(`Variante Mario Party inconnue : ${id}`);
  const { starPrice, bonusStarsCount } = variant.settings;
  if (!Number.isInteger(starPrice) || starPrice < 0 || !Number.isInteger(bonusStarsCount) || bonusStarsCount < 0 || bonusStarsCount > 6) {
    throw new Error(`Configuration de variante invalide : ${id}`);
  }
  return variant;
}
