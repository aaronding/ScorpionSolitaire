import { type Level, RULES } from '../model/rule';
import { BACKS, CUSTOM_BACK, backUrl, pictureToBack } from './art';
import { type Settings, loadStats, resetStats } from './storage';

/** Makes an element: h('p', { class: 'x' }, 'text', child...). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...children);
  return el;
}

/**
 * Shows a modal dialog built from body, with buttons along the bottom.
 * Resolves with the label of the button pressed, or null if dismissed.
 */
export function modal(title: string, body: Node[], buttons: string[], primary = buttons[buttons.length - 1]): Promise<string | null> {
  const dialog = h('dialog', { 'aria-label': title });
  const row = h('div', { class: 'buttons' });
  return new Promise((resolve) => {
    for (const label of buttons) {
      const b = h('button', { type: 'button', class: label === primary ? 'primary' : '' }, label);
      b.addEventListener('click', () => {
        resolve(label);
        dialog.close();
      });
      row.append(b);
    }
    dialog.append(h('h2', {}, title), ...body, row);
    dialog.addEventListener('close', () => {
      resolve(null);
      dialog.remove();
    });
    document.body.append(dialog);
    dialog.showModal();
    (row.querySelector('.primary') as HTMLElement | null)?.focus();
  });
}

export async function confirm(title: string, message: string, ok: string): Promise<boolean> {
  return (await modal(title, [h('p', {}, message)], ['Cancel', ok])) === ok;
}

export function levelPicker(current: Level | undefined): { element: HTMLElement; value: () => Level } {
  const box = h('div', { class: 'levels', role: 'radiogroup' });
  for (const rule of RULES) {
    const input = h('input', { type: 'radio', name: 'level', value: rule.level });
    input.checked = rule.level === (current ?? 'easy');
    box.append(h('label', {}, input, h('span', {}, h('b', {}, rule.name), h('br'), rule.summary)));
  }
  return {
    element: box,
    value: () => (box.querySelector('input:checked') as HTMLInputElement).value as Level,
  };
}

/** Settings: difficulty for the next game, and the card back. */
export async function settingsDialog(settings: Settings): Promise<Settings | null> {
  const levels = levelPicker(settings.level);
  let back = settings.back;
  let custom = settings.customBack;

  const grid = h('div', { class: 'backs', role: 'radiogroup', 'aria-label': 'Card back' });
  const tiles: HTMLButtonElement[] = [];
  const select = (name: string) => {
    back = name;
    tiles.forEach((t) => t.setAttribute('aria-checked', String(t.dataset.back === name)));
  };
  const tile = (name: string, src: string | undefined, label: string) => {
    const t = h('button', { type: 'button', role: 'radio', 'data-back': name, 'aria-label': label });
    if (src) t.append(h('img', { src, alt: '' }));
    else t.append(h('span', {}, 'Your picture'));
    t.addEventListener('click', () => (name === CUSTOM_BACK && !custom ? file.click() : select(name)));
    tiles.push(t);
    grid.append(t);
    return t;
  };
  for (const name of BACKS) tile(name, backUrl(name), name.replace(/_/g, ' '));
  const customTile = tile(CUSTOM_BACK, custom, 'Your picture');

  const file = h('input', { type: 'file', accept: 'image/*', hidden: '' });
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    try {
      custom = await pictureToBack(f);
      customTile.replaceChildren(h('img', { src: custom, alt: '' }));
      select(CUSTOM_BACK);
    } catch {
      alert("That file isn't a picture this game can read.");
    }
  });
  const pick = h('button', { type: 'button', class: 'link' }, 'Choose a picture…');
  pick.addEventListener('click', () => file.click());
  select(back);

  const answer = await modal(
    'Settings',
    [
      h('h3', {}, 'Difficulty'),
      h('p', { class: 'note' }, 'Applies to the next game you start.'),
      levels.element,
      h('h3', {}, 'Card back'),
      grid,
      h('p', {}, pick, file),
    ],
    ['Cancel', 'OK'],
  );
  if (answer !== 'OK') return null;
  return { level: levels.value(), back, customBack: custom };
}

export async function statsDialog(): Promise<void> {
  const table = h('table', { class: 'stats' });
  const fill = () => {
    table.replaceChildren(
      h('tr', {}, ...['Level', 'Played', 'Won', 'Win rate', 'Streak', 'Best'].map((t) => h('th', {}, t))),
    );
    for (const rule of RULES) {
      const s = loadStats(rule.level);
      const rate = s.played ? `${Math.round((100 * s.won) / s.played)}%` : '–';
      table.append(h('tr', {}, ...[rule.name, s.played, s.won, rate, s.streak, s.best].map((v) => h('td', {}, String(v)))));
    }
  };
  fill();
  for (;;) {
    const answer = await modal('Statistics', [table], ['Reset', 'Close']);
    if (answer !== 'Reset') return;
    if (await confirm('Statistics', 'Clear all statistics?', 'Clear')) resetStats();
    fill();
  }
}

export function helpDialog(): Promise<string | null> {
  const section = (title: string, ...items: string[]) => [h('h3', {}, title), h('ul', {}, ...items.map((i) => li(i)))];
  const li = (html: string) => {
    const el = h('li');
    el.innerHTML = html;
    return el;
  };
  return modal(
    'How to Play',
    [
      h('p', {}, 'Sort the whole deck into four columns, each running from King down to Ace in one suit. Every game you are dealt can be won.'),
      ...section(
        'Moving cards',
        'Drag a face-up card onto the last card of another column. Every card below it moves too.',
        '<b>Easy</b>: any card one rank lower. <b>Medium</b>: same color. <b>Difficult</b>: same suit.',
        'Only a King (with any cards below it) can move into an empty column. Nothing goes on an Ace.',
        'A face-down card turns over when it is uncovered.',
        'Tap the reserve, top left, to deal its three cards onto the first three columns. You can do this once.',
      ),
      ...section(
        'Helpers',
        '<b>Double-click</b> or double-tap a card to send it to its best place.',
        '<b>Hint</b> (H) shows a move. <b>Undo</b> (Ctrl/⌘ Z) works as far as the level allows: everything on Easy, until the reserve is dealt on Medium, not at all on Difficult.',
        'Hold the right mouse button on a covered card to see all of it.',
        "If a move makes the game impossible to win, you'll be told. <b>Give Up</b> and the computer finishes the game, taking back moves first if it must.",
        'Every deal has a number; the same number deals the same cards here and in the desktop version.',
        'Once opened, the game plays offline too. Install it from your browser to start it like an app (on iPhone and iPad: Share, then <b>Add to Home Screen</b>).',
      ),
    ],
    ['Close'],
  );
}

export function aboutDialog(version: string): Promise<string | null> {
  const p = (html: string) => {
    const el = h('p');
    el.innerHTML = html;
    return el;
  };
  return modal(
    'Scorpion Solitaire',
    [
      p(`Version ${version} · by Aaron Ding · <a href="mailto:scorpion@webthinking.io?subject=Scorpion%20Solitaire">scorpion@webthinking.io</a>`),
      p('Free software under the GNU General Public License, version 2 or later. <a href="https://github.com/aaronding/ScorpionSolitaire" target="_blank" rel="noopener">Source code on GitHub</a>.'),
      p('Card art: <a href="https://www.tekeye.uk/playing_cards/svg-playing-cards" target="_blank" rel="noopener">SVG Playing Cards by Tek Eye</a>, public domain.'),
    ],
    ['Close'],
  );
}

/** Asks for a deal number; null if cancelled. */
export async function dealNumberDialog(max: number): Promise<number | null> {
  const input = h('input', { type: 'number', min: '1', max: String(max), inputmode: 'numeric', 'aria-label': 'Game number' });
  const answer = await modal('Select Game', [h('p', {}, `Game number, from 1 to ${max.toLocaleString()}:`), input], ['Cancel', 'Deal']);
  const n = Number(input.value);
  if (answer !== 'Deal' || !Number.isInteger(n) || n < 1 || n > max) return null;
  return n;
}
