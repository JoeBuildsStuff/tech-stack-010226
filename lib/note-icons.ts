import {
  Apple,
  Beef,
  Carrot,
  ChefHat,
  Coffee,
  Cookie,
  Croissant,
  Drumstick,
  Fish,
  IceCreamCone,
  Pizza,
  Salad,
  Sandwich,
  Soup,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

export const NOTE_ICON_NAMES = [
  "utensils-crossed",
  "chef-hat",
  "beef",
  "drumstick",
  "fish",
  "salad",
  "carrot",
  "apple",
  "pizza",
  "sandwich",
  "soup",
  "croissant",
  "cookie",
  "ice-cream-cone",
  "coffee",
] as const;

export type NoteIconName = (typeof NOTE_ICON_NAMES)[number];

export const DEFAULT_NOTE_ICON: NoteIconName = "utensils-crossed";

const NOTE_ICON_NAME_SET = new Set<string>(NOTE_ICON_NAMES);

export function isNoteIconName(value: string): value is NoteIconName {
  return NOTE_ICON_NAME_SET.has(value);
}

export function normalizeNoteIconName(
  value: string | null | undefined
): NoteIconName {
  return value && isNoteIconName(value) ? value : DEFAULT_NOTE_ICON;
}

export const NOTE_ICON_COMPONENTS: Record<string, LucideIcon> = {
  "utensils-crossed": UtensilsCrossed,
  "chef-hat": ChefHat,
  beef: Beef,
  drumstick: Drumstick,
  fish: Fish,
  salad: Salad,
  carrot: Carrot,
  apple: Apple,
  pizza: Pizza,
  sandwich: Sandwich,
  soup: Soup,
  croissant: Croissant,
  cookie: Cookie,
  "ice-cream-cone": IceCreamCone,
  coffee: Coffee,
};

export type NoteIconOption = {
  name: NoteIconName;
  label: string;
  Icon: LucideIcon;
};

export const NOTE_ICON_OPTIONS: NoteIconOption[] = [
  { name: "utensils-crossed", label: "Utensils", Icon: UtensilsCrossed },
  { name: "chef-hat", label: "Chef Hat", Icon: ChefHat },
  { name: "beef", label: "Beef", Icon: Beef },
  { name: "drumstick", label: "Drumstick", Icon: Drumstick },
  { name: "fish", label: "Fish", Icon: Fish },
  { name: "salad", label: "Salad", Icon: Salad },
  { name: "carrot", label: "Carrot", Icon: Carrot },
  { name: "apple", label: "Apple", Icon: Apple },
  { name: "pizza", label: "Pizza", Icon: Pizza },
  { name: "sandwich", label: "Sandwich", Icon: Sandwich },
  { name: "soup", label: "Soup", Icon: Soup },
  { name: "croissant", label: "Croissant", Icon: Croissant },
  { name: "cookie", label: "Cookie", Icon: Cookie },
  { name: "ice-cream-cone", label: "Ice Cream", Icon: IceCreamCone },
  { name: "coffee", label: "Coffee", Icon: Coffee },
];

const NOTE_ICON_OPTION_MAP = new Map<NoteIconName, NoteIconOption>(
  NOTE_ICON_OPTIONS.map((option) => [option.name, option])
);

export function getNoteIconOption(
  iconName: NoteIconName | null | undefined
): NoteIconOption {
  return (
    (iconName ? NOTE_ICON_OPTION_MAP.get(iconName) : undefined) ??
    NOTE_ICON_OPTION_MAP.get(DEFAULT_NOTE_ICON)!
  );
}

export function getNoteIconComponent(
  iconName: string | null | undefined
): LucideIcon {
  const component = iconName ? NOTE_ICON_COMPONENTS[iconName] : undefined;
  return component ?? UtensilsCrossed;
}
