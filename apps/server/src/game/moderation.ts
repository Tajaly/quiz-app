import {
  RegExpMatcher,
  TextCensor,
  asteriskCensorStrategy,
  englishDataset,
  englishRecommendedTransformers,
} from 'obscenity';

export interface Moderation {
  isProfane(text: string): boolean;
  censor(text: string): string;
}

export function createModeration(): Moderation {
  const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });
  const censor = new TextCensor().setStrategy(asteriskCensorStrategy());
  return {
    isProfane: (text) => matcher.hasMatch(text),
    censor: (text) => {
      const matches = matcher.getAllMatches(text);
      return matches.length > 0 ? censor.applyTo(text, matches) : text;
    },
  };
}

export const noModeration: Moderation = {
  isProfane: () => false,
  censor: (text) => text,
};
