import { mapConcurrent } from './concurrency';
import fs from 'node:fs';
import path from 'node:path';
import { Canvas, CanvasRenderingContext2D, Image, createCanvas, loadImage } from 'canvas';
import { Client, User } from 'discord.js';
import { BoardCase } from '../domain/types';
import { getActiveBoardCases, getActiveMode } from '../gamemodes/registry';
import { BoundedCache, loadRemoteImage } from './remote-image';

const BOARD_WIDTH = 1920;
const BOARD_HEIGHT = 1080;
const HALF_CASE = 45;

export interface BoardPlayer { discord_id: string; position: number; etoiles: number; pieces: number; inventaire: string[] }
export interface BoardState { game_mode: string; game_map: string; tour: number; position_etoile: number; pieges_actifs?: { position?: unknown }[] }
type UserLookup = Pick<Client, 'users'> | null;

const backgrounds = new Map<string, Image>();
const avatarCache = new BoundedCache<Image>();
const userCache = new BoundedCache<User>();
const avatarLoads = new Map<string, Promise<{ user: User | null; avatar: Image | null }>>();

async function avatarFor(client: UserLookup, id: string) {
  const running = avatarLoads.get(id);
  if (running) return running;
  const task = (async () => {
    const user = await fetchUser(client, id);
    return { user, avatar: await fetchAvatar(user, 128) };
  })();
  avatarLoads.set(id, task);
  try { return await task; }
  finally { avatarLoads.delete(id); }
}

/** Native asynchronous lossless encoding leaves the event loop available for acknowledgments. */
function encodePng(canvas: Canvas): Promise<Buffer> {
  return new Promise((resolve, reject) => canvas.toBuffer((error, buffer) => {
    if (error) reject(error); else resolve(buffer);
  }, 'image/png', { compressionLevel: 3 }));
}

/** Called after a new season changes the map. */
export function invalidateBoardCache(): void { backgrounds.clear(); }

function drawCircleImage(ctx: CanvasRenderingContext2D, img: Image, x: number, y: number, radius: number, borderColor = '#FFFFFF'): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, x - radius, y - radius, radius * 2, radius * 2);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2, true);
  ctx.lineWidth = 3;
  ctx.strokeStyle = borderColor;
  ctx.stroke();
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, spikes: number, outer: number, inner: number, fill: string, stroke: string): void {
  let rot = Math.PI / 2 * 3;
  const step = Math.PI / spikes;
  ctx.beginPath();
  ctx.moveTo(cx, cy - outer);
  for (let i = 0; i < spikes; i++) {
    ctx.lineTo(cx + Math.cos(rot) * outer, cy + Math.sin(rot) * outer);
    rot += step;
    ctx.lineTo(cx + Math.cos(rot) * inner, cy + Math.sin(rot) * inner);
    rot += step;
  }
  ctx.lineTo(cx, cy - outer);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

/** Unit vector pointing outside the track at a case, from its neighbours. */
function outward(cases: BoardCase[], c: BoardCase): { x: number; y: number } {
  const prev = cases.find(other => other.next.includes(c.id)) ?? c;
  const next = cases.find(other => other.id === c.next[0]) ?? c;
  const tx = next.x - prev.x;
  const ty = next.y - prev.y;
  const length = Math.hypot(tx, ty);
  return length > 0 ? { x: -ty / length, y: tx / length } : { x: 0, y: -1 };
}

async function fetchUser(client: UserLookup, id: string): Promise<User | null> {
  const cached = userCache.get(id);
  if (cached || !client) return cached ?? null;
  try {
    const user = await client.users.fetch(id);
    userCache.set(id, user);
    return user;
  } catch (error) {
    console.warn(`[WARN] Utilisateur Discord ${id} introuvable pour le plateau :`, error instanceof Error ? error.message : error);
    return null;
  }
}
async function fetchAvatar(user: User | null, size: 64 | 128): Promise<Image | null> {
  if (!user) return null;
  const cached = avatarCache.get(user.id);
  if (cached) return cached;
  try {
    const image = await loadRemoteImage(user.displayAvatarURL({ extension: 'png', size }));
    avatarCache.set(user.id, image);
    return image;
  } catch (error) {
    // A missing avatar falls back to initials; the board must still be rendered.
    console.warn(`[WARN] Avatar indisponible pour ${user.id} :`, error instanceof Error ? error.message : error);
    return null;
  }
}
function drawInitials(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, text: string, font: string): void {
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#FFD700';
  ctx.stroke();
  ctx.fillStyle = '#000000';
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

async function background(plateau: BoardState, zone: string | null): Promise<Image> {
  const key = `${plateau.game_mode}_${plateau.game_map}_${zone ?? 'full'}`;
  const cached = backgrounds.get(key);
  if (cached) return cached;
  const mode = getActiveMode(plateau);
  const fullImage = mode.getBoardImagePath(plateau.game_map);
  const zoneImage = zone ? path.join(path.dirname(fullImage), `${zone}.png`) : null;
  const image = await loadImage(zoneImage && fs.existsSync(zoneImage) ? zoneImage : fullImage);
  backgrounds.set(key, image);
  return image;
}

/**
 * Render the board. `players` is drawn in order, so the active player goes last (on top).
 * Island boards are split in zones: only `zone` (or the zone of the first player) is drawn.
 */
export async function generateBoardImage(players: BoardPlayer[], plateau: BoardState, client: UserLookup, zoneId: string | null = null): Promise<Buffer> {
  const cases = getActiveBoardCases(plateau);
  const caseOf = (id: number) => cases.find(c => c.id === id);
  const isIle = plateau.game_mode === 'ile_defis';
  const zone = isIle ? zoneId ?? (players[0] ? caseOf(players[0].position)?.zone : undefined) ?? 'plage' : null;
  const canvas = createCanvas(BOARD_WIDTH, BOARD_HEIGHT);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(await background(plateau, zone), 0, 0, BOARD_WIDTH, BOARD_HEIGHT);

  if (plateau.tour) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(BOARD_WIDTH - 250, 20, 230, 60);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 30px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Tour ${plateau.tour}/30`, BOARD_WIDTH - 135, 50);
  }
  const starCase = isIle ? undefined : caseOf(plateau.position_etoile);
  if (starCase) {
    const dir = outward(cases, starCase);
    drawStar(ctx, starCase.x + HALF_CASE + dir.x * 70, starCase.y + HALF_CASE + dir.y * 70, 5, 25, 12, '#FFD700', '#000000');
  }

  const visible = players.filter(p => { const cell = caseOf(p.position); return cell && (!zone || cell.zone === zone); });
  const assets = new Map(await mapConcurrent([...new Set(visible.map(p => p.discord_id))], 4, async id =>
    [id, await avatarFor(client, id)] as const));
  const byCase = new Map<number, BoardPlayer[]>();
  for (const p of players) byCase.set(p.position, [...(byCase.get(p.position) ?? []), p]);
  for (const [position, here] of byCase) {
    const c = caseOf(position);
    if (!c || (zone && c.zone !== zone)) continue;
    const dir = outward(cases, c);
    for (const [i, player] of here.entries()) {
      let px = c.x + HALF_CASE + dir.x * 65;
      let py = c.y + HALF_CASE + dir.y * 65;
      // Spread players sharing a case along the track, then around the case.
      if (here.length >= 2 && i < 2) {
        const spread = here.length === 2 ? 20 : 15;
        const sign = i === 0 ? -1 : 1;
        px += sign * dir.y * spread;
        py -= sign * dir.x * spread;
      } else if (i === 2) {
        px += dir.x * 25;
        py += dir.y * 25;
      } else if (i > 2) {
        const angle = i / here.length * Math.PI * 2;
        px += Math.cos(angle) * 25;
        py += Math.sin(angle) * 25;
      }
      const asset = assets.get(player.discord_id);
      if (!asset) throw new Error('Avatar non préparé pour un pion visible');
      const { user, avatar } = asset;
      if (avatar) drawCircleImage(ctx, avatar, px, py, 30, '#FFD700');
      else drawInitials(ctx, px, py, 30, user ? user.username.substring(0, 2).toUpperCase() : '?', '20px Arial');
    }
  }

  const leaders = [...players].sort((a, b) => isIle ? b.position - a.position : b.etoiles - a.etoiles || b.pieces - a.pieces).slice(0, 5);
  let x = 20;
  for (const [rank, p] of leaders.entries()) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(x, 20, 250, 60);
    const name = userCache.get(p.discord_id)?.username ?? 'Joueur';
    const avatar = avatarCache.get(p.discord_id);
    if (avatar) drawCircleImage(ctx, avatar, x + 30, 50, 20, '#FFFFFF');
    else drawInitials(ctx, x + 30, 50, 20, name.substring(0, 2).toUpperCase(), '14px Arial');
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${rank + 1}.`, x + 5, 50);
    ctx.fillText(name.length > 10 ? `${name.substring(0, 9)}...` : name, x + 60, 38);
    ctx.font = 'bold 15px Arial';
    ctx.fillStyle = '#FFD700';
    if (isIle) ctx.fillText(`Case: ${p.position}`, x + 60, 65);
    else {
      ctx.fillText(`★ ${p.etoiles}`, x + 60, 65);
      ctx.fillStyle = '#F1C40F';
      ctx.fillText(`P: ${p.pieces}`, x + 105, 65);
      ctx.fillStyle = '#AAB7B8';
      ctx.font = '13px Arial';
      ctx.fillText(`Obj: ${p.inventaire.length}`, x + 180, 65);
    }
    x += 265;
  }
  return encodePng(canvas);
}

const CASE_COLORS: Record<string, string> = {
  Bleue: '#3498db', Rouge: '#e74c3c', Chance: '#2ecc71', Verte: '#27ae60', Départ: '#27ae60', Malchance: '#9b59b6',
  Bowser: '#c0392b', 'Coup du Sort': '#f1c40f', Boo: '#ecf0f1', Boutique: '#e67e22',
};

/** Strip of the cases around the player, used by /jouer. */
export async function generateZoomedBoardImage(joueur: BoardPlayer, players: BoardPlayer[], plateau: BoardState, client: UserLookup): Promise<Buffer> {
  const cases = getActiveBoardCases(plateau);
  const canvas = createCanvas(800, 200);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2C2F33';
  ctx.fillRect(0, 0, 800, 200);
  const traps = (plateau.pieges_actifs ?? []).map(t => t.position);
  let drawX = 80;
  for (let id = joueur.position - 2; id <= joueur.position + 6; id++) {
    const c = cases.find(other => other.id === id);
    if (!c) continue;
    ctx.fillStyle = CASE_COLORS[c.type] ?? '#4F545C';
    ctx.beginPath();
    ctx.arc(drawX, 100, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = id === joueur.position ? '#FFD700' : '#000000';
    ctx.stroke();
    ctx.fillStyle = c.type === 'Boo' || c.type === 'Coup du Sort' ? '#000000' : '#FFFFFF';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(c.id), drawX, 80);
    ctx.font = '10px Arial';
    ctx.fillText(c.type.substring(0, 6), drawX, 100);
    if (plateau.game_mode !== 'ile_defis' && plateau.position_etoile === c.id) drawStar(ctx, drawX, 50, 5, 15, 7, '#FFD700', '#000000');
    if (traps.includes(c.id) && id > joueur.position) {
      ctx.font = '25px Arial';
      ctx.fillText('⚠️', drawX, 130);
    }
    const here = players.filter(p => p.position === c.id);
    if (here.length && id === joueur.position) {
      const { user, avatar } = await avatarFor(client, joueur.discord_id);
      if (avatar) drawCircleImage(ctx, avatar, drawX, 110, 20, '#FFD700');
      else drawInitials(ctx, drawX, 110, 20, user ? user.username.substring(0, 2).toUpperCase() : '?', '12px Arial');
    } else if (here.length) drawInitials(ctx, drawX, 110, 15, String(here.length), '14px Arial');
    drawX += 90;
  }
  return encodePng(canvas);
}
