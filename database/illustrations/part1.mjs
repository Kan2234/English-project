// Draws the Part 1 "photographs" as grayscale vector illustrations (like the black-and-white
// photos printed in a TOEIC test book). One SVG per Part 1 set, matched to image_description.
//
//   node database/illustrations/part1.mjs      -> database/images/<set-id>.svg
//   node database/build.mjs                    -> links them as image_url
//
// Style: flat shapes with a dark outline; people are built from rounded "capsule" limbs.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'images');

// ---------------------------------------------------------------- palette (grays)
const C = {
  ink: '#2a2a2a', // outlines
  k: '#353535',
  d: '#555555',
  m: '#7a7a7a',
  l: '#a0a0a0',
  p: '#c4c4c4',
  s: '#dcdcdc',
  w: '#ececec',
  x: '#f8f8f8',
  skin: '#d6d6d6',
  hair: '#3a3a3a',
};
const OW = 3; // outline width

// ---------------------------------------------------------------- primitives
const pts = (a) => a.map(([x, y]) => `${x},${y}`).join(' ');
const st = (fill, outline = true) => `fill="${fill}"${outline ? ` stroke="${C.ink}" stroke-width="${OW}" stroke-linejoin="round"` : ''}`;
const rect = (x, y, w, h, fill, { rx = 0, outline = true } = {}) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ${st(fill, outline)}/>`;
const circle = (cx, cy, r, fill, outline = true) => `<circle cx="${cx}" cy="${cy}" r="${r}" ${st(fill, outline)}/>`;
const ellipse = (cx, cy, rx, ry, fill, outline = true) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" ${st(fill, outline)}/>`;
const poly = (a, fill, outline = true) => `<polygon points="${pts(a)}" ${st(fill, outline)}/>`;
const path = (d, fill, outline = true) => `<path d="${d}" ${st(fill, outline)}/>`;
const line = (a, w, color = C.ink, extra = '') =>
  `<polyline points="${pts(a)}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
/** outlined capsule stroke (limb, pole, rope…) */
const cap = (a, w, fill) => line(a, w + OW * 2, C.ink) + line(a, w, fill);

// ---------------------------------------------------------------- people
/**
 * A person from capsule parts. Coordinates are absolute.
 * arms/legs: [back, front] point lists. torso: [neck, hip].
 */
function person({ head, r = 21, torso, torsoW = 50, legs = [], arms = [], top = C.m, pants = C.k, sleeves, hair = 'short', hat, tie, shoes = C.k, longHairColor = C.hair }) {
  const sl = sleeves ?? top;
  const out = [];
  const [hx, hy] = head;
  if (hair === 'long') out.push(rect(hx - r - 2, hy - 6, (r + 2) * 2, r * 2 + 18, longHairColor, { rx: 14 }));
  if (arms[0]) out.push(cap(arms[0], 14, sl), circle(...arms[0].at(-1), 7.5, C.skin));
  for (const leg of legs) {
    out.push(cap(leg, 20, pants));
    const [fx, fy] = leg.at(-1);
    const dir = leg.at(-1)[0] >= leg.at(-2)[0] ? 1 : -1;
    out.push(ellipse(fx + dir * 7, fy + 4, 16, 8, shoes));
  }
  out.push(cap(torso, torsoW, top));
  if (tie) {
    const [nx, ny] = torso[0];
    out.push(poly([[nx - 9, ny - 6], [nx + 9, ny - 6], [nx, ny + 12]], C.x), poly([[nx - 4, ny + 2], [nx + 4, ny + 2], [nx + 5, ny + 42], [nx, ny + 50], [nx - 5, ny + 42]], C.d));
  }
  if (arms[1]) out.push(cap(arms[1], 14, sl), circle(...arms[1].at(-1), 7.5, C.skin));
  // neck + head; the hair "cap" is a dark circle peeking above the face
  out.push(cap([[hx, hy + r - 4], [hx, hy + r + 8]], 12, C.skin));
  if (hair !== 'none' && hair !== 'bald') out.push(circle(hx, hy - 4, r + 2, C.hair));
  out.push(circle(hx, hy + 2, r, C.skin));
  if (hair === 'long' || hair === 'short') out.push(path(`M${hx - r - 1},${hy - 2} Q${hx},${hy - r - 14} ${hx + r + 1},${hy - 2} Q${hx},${hy - r + 2} ${hx - r - 1},${hy - 2}Z`, C.hair, false));
  if (hat === 'hard') out.push(path(`M${hx - r - 3},${hy - 4} Q${hx},${hy - r - 26} ${hx + r + 3},${hy - 4}Z`, C.x), rect(hx - r - 9, hy - 7, (r + 9) * 2, 7, C.x, { rx: 3 }));
  return out.join('');
}

// ---------------------------------------------------------------- objects
function tree(x, y, size, fill = C.l) {
  return cap([[x, y], [x, y - size * 1.1]], size * 0.18, C.d) + circle(x, y - size * 1.25, size * 0.62, fill) + circle(x - size * 0.4, y - size * 1.0, size * 0.42, fill) + circle(x + size * 0.42, y - size * 0.98, size * 0.45, fill);
}
function bicycle(x, y, r = 52) {
  // x,y = rear wheel centre
  const fx = x + r * 2.3;
  const seat = [x + r * 0.75, y - r * 1.15];
  const crank = [x + r * 1.0, y];
  const head = [fx - r * 0.35, y - r * 1.15];
  return [
    `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${C.ink}" stroke-width="7"/>`,
    `<circle cx="${fx}" cy="${y}" r="${r}" fill="none" stroke="${C.ink}" stroke-width="7"/>`,
    `<circle cx="${x}" cy="${y}" r="${r - 9}" fill="none" stroke="${C.l}" stroke-width="1.5"/>`,
    `<circle cx="${fx}" cy="${y}" r="${r - 9}" fill="none" stroke="${C.l}" stroke-width="1.5"/>`,
    line([[x, y], seat, crank, [x, y]], 6, C.d),
    line([seat, head, crank], 6, C.d),
    line([head, [fx, y]], 6, C.d),
    line([[head[0] - 4, head[1] - 4], [head[0] + 6, head[1] - 26], [head[0] + 30, head[1] - 30]], 5, C.ink),
    line([[seat[0], seat[1]], [seat[0] - 6, seat[1] - 14]], 5, C.ink),
    rect(seat[0] - 24, seat[1] - 22, 34, 9, C.k, { rx: 4 }),
    circle(...crank, 8, C.m),
  ].join('');
}
function laptopOpen(x, y, w = 90, angle = 'back') {
  // seen from behind/side on a table: base + raised screen (back of lid visible)
  const h = w * 0.62;
  return poly([[x, y], [x + w, y], [x + w + 8, y + 8], [x - 8, y + 8]], C.l) + poly([[x + 4, y], [x + w - 4, y], [x + w - 10, y - h], [x + 10, y - h]], angle === 'back' ? C.d : C.x);
}
function chairSide(x, y, s = 1, fill = C.m) {
  // simple stacking chair, side view, x,y = front-bottom of front leg
  return [
    cap([[x, y], [x + 6 * s, y - 70 * s]], 5, C.d),
    cap([[x + 58 * s, y], [x + 52 * s, y - 70 * s]], 5, C.d),
    rect(x - 4 * s, y - 80 * s, 66 * s, 12 * s, fill, { rx: 4 }),
    cap([[x + 56 * s, y - 76 * s], [x + 64 * s, y - 150 * s]], 5, C.d),
    rect(x + 50 * s, y - 158 * s, 22 * s, 56 * s, fill, { rx: 6 }),
  ].join('');
}
function boat(x, y, len, fill = C.x, cabin = true) {
  const h = len * 0.2;
  return [
    path(`M${x},${y - h} L${x + len},${y - h} Q${x + len * 0.95},${y + h * 0.35} ${x + len * 0.78},${y + h * 0.45} L${x + len * 0.12},${y + h * 0.45} Q${x - len * 0.02},${y + h * 0.1} ${x},${y - h}Z`, fill),
    line([[x + 6, y - h * 0.25], [x + len - 10, y - h * 0.25]], 3, C.l),
    cabin ? rect(x + len * 0.35, y - h - len * 0.16, len * 0.3, len * 0.16, C.s, { rx: 4 }) + rect(x + len * 0.4, y - h - len * 0.12, len * 0.08, len * 0.07, C.d, { outline: false }) + rect(x + len * 0.52, y - h - len * 0.12, len * 0.08, len * 0.07, C.d, { outline: false }) : '',
  ].join('');
}
function can(x, y, w, h, fill = C.p, label = C.d) {
  return rect(x, y - h, w, h, fill, { rx: 3 }) + rect(x, y - h * 0.65, w, h * 0.35, label, { outline: false }) + ellipse(x + w / 2, y - h, w / 2, 4, C.s);
}

// ---------------------------------------------------------------- scenes (800 x 600)
const scenes = {
  // A man is sitting on a park bench reading a newspaper; trees and a walking path are behind him.
  'ft01-p1-s01': () => [
    rect(0, 0, 800, 600, C.x, { outline: false }),
    rect(0, 330, 800, 270, C.s, { outline: false }),
    path('M0,400 C200,360 320,350 800,330 L800,372 C340,392 220,404 0,452 Z', C.w),
    tree(90, 360, 120, C.l), tree(250, 335, 90, C.p), tree(560, 330, 100, C.p), tree(720, 360, 130, C.l),
    // bench
    cap([[245, 440], [245, 520]], 8, C.k), cap([[555, 440], [555, 520]], 8, C.k),
    rect(220, 420, 360, 22, C.m, { rx: 4 }),
    rect(220, 340, 360, 18, C.m, { rx: 4 }), rect(220, 368, 360, 18, C.m, { rx: 4 }),
    cap([[240, 335], [240, 425]], 8, C.k), cap([[560, 335], [560, 425]], 8, C.k),
    // man seated, facing us, behind an open newspaper
    person({ head: [400, 262], torso: [[400, 312], [400, 405]], top: C.d, pants: C.k, legs: [[[386, 425], [380, 470], [378, 525]], [[414, 425], [420, 470], [422, 525]]], arms: [[[378, 320], [352, 360], [342, 362]], null] }),
    path('M330,300 L400,312 L470,300 L476,408 L400,418 L324,408 Z', C.x),
    line([[400, 312], [400, 418]], 2, C.l),
    ...[330, 345, 360, 375, 390].map((y) => line([[340, y], [390, y + 4]], 3, C.p) + line([[410, y + 4], [462, y]], 3, C.p)),
    rect(346, 318, 40, 10, C.d, { outline: false }),
    circle(328, 352, 8, C.skin), circle(472, 352, 8, C.skin),
  ],

  // A woman is pushing a shopping cart down a supermarket aisle lined with shelves of canned goods.
  'ft01-p1-s02': () => {
    const shelves = [];
    // left & right shelving in perspective
    shelves.push(poly([[0, 40], [260, 150], [260, 470], [0, 600]], C.w), poly([[800, 40], [540, 150], [540, 470], [800, 600]], C.w));
    const rows = [0.12, 0.33, 0.54, 0.75];
    for (const f of rows) {
      const yL = 40 + f * 560, yR = 150 + f * 320;
      shelves.push(line([[0, yL], [260, yR]], 5, C.d), line([[800, yL], [540, yR]], 5, C.d));
      // cans: small rects along each shelf (scaled with depth)
      for (let k = 0; k < 9; k++) {
        const u = k / 9 + 0.03;
        const x = u * 250, y = yL + (yR - yL) * u;
        const sc = 1 - u * 0.55;
        shelves.push(rect(x, y - 34 * sc, 20 * sc, 32 * sc, k % 2 ? C.p : C.l, { rx: 2 }));
        const xr = 800 - u * 250, yr = yL + (yR - yL) * u;
        shelves.push(rect(xr - 20 * sc, yr - 34 * sc, 20 * sc, 32 * sc, k % 2 ? C.l : C.p, { rx: 2 }));
      }
    }
    return [
      rect(0, 0, 800, 600, C.s, { outline: false }),
      poly([[260, 470], [540, 470], [800, 600], [0, 600]], C.w),
      rect(260, 150, 280, 320, C.p, { outline: false }),
      ...shelves,
      // cart (side view, pointing left)
      line([[255, 360], [395, 360], [380, 450], [275, 450], [255, 360]], 5, C.ink),
      ...[285, 315, 345, 375].map((x) => line([[x, 362], [x - 3, 448]], 2.5, C.m)),
      ...[385, 410, 432].map((y) => line([[262 + (y - 360) * 0.2, y], [392 - (y - 360) * 0.15, y]], 2.5, C.m)),
      line([[395, 360], [420, 340]], 5, C.ink),
      line([[280, 450], [285, 490], [380, 490]], 5, C.ink),
      circle(290, 505, 12, C.k), circle(372, 505, 12, C.k),
      // woman walking left, both hands on the handle
      person({ head: [470, 228], torso: [[470, 275], [474, 368]], top: C.l, pants: C.d, hair: 'long', legs: [[[466, 385], [452, 450], [440, 515]], [[480, 385], [494, 450], [506, 515]]], arms: [[[462, 290], [440, 320], [422, 340]], [[478, 292], [450, 325], [424, 342]]] }),
    ];
  },

  // An empty meeting room: several open laptops sit on a long table, and the window blinds are closed.
  'ft01-p1-s03': () => [
    rect(0, 0, 800, 600, C.w, { outline: false }),
    rect(0, 400, 800, 200, C.p, { outline: false }),
    // window with closed blinds
    rect(170, 60, 460, 250, C.s),
    ...Array.from({ length: 14 }, (_, i) => line([[176, 72 + i * 17.5], [624, 72 + i * 17.5]], 4, C.l)),
    line([[400, 60], [400, 310]], 4, C.ink),
    line([[610, 64], [610, 290]], 2, C.d),
    // long table in perspective
    poly([[150, 400], [650, 400], [760, 520], [40, 520]], C.m),
    rect(40, 520, 720, 18, C.d, { rx: 2 }),
    cap([[70, 538], [70, 590]], 8, C.k), cap([[730, 538], [730, 590]], 8, C.k),
    // chairs behind the table (backs)
    ...[190, 330, 470, 610].map((x) => rect(x - 10, 330, 70, 72, C.d, { rx: 12 })),
    // open laptops (backs of the lids face us on the far side, screens face us on the near side)
    laptopOpen(185, 418, 85, 'back'), laptopOpen(345, 418, 85, 'back'), laptopOpen(505, 418, 85, 'back'),
    poly([[120, 492], [235, 492], [245, 506], [110, 506]], C.l), poly([[128, 492], [227, 492], [218, 432], [137, 432]], C.x), rect(142, 440, 72, 44, C.p, { outline: false }),
    poly([[560, 492], [675, 492], [685, 506], [550, 506]], C.l), poly([[568, 492], [667, 492], [658, 432], [577, 432]], C.x), rect(582, 440, 72, 44, C.p, { outline: false }),
  ],

  // Two businesspeople are shaking hands in a hotel lobby; one is holding a briefcase.
  'ft01-p1-s04': () => [
    rect(0, 0, 800, 600, C.w, { outline: false }),
    rect(0, 470, 800, 130, C.p, { outline: false }),
    ...[0, 100, 200, 300, 400, 500, 600, 700].map((x) => line([[x, 470], [x - 60, 600]], 2, C.l)),
    // reception desk + sign + columns + plant
    rect(560, 300, 240, 170, C.m), rect(560, 290, 240, 14, C.d),
    rect(600, 120, 160, 40, C.s), line([[620, 140], [740, 140]], 4, C.l),
    rect(40, 40, 46, 430, C.s), rect(30, 30, 66, 18, C.p), rect(30, 462, 66, 14, C.p),
    poly([[130, 470], [176, 470], [168, 410], [138, 410]], C.d),
    ...[[-30, -60], [0, -80], [28, -58], [-14, -40], [16, -36]].map(([dx, dy]) => ellipse(153 + dx, 400 + dy, 16, 34, C.l)),
    // left person (facing right)
    person({ head: [310, 182], torso: [[310, 232], [312, 330]], top: C.k, pants: C.k, tie: true, legs: [[[300, 350], [298, 420], [296, 478]], [[322, 350], [326, 420], [330, 478]]], arms: [[[294, 246], [292, 300], [294, 350]], [[326, 248], [358, 296], [392, 318]]] }),
    // right person (facing left) with briefcase
    person({ head: [492, 178], torso: [[492, 228], [490, 330]], top: C.d, pants: C.k, tie: true, legs: [[[478, 350], [474, 420], [470, 478]], [[500, 350], [504, 420], [508, 478]]], arms: [[[508, 244], [514, 300], [516, 352]], [[476, 246], [440, 294], [408, 318]]] }),
    rect(494, 352, 56, 42, C.k, { rx: 4 }), path('M510,352 Q522,334 534,352', 'none'),
    // clasped hands
    ellipse(400, 318, 16, 10, C.skin),
  ],

  // A worker standing on a ladder is painting a wall with a roller; paint cans are on the floor.
  'ft01-p1-s05': () => [
    rect(0, 0, 800, 600, C.x, { outline: false }),
    rect(470, 60, 330, 420, C.p, { outline: false }), // freshly painted part of the wall
    line([[470, 60], [470, 480]], 3, C.l),
    rect(0, 480, 800, 120, C.s, { outline: false }),
    line([[0, 480], [800, 480]], 4, C.l),
    // ladder (A-frame)
    line([[250, 560], [330, 230]], 12, C.ink), line([[250, 560], [330, 230]], 6, C.l),
    line([[410, 560], [340, 230]], 12, C.ink), line([[410, 560], [340, 230]], 6, C.l),
    ...[290, 350, 410, 470, 530].map((y) => {
      const t = (560 - y) / 330;
      return line([[250 + 80 * t, y], [410 - 70 * t, y]], 7, C.d);
    }),
    // worker on the ladder, reaching up to the wall with a roller pole
    person({ head: [352, 128], torso: [[352, 176], [350, 268]], top: C.m, pants: C.d, hat: 'hard', hair: 'short', legs: [[[340, 288], [328, 330], [322, 350]], [[360, 288], [372, 320], [376, 350]]], arms: [[[340, 190], [356, 150], [372, 120]], [[366, 190], [394, 150], [420, 122]]] }),
    cap([[372, 120], [500, 70]], 5, C.d), cap([[420, 122], [500, 70]], 5, C.d),
    rect(490, 40, 26, 74, C.s, { rx: 8 }),
    // paint cans and tray on the floor
    can(560, 540, 56, 66, C.x, C.d), can(630, 548, 70, 52, C.l, C.k),
    poly([[440, 545], [530, 545], [520, 560], [450, 560]], C.m),
    path('M566,474 q4,14 0,22', 'none'),
  ],

  // A row of bicycles is parked along a metal fence on a quiet street.
  'ft01-p1-s06': () => [
    rect(0, 0, 800, 600, C.x, { outline: false }),
    rect(40, 40, 220, 260, C.s), rect(300, 80, 200, 220, C.p), rect(540, 30, 240, 270, C.s),
    ...[60, 120, 180].flatMap((x) => [60, 130, 200].map((y) => rect(x, y + 10, 40, 46, C.l))),
    ...[330, 410].flatMap((x) => [100, 180].map((y) => rect(x, y, 50, 50, C.w))),
    ...[570, 650, 720].flatMap((x) => [60, 140, 210].map((y) => rect(x, y, 40, 50, C.l))),
    rect(0, 300, 800, 240, C.w, { outline: false }),
    rect(0, 540, 800, 60, C.p, { outline: false }),
    line([[0, 540], [800, 540]], 4, C.l),
    // metal fence
    line([[0, 340], [800, 340]], 7, C.d), line([[0, 470], [800, 470]], 7, C.d),
    ...Array.from({ length: 27 }, (_, i) => line([[15 + i * 30, 325], [15 + i * 30, 495]], 4, C.m)),
    // bicycles lined up
    bicycle(70, 470, 50), bicycle(260, 476, 50), bicycle(450, 470, 50), bicycle(640, 476, 50),
  ],

  // A woman in an office is typing on a laptop at a desk; a cup of coffee and a stack of folders are beside her.
  'mt01-p1-s01': () => [
    rect(0, 0, 800, 600, C.w, { outline: false }),
    // window + shelf in the background
    rect(70, 60, 240, 190, C.x), line([[190, 60], [190, 250]], 4, C.l), line([[70, 155], [310, 155]], 4, C.l),
    rect(520, 120, 230, 12, C.d),
    ...[530, 556, 580, 610, 640].map((x, i) => rect(x, 120 - (52 + (i % 3) * 8), 22, 52 + (i % 3) * 8, i % 2 ? C.l : C.m)),
    // desk
    rect(40, 380, 600, 22, C.m), cap([[80, 402], [80, 590]], 10, C.d), cap([[600, 402], [600, 590]], 10, C.d),
    // folders stack, coffee cup
    ...[0, 1, 2, 3, 4].map((i) => rect(70 + (i % 2) * 6, 362 - i * 14, 130, 13, i % 2 ? C.p : C.l, { rx: 2 })),
    rect(232, 334, 38, 46, C.x, { rx: 5 }), path('M270,344 q18,4 0,24', 'none'), path('M242,326 q4,-10 0,-18 M256,326 q4,-10 0,-18', 'none'),
    // laptop, side view, screen facing the woman (right)
    poly([[320, 380], [450, 380], [452, 372], [322, 372]], C.l),
    poly([[322, 372], [334, 372], [306, 262], [294, 264]], C.d),
    // chair
    rect(560, 400, 120, 18, C.k, { rx: 6 }), cap([[650, 400], [672, 250]], 10, C.k), cap([[620, 418], [620, 520]], 8, C.k), line([[570, 540], [670, 540]], 8, C.ink),
    // woman seated, facing left, typing
    person({ head: [580, 205], torso: [[586, 255], [604, 380]], top: C.l, pants: C.d, hair: 'long', legs: [[[600, 392], [520, 400], [516, 470], [512, 532]], [[612, 398], [535, 410], [532, 472], [528, 534]]], arms: [[[578, 274], [520, 330], [452, 368]], [[594, 276], [530, 336], [436, 366]]] }),
  ],

  // Several chairs are stacked against the wall of an empty conference room; a projector screen is pulled down.
  'mt01-p1-s02': () => [
    rect(0, 0, 800, 600, C.w, { outline: false }),
    rect(0, 440, 800, 160, C.p, { outline: false }),
    line([[0, 440], [800, 440]], 4, C.l),
    // projector screen
    rect(230, 40, 340, 22, C.d, { rx: 6 }),
    rect(246, 62, 308, 230, C.x),
    rect(246, 286, 308, 10, C.d),
    line([[400, 296], [400, 312]], 3, C.ink), circle(400, 318, 6, C.d),
    // two stacks of chairs against the wall
    ...[0, 1, 2, 3, 4].map((i) => chairSide(70, 470 - i * 22, 1, i % 2 ? C.m : C.l)),
    ...[0, 1, 2, 3].map((i) => chairSide(600, 470 - i * 22, 1, i % 2 ? C.l : C.m)),
    // power outlet on the wall
    rect(380, 400, 30, 22, C.x, { rx: 3 }),
  ],

  // Two men in hard hats are looking at a blueprint spread out on the hood of a truck at a construction site.
  'mt01-p1-s03': () => [
    rect(0, 0, 800, 600, C.x, { outline: false }),
    // building frame + crane in the background
    ...[480, 560, 640, 720].map((x) => line([[x, 300], [x, 90]], 8, C.l)),
    ...[110, 180, 250].map((y) => line([[480, y], [720, y]], 8, C.l)),
    line([[90, 300], [90, 40]], 10, C.l), line([[60, 50], [360, 50]], 8, C.l), line([[90, 40], [340, 50]], 3, C.l), line([[300, 50], [300, 130]], 2, C.m), rect(288, 130, 24, 18, C.l),
    rect(0, 300, 800, 300, C.s, { outline: false }),
    // pickup truck (side), hood on the right
    path('M60,430 L60,340 L200,340 L240,268 L360,268 L390,340 L520,350 Q540,352 540,372 L540,430 Z', C.m),
    poly([[250, 280], [352, 280], [374, 336], [222, 336]], C.p),
    rect(54, 420, 492, 20, C.d, { rx: 6 }),
    circle(150, 448, 40, C.k), circle(150, 448, 16, C.l), circle(450, 448, 40, C.k), circle(450, 448, 16, C.l),
    // blueprint on the hood
    poly([[400, 336], [540, 342], [552, 360], [392, 356]], C.x),
    ...[0.25, 0.5, 0.75].map((t) => line([[396 + 152 * t, 338], [394 + 156 * t, 356]], 1.5, C.m)),
    line([[396, 346], [546, 351]], 1.5, C.m),
    // two men looking down at it
    person({ head: [600, 196], torso: [[596, 244], [588, 344]], top: C.l, pants: C.d, hat: 'hard', legs: [[[582, 362], [580, 430], [578, 500]], [[598, 362], [606, 430], [612, 500]]], arms: [[[584, 262], [560, 310], [540, 346]], [[606, 264], [572, 312], [552, 350]]] }),
    person({ head: [690, 210], torso: [[690, 258], [690, 356]], top: C.m, pants: C.k, hat: 'hard', legs: [[[680, 374], [678, 440], [676, 504]], [[700, 374], [704, 440], [708, 504]]], arms: [[[676, 274], [690, 330], [700, 370]], [[702, 274], [672, 320], [620, 340]]] }),
  ],

  // Fruit is displayed in baskets at an outdoor market stall; no people are visible.
  'mt01-p1-s04': () => {
    const basket = (x, y, w, fill, n = 9) => {
      const out = [poly([[x, y], [x + w, y], [x + w - 14, y + 64], [x + 14, y + 64]], C.l)];
      for (let i = 1; i < 4; i++) out.push(line([[x + 4 + i * 3.5, y + i * 16], [x + w - 4 - i * 3.5, y + i * 16]], 2, C.m));
      const r = w / 7.2;
      for (let i = 0; i < n; i++) {
        const row = i < 4 ? 0 : i < 7 ? 1 : 2;
        const inRow = row === 0 ? i : row === 1 ? i - 4 : i - 7;
        const count = row === 0 ? 4 : row === 1 ? 3 : 2;
        const cx = x + w / 2 + (inRow - (count - 1) / 2) * r * 1.7;
        out.push(circle(cx, y - 4 - row * r * 1.25, r, fill));
      }
      return out.join('');
    };
    return [
      rect(0, 0, 800, 600, C.x, { outline: false }),
      rect(0, 470, 800, 130, C.s, { outline: false }),
      // awning
      ...Array.from({ length: 8 }, (_, i) => poly([[60 + i * 85, 60], [145 + i * 85, 60], [145 + i * 85, 130], [60 + i * 85, 130]], i % 2 ? C.x : C.m)),
      ...Array.from({ length: 8 }, (_, i) => path(`M${60 + i * 85},130 Q${102 + i * 85},160 ${145 + i * 85},130Z`, i % 2 ? C.x : C.m)),
      cap([[70, 130], [70, 470]], 8, C.d), cap([[730, 130], [730, 470]], 8, C.d),
      // table
      rect(40, 370, 720, 20, C.d), rect(60, 390, 680, 80, C.m),
      // baskets of fruit (back row on a riser, front row on the table)
      rect(120, 270, 560, 16, C.l),
      basket(140, 240 - 12, 120, C.p), basket(340, 240 - 12, 120, C.l), basket(540, 240 - 12, 120, C.w),
      basket(70, 316, 140, C.w, 9), basket(250, 316, 140, C.d, 9), basket(430, 316, 140, C.p, 9), basket(610, 316, 120, C.l, 9),
      // price cards
      rect(120, 384, 44, 26, C.x, { rx: 3 }), rect(300, 384, 44, 26, C.x, { rx: 3 }), rect(480, 384, 44, 26, C.x, { rx: 3 }), rect(650, 384, 44, 26, C.x, { rx: 3 }),
    ];
  },

  // A man is watering plants on a balcony with a hose.
  'mt01-p1-s05': () => [
    rect(0, 0, 800, 600, C.w, { outline: false }),
    // building wall + glass door
    rect(470, 40, 260, 400, C.x), line([[600, 40], [600, 440]], 4, C.l), line([[490, 60], [540, 140]], 3, C.s),
    rect(0, 440, 800, 160, C.p, { outline: false }),
    // planters along the railing
    ...[90, 230, 370].map((x) => poly([[x - 50, 420], [x + 50, 420], [x + 40, 470], [x - 40, 470]], C.d)),
    ...[90, 230, 370].flatMap((x) => [-34, -16, 0, 18, 34].map((dx, i) => ellipse(x + dx, 392 - (i % 2) * 22, 14, 34, i % 2 ? C.l : C.m))),
    // railing in front
    line([[0, 470], [800, 470]], 8, C.k), line([[0, 590], [800, 590]], 8, C.k),
    ...Array.from({ length: 21 }, (_, i) => line([[20 + i * 40, 470], [20 + i * 40, 590]], 4, C.d)),
    // man holding a hose nozzle; water arcs onto the plants
    person({ head: [560, 168], torso: [[560, 216], [562, 316]], top: C.m, pants: C.k, legs: [[[550, 334], [548, 400], [546, 466]], [[572, 334], [576, 400], [580, 466]]], arms: [[[548, 232], [522, 270], [500, 288]], [[572, 234], [540, 280], [508, 292]]] }),
    cap([[500, 290], [478, 296]], 7, C.k),
    line([[508, 294], [560, 330], [620, 420], [680, 468]], 6, C.d),
    ...[[-6, 0], [0, 10], [6, 20]].map(([dx, dy]) => `<path d="M474,${294 + dy} Q${400 + dx},${270 + dy} ${370 + dx},${352 + dy}" fill="none" stroke="${C.l}" stroke-width="3" stroke-dasharray="7 8" stroke-linecap="round"/>`),
  ],

  // Boats are tied to a dock; the water is calm and a bridge is in the background.
  'mt01-p1-s06': () => [
    rect(0, 0, 800, 600, C.x, { outline: false }),
    // bridge in the background
    path('M0,200 L800,200 L800,222 L0,222Z', C.l),
    path('M40,222 Q200,120 360,222Z', 'none'), path('M440,222 Q600,120 760,222Z', 'none'),
    ...[60, 380, 420, 740].map((x) => rect(x - 8, 222, 16, 60, C.l)),
    rect(0, 280, 800, 320, C.s, { outline: false }),
    // calm water lines
    ...[300, 340, 390, 450, 520].map((y, i) => line([[60 + i * 30, y], [180 + i * 30, y]], 2, C.l) + line([[520 - i * 20, y + 12], [640 - i * 20, y + 12]], 2, C.l)),
    // dock from the left
    poly([[0, 360], [300, 360], [340, 420], [0, 420]], C.m),
    ...[40, 90, 140, 190, 240].map((x) => line([[x, 360], [x + 20, 420]], 2, C.d)),
    rect(0, 420, 340, 16, C.d),
    ...[60, 200, 320].map((x) => cap([[x, 350], [x, 470]], 12, C.k)),
    // moored boats with ropes to the posts
    boat(360, 410, 220), boat(420, 520, 260), boat(600, 330, 150, C.p, false),
    line([[320, 362], [370, 392]], 3, C.k), line([[200, 362], [260, 440], [430, 500]], 3, C.k), line([[320, 360], [610, 322]], 3, C.k),
  ],
};

mkdirSync(OUT, { recursive: true });
for (const [id, draw] of Object.entries(scenes)) {
  const body = draw().join('\n  ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">\n  ${body}\n</svg>\n`;
  writeFileSync(join(OUT, `${id}.svg`), svg);
  console.log(`images/${id}.svg  ${(svg.length / 1024).toFixed(1)} KB`);
}
