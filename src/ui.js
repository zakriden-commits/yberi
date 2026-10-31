import { PRICES, WEAPONS, AMMO_PACK } from './shared/constants.js';
const icon = { fists: '✊', pistol: '🔫', smg: '🔫', rifle: '🔫', ammo: '📦', cash: '💵', bag: '🎒', crate: '📦' };
const name = { fists: 'Кулак', pistol: 'Пистолет', smg: 'ПП', rifle: 'Винтовка', ammo: 'Патроны', cash: 'Деньги', bag: 'Сумка', crate: 'Ящик' };
export class UI {
  constructor() { this.dialog = document.getElementById('dialog'); this.body = document.getElementById('dialogBody'); document.getElementById('dialogClose').onclick = () => this.close(); }
  close() { this.dialog.hidden = true; }
  open(html) { this.body.innerHTML = html; this.dialog.hidden = false; }
  toast(text) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = text; document.getElementById('toasts').appendChild(t); setTimeout(() => t.remove(), 3500); }
  hud(p) { document.getElementById('hp').style.width = p.health + '%'; document.getElementById('sta').style.width = p.stamina + '%'; document.getElementById('money').textContent = '$' + p.balance; document.getElementById('wanted').textContent = '★'.repeat(p.wanted) + '☆'.repeat(5 - p.wanted); }
  hotbar(inv, selected, onSelect) {
    const bar = document.getElementById('hotbar'); bar.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const it = inv[i]; const d = document.createElement('div'); d.className = 'slot' + (i === selected ? ' active' : '');
      d.innerHTML = it ? `${icon[it.type] || '?'}<br>${name[it.type] || it.type}${it.count ? `<span class="count">${it.count}</span>` : ''}${it.mag !== undefined ? `<span class="count">${it.mag}</span>` : ''}` : '';
      d.onclick = () => onSelect(i); bar.appendChild(d);
    }
  }
  prompt(text) { document.getElementById('prompt').textContent = text || ''; document.getElementById('prompt').style.display = text ? 'block' : 'none'; }
  progress(v, text) { const el = document.getElementById('progress'); el.hidden = !v; el.querySelector('i').style.width = (v * 100) + '%'; el.querySelector('span').textContent = text || ''; }
  shop(balance, onBuy) {
    const items = [['pistol', PRICES.pistol, 'Компактный пистолет. Магазин 12.'], ['smg', PRICES.smg, 'Скорострельный ПП. Магазин 30.'], ['rifle', PRICES.rifle, 'Мощная винтовка. Магазин 10.'], ['ammo', PRICES.ammo, `Патроны x${AMMO_PACK}. Дёшево.`], ['bag', PRICES.bag, 'Сумка для денег. Больше вместимость.']];
    this.open(`<h2>Оружейный магазин</h2><p class="muted">Баланс: $${balance}</p>` + items.map(([id, price, desc]) => `<div class="shop-item"><div><b>${name[id]}</b><div class="muted">${desc}</div></div><button data-buy="${id}">$${price}</button></div>`).join(''));
    this.body.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => onBuy(b.dataset.buy));
  }
  storage(storage, inv, onPut, onTake) {
    this.open(`<h2>Шкаф</h2><p class="muted">Общий тайник. Сохраняется.</p><h3>В шкафу</h3>` + (storage.map((it, i) => `<div class="store-item"><span>${icon[it.type]} ${name[it.type]} ${it.count || ''}</span><button data-take="${i}">Взять</button></div>`).join('') || '<p class="muted">Пусто</p>') + `<h3>Инвентарь</h3>` + inv.map((it, i) => i === 0 ? '' : `<div class="store-item"><span>${icon[it.type]} ${name[it.type]}</span><button data-put="${i}">Положить</button></div>`).join(''));
    this.body.querySelectorAll('[data-take]').forEach(b => b.onclick = () => onTake(+b.dataset.take));
    this.body.querySelectorAll('[data-put]').forEach(b => b.onclick = () => onPut(+b.dataset.put));
  }
  jobOffer(onAccept) { this.open(`<h2>Подработка</h2><p>Помоги перенести ящик в грузовик. Плачу нормально.</p><button class="btn primary" id="acceptJob">Помочь</button>`); document.getElementById('acceptJob').onclick = () => { onAccept(); this.close(); }; }
  itemDialog(item, index, onDeposit) {
    if (item.type === 'cash') this.open(`<h2>Деньги</h2><p>Пачек: ${item.count}</p><button class="btn primary" id="dep">Перечислить в баланс</button>`), document.getElementById('dep').onclick = () => onDeposit(index, item.count);
    else if (item.type === 'bag') this.open(`<h2>Сумка</h2><p>В сумке: $${item.bagCash || 0}</p><input id="amt" type="number" value="${item.bagCash || 0}" min="0"/><button class="btn primary" id="wd">Вывести</button>`), document.getElementById('wd').onclick = () => onDeposit(index, +document.getElementById('amt').value);
  }
  about() { this.open(`<h2>Deni Islam</h2><p>Кооперативная 3D-песочница на двоих. Вы — джентльмен и гопник. Живёте в одном доме, берёте подработки, покупаете снаряжение и можете рискнуть ограбить банк. Полиция не дремлет. Дружественный огонь отключён.</p><p class="muted">Тестовая версия. Прогресс сохраняется на сервере.</p>`); }
  controls() { this.open(`<h2>Управление</h2><p><b>ПК:</b> WASD — ходьба, мышь — обзор, Shift — бег, E — действие/удерживать у денег, R — перезарядка, ЛКМ — огонь, 1–6 — слоты.</p><p><b>Телефон:</b> джойстик слева, обзор справа, кнопки ОГОНЬ / E / R / БЕГ.</p><p>В банке держи E у денег. С сумкой — 30 сек, без — 15 сек. Прячься дома с закрытой дверью, чтобы звёзды ушли.</p>`); }
}
