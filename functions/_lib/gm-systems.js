// Small, explicit catalogs for the Social Hub systems exposed by the authenticated GM console.
// Keep these IDs in sync with assets/social-fishing.js and the Social Worker's MVP list; the
// relevant simulations assert that both sides still agree.
export const FISHING_RODS = Object.freeze([
  { id: 'twig', label: 'Twig Rod' },
  { id: 'oak', label: 'Oak Rod' },
  { id: 'brass', label: 'Brass Rod' },
  { id: 'silver', label: 'Silver Rod' },
  { id: 'golden', label: 'Golden Rod' },
  { id: 'mythril', label: 'Mythril Rod' },
]);

export const FISHING_BAIT = Object.freeze([
  { id: 'worm', label: 'Worm' },
  { id: 'shrimp', label: 'Shrimp Tail' },
  { id: 'grub', label: 'Glow Grub' },
  { id: 'jelly', label: 'Royal Jelly' },
]);

export const FISHING_MVP = Object.freeze([
  { id: 'mvp_azure_drake', label: 'Azure Drake' },
  { id: 'mvp_tide_drake', label: 'Tide Drake' },
  { id: 'mvp_abyss_drake', label: 'Abyss Drake' },
  { id: 'mvp_iron_crab', label: 'Iron Crab Titan' },
  { id: 'mvp_crimson_shark', label: 'Crimson Tyrant' },
  { id: 'mvp_gilded_shark', label: 'Gilded Tyrant' },
  { id: 'mvp_void_maw', label: 'Void Maw' },
]);

export const SOCIAL_ROOM_CAP = 50;
export const DIGIMON_STARTER_EGG_CAP = 48;
