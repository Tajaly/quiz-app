export const KART_MODELS = ['classic', 'rocket', 'buggy', 'bolt', 'truck', 'bubble'] as const;
export type KartModel = (typeof KART_MODELS)[number];

export const KART_COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan'] as const;
export type KartColor = (typeof KART_COLORS)[number];

export interface Kart {
  model: KartModel;
  color: KartColor;
}

export const KART_MODEL_LABELS: Record<KartModel, string> = {
  classic: 'Classic',
  rocket: 'Rocket',
  buggy: 'Buggy',
  bolt: 'Bolt',
  truck: 'Truck',
  bubble: 'Bubble',
};

export const KART_COLOR_LABELS: Record<KartColor, string> = {
  red: 'Red',
  blue: 'Blue',
  green: 'Green',
  yellow: 'Yellow',
  purple: 'Purple',
  orange: 'Orange',
  pink: 'Pink',
  cyan: 'Cyan',
};

export function randomKart(random: () => number = Math.random): Kart {
  const model = KART_MODELS[Math.floor(random() * KART_MODELS.length)] ?? 'classic';
  const color = KART_COLORS[Math.floor(random() * KART_COLORS.length)] ?? 'red';
  return { model, color };
}
