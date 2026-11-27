/**
 * Pad 1 of the PS1 as setButtons(mask) reads it: one bit per button, a 0 bit
 * is PRESSED and 0xFFFF is idle. Bits, low to high: Select, -, -, Start, Up,
 * Right, Down, Left, L2, R2, L1, R1, Triangle, Circle, Cross, Square.
 */
export const PAD_IDLE = 0xffff;

export interface PadButton {
  /** What the help screen calls it. */
  label: string;
  bit: number;
  /** KeyboardEvent.code: physical position, so AZERTY and QWERTY agree. */
  code: string;
  /** What is printed on the keycap, for the help screen. */
  key: string;
  /** Which drawing shows it on the help screen. */
  icon: 'up' | 'down' | 'left' | 'right' | 'cross' | 'circle' | 'square' | 'triangle' | 'shoulder' | 'start' | 'select';
}

export const PAD_BUTTONS: readonly PadButton[] = [
  { label: 'Haut', bit: 4, code: 'ArrowUp', key: '↑', icon: 'up' },
  { label: 'Bas', bit: 6, code: 'ArrowDown', key: '↓', icon: 'down' },
  { label: 'Gauche', bit: 7, code: 'ArrowLeft', key: '←', icon: 'left' },
  { label: 'Droite', bit: 5, code: 'ArrowRight', key: '→', icon: 'right' },
  { label: 'Croix', bit: 14, code: 'KeyX', key: 'X', icon: 'cross' },
  { label: 'Rond', bit: 13, code: 'KeyC', key: 'C', icon: 'circle' },
  { label: 'Carré', bit: 15, code: 'KeyS', key: 'S', icon: 'square' },
  { label: 'Triangle', bit: 12, code: 'KeyD', key: 'D', icon: 'triangle' },
  { label: 'L1', bit: 10, code: 'KeyE', key: 'E', icon: 'shoulder' },
  { label: 'R1', bit: 11, code: 'KeyR', key: 'R', icon: 'shoulder' },
  { label: 'L2', bit: 8, code: 'KeyF', key: 'F', icon: 'shoulder' },
  { label: 'R2', bit: 9, code: 'KeyT', key: 'T', icon: 'shoulder' },
  { label: 'Start', bit: 3, code: 'Enter', key: 'Entrée', icon: 'start' },
  { label: 'Select', bit: 0, code: 'Backspace', key: 'Retour arrière', icon: 'select' },
];

const BIT_OF_CODE = new Map(PAD_BUTTONS.map((button) => [button.code, button.bit]));

export const isPadKey = (code: string) => BIT_OF_CODE.has(code);

/** The mask for the keys currently held (a set of KeyboardEvent.code). */
export function padMask(held: ReadonlySet<string>): number {
  let mask = PAD_IDLE;
  for (const code of held) {
    const bit = BIT_OF_CODE.get(code);
    if (bit !== undefined) mask &= ~(1 << bit);
  }
  return mask;
}
