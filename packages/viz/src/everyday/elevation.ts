/**
 * **The building, drawn with today's hole in it** — GAMEPLAY § 6.2's elevation, shared by the brief
 * and the campaign's tower screen since GitHub issue #353 (`docs/35` PM-CA1).
 *
 * A painter and nothing else: no strings beyond a car's own id and three floor marks, so there is
 * nothing here for the honesty corpus to sweep, and every shape is derived from the building the
 * caller hands in. Which cars are held is the caller's fact — the brief reads today's event, the
 * tower screen reads the works — and this draws it.
 */

import { EVERYDAY_COLORS as C, EVERYDAY_TYPE as TYPE } from './tokens.js';

/** The part of a building this painter reads. `ResolvedBuilding` and `BuildingConfig` both satisfy it. */
export interface BankedElevation {
  readonly floors: readonly unknown[];
  readonly banks: readonly { readonly cars: readonly { readonly id: string }[] }[];
}

const ELEVATION_HEIGHT_PX = 300;
const MAX_PIXEL_RATIO = 2;

/**
 * The cutaway elevation — § 6.2's list, drawn from the building.
 *
 * Every shape is derived: one well per car in bank order, storeys at `floors.length`, and a dashed
 * well is a car the caller says is held — `carsToDerate`'s own choice for today's event on the
 * brief, and the works night's on the campaign's tower screen (GitHub issue #353), which is why
 * this lives in a module of its own rather than in `briefScreen.ts`: the day opens on the building
 * with the hole in it on both surfaces, from one painter. A building the shell could not resolve
 * draws nothing rather than a stand-in tower, on `everyday/host.ts#buildingById`'s rule that a
 * substituted answer is a false statement about the thing asked after.
 */
export function drawElevation(
  canvas: HTMLCanvasElement,
  building: BankedElevation | undefined,
  heldCarIds: readonly string[],
): void {
  const box = canvas.getBoundingClientRect();
  const view = canvas.ownerDocument.defaultView;
  const ratio = Math.min(MAX_PIXEL_RATIO, view?.devicePixelRatio ?? 1);
  const width = Math.max(1, Math.round(box.width * ratio));
  const height = Math.max(1, Math.round(ELEVATION_HEIGHT_PX * ratio));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  // No 2D context — a node tier, or a browser that refused one. The rest of the brief is unaffected.
  if (ctx === null) return;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const w = box.width;
  const h = ELEVATION_HEIGHT_PX;
  ctx.clearRect(0, 0, w, h);
  if (building === undefined || w <= 0) return;

  const storeys = Math.max(1, building.floors.length);
  const cars = building.banks.flatMap((bank) => bank.cars.map((car) => car.id));
  const held = new Set(heldCarIds);

  const pad = 16;
  const roofH = 10;
  const groundH = 18;
  const bodyTop = pad + roofH;
  const bodyBottom = h - pad - groundH;
  const bodyH = Math.max(1, bodyBottom - bodyTop);
  const bodyLeft = pad;
  const bodyRight = w - pad;
  const bodyW = Math.max(1, bodyRight - bodyLeft);
  const storeyH = bodyH / storeys;

  /* the slab */
  ctx.fillStyle = C.warmGrey;
  ctx.fillRect(bodyLeft - 4, pad, bodyW + 8, roofH);

  /* the body */
  ctx.fillStyle = C.paperDeeper;
  ctx.fillRect(bodyLeft, bodyTop, bodyW, bodyH);

  /* storeys, and windows on the half that is not shafts */
  ctx.strokeStyle = C.rule;
  ctx.lineWidth = 1;
  for (let index = 0; index <= storeys; index += 1) {
    const y = Math.round(bodyTop + index * storeyH) + 0.5;
    ctx.beginPath();
    ctx.moveTo(bodyLeft, y);
    ctx.lineTo(bodyRight, y);
    ctx.stroke();
  }

  /* the shaft wells: one per car, right-hand two thirds, dark voids */
  const wellCount = Math.max(1, cars.length);
  const wellsLeft = bodyLeft + bodyW * 0.42;
  const wellsW = bodyRight - wellsLeft - 8;
  const wellW = Math.max(4, (wellsW - 6 * (wellCount - 1)) / wellCount);
  cars.forEach((carId, index) => {
    const x = wellsLeft + index * (wellW + 6);
    const out = held.has(carId);
    ctx.fillStyle = out ? C.paperDeep : C.ink;
    ctx.fillRect(x, bodyTop + 2, wellW, bodyH - 4);
    if (out) {
      ctx.save();
      ctx.strokeStyle = C.terracotta;
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.75, bodyTop + 2.75, wellW - 1.5, bodyH - 5.5);
      ctx.restore();
    } else {
      /* a car parked in the well, one storey up from the ground */
      const carH = Math.min(storeyH * 0.8, 18);
      const carY = bodyBottom - storeyH * 1.5;
      ctx.fillStyle = C.sun;
      ctx.fillRect(x + 2, carY, Math.max(2, wellW - 4), carH);
    }
    /* the lettered badge */
    ctx.fillStyle = out ? C.terracotta : C.label;
    ctx.font = `500 9px ${TYPE.mono}`;
    ctx.textAlign = 'center';
    ctx.fillText(carId.slice(-3), x + wellW / 2, bodyTop - 3);
  });

  /* windows on the left third */
  ctx.fillStyle = C.sky;
  for (let index = 0; index < storeys; index += 1) {
    const y = bodyTop + index * storeyH + storeyH * 0.28;
    const wh = Math.max(2, storeyH * 0.4);
    for (let column = 0; column < 3; column += 1) {
      ctx.fillRect(bodyLeft + 10 + column * 22, y, 13, wh);
    }
  }

  /* the ground and the entrance canopy */
  ctx.fillStyle = C.warmGrey;
  ctx.fillRect(pad - 6, bodyBottom, bodyW + 12, 3);
  ctx.fillStyle = C.sun;
  ctx.fillRect(bodyLeft + 8, bodyBottom - 8, 58, 5);

  /* floor numbers: top, middle, ground */
  ctx.fillStyle = C.label;
  ctx.font = `500 9px ${TYPE.mono}`;
  ctx.textAlign = 'right';
  const marks: readonly [number, string][] = [
    [0, String(storeys)],
    [Math.floor(storeys / 2), String(Math.max(1, storeys - Math.floor(storeys / 2)))],
    [storeys - 1, 'G'],
  ];
  for (const [index, label] of marks) {
    ctx.fillText(label, bodyLeft - 3, bodyTop + index * storeyH + storeyH * 0.72);
  }
}

