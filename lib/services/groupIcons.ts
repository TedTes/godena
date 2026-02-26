export const DEFAULT_CATEGORY_ICONS: Record<string, string> = {
  outdoors: '🏕️',
  food_drink: '☕',
  professional: '💼',
  language: '🗣️',
  faith: '✝️',
  culture: '🎉',
  other: '👥',
};

const KEYWORD_ICON_RULES: Array<{ icon: string; keywords: string[] }> = [
  { icon: '🥾', keywords: ['hike', 'hiker', 'trail', 'trek', 'mountain'] },
  { icon: '🏃', keywords: ['run', 'runner', 'jog', 'marathon'] },
  { icon: '⚽', keywords: ['soccer', 'football', 'futsal'] },
  { icon: '🏀', keywords: ['basketball', 'hoop'] },
  { icon: '☕', keywords: ['coffee', 'cafe', 'espresso'] },
  { icon: '🍽️', keywords: ['food', 'dinner', 'lunch', 'restaurant', 'brunch'] },
  { icon: '🍳', keywords: ['cook', 'kitchen', 'recipe', 'chef'] },
  { icon: '💼', keywords: ['career', 'job', 'work', 'professional', 'network'] },
  { icon: '💻', keywords: ['code', 'coding', 'dev', 'developer', 'tech'] },
  { icon: '🗣️', keywords: ['language', 'speak', 'conversation', 'amharic', 'tigrinya'] },
  { icon: '📚', keywords: ['book', 'read', 'study'] },
  { icon: '✝️', keywords: ['faith', 'church', 'prayer', 'bible'] },
  { icon: '🕌', keywords: ['mosque', 'islam', 'muslim'] },
  { icon: '🎵', keywords: ['music', 'sing', 'choir', 'song'] },
  { icon: '🎨', keywords: ['art', 'paint', 'design'] },
  { icon: '🎬', keywords: ['movie', 'film', 'cinema'] },
];

export const GROUP_ICON_CHOICES = [
  '🏕️', '🥾', '🏃', '⚽', '🏀',
  '☕', '🍽️', '🍳', '🎵', '🎨',
  '💼', '💻', '🗣️', '📚', '✝️',
  '🕌', '🎉', '👥',
] as const;

export function deriveGroupIcon(name: string, category?: string | null): string {
  const normalized = (name || '').trim().toLowerCase();
  if (normalized.length > 0) {
    for (const rule of KEYWORD_ICON_RULES) {
      if (rule.keywords.some((kw) => normalized.includes(kw))) {
        return rule.icon;
      }
    }
  }

  if (category && DEFAULT_CATEGORY_ICONS[category]) {
    return DEFAULT_CATEGORY_ICONS[category];
  }
  return DEFAULT_CATEGORY_ICONS.other;
}
