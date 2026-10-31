export const ROOM_SIZE = 2;
export const TICK_MS = 50;
export const SNAPSHOT_MS = 100;
export const PLAYER_SPEED = 4.2;
export const SPRINT_MULT = 1.65;
export const EYE = 1.65;
export const HOUSE = { minX: -6, maxX: 6, minZ: -5, maxZ: 5, door: { x: 0, z: 5 } };
export const BANK = { minX: 14, maxX: 34, minZ: 20, maxZ: 36, door: { x: 24, z: 20 } };
export const SHOP = { minX: -26, maxX: -12, minZ: 20, maxZ: 32, seller: { x: -19, z: 29 } };
export const TRUCK = { x: 8, z: 22, radius: 3 };
export const CASH_POINTS = [{ x: 20, z: 29 }, { x: 28, z: 29 }];
export const WARDROBES = [{ x: -4.5, z: -3.5 }, { x: 4.5, z: -3.5 }];
export const BEDS = [{ x: -3.2, z: 0 }, { x: 3.2, z: 0 }];
export const PRICES = { pistol: 200, smg: 600, rifle: 1200, bag: 150, ammo: 10 };
export const AMMO_PACK = 30;
export const WEAPONS = {
  pistol: { name: 'Пистолет', mag: 12, damage: 25, range: 40, rate: 350, price: PRICES.pistol },
  smg: { name: 'ПП', mag: 30, damage: 18, range: 35, rate: 110, price: PRICES.smg },
  rifle: { name: 'Винтовка', mag: 10, damage: 55, range: 70, rate: 700, price: PRICES.rifle }
};
export const STORAGE_SIZE = 15;
export const HOTBAR_SIZE = 6;
export const SHOP_ITEMS = [
  { id: 'pistol', name: 'Пистолет «Грач»', desc: 'Компактный полуавтомат. Магазин 12 патронов. Надёжен и дёшев.', price: PRICES.pistol, stats: { Урон: 25, Скорость: '3/с', Магазин: 12 } },
  { id: 'smg', name: 'ПП «Кедр»', desc: 'Скорострельный пистолет-пулемёт. Магазин 30. Хорош в ближнем бою.', price: PRICES.smg, stats: { Урон: 18, Скорость: '9/с', Магазин: 30 } },
  { id: 'rifle', name: 'Винтовка «Тигр»', desc: 'Снайперская винтовка с оптикой. Магазин 10. Бьёт далеко и больно.', price: PRICES.rifle, stats: { Урон: 55, Скорость: '1.4/с', Магазин: 10 } },
  { id: 'bag', name: 'Спортивная сумка', desc: 'Вмещает крупную наличность. С ней кража из банка занимает 30 с, но приносит больше.', price: PRICES.bag },
  { id: 'ammo', name: 'Патроны ×30', desc: 'Универсальная коробка патронов. Продаётся отдельно от оружия.', price: PRICES.ammo },
];
export function inZone(p, z) { return p.x >= z.minX && p.x <= z.maxX && p.z >= z.minZ && p.z <= z.maxZ; }
export function dist2(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
