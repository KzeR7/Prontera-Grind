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
  { id: 'chum', label: 'Leviathan Chum' },
]);

export const FISHING_MVP = Object.freeze([
  { id: 'mvp_tidewarden', label: 'Tideforged Warden' },
  { id: 'mvp_rimewraith', label: 'Rimewraith Sovereign' },
  { id: 'mvp_tidecourser', label: 'Tidebound Courser' },
  { id: 'mvp_dreadnought', label: 'Dreadnought Reaper' },
  { id: 'mvp_thousandeye', label: 'Thousand-Eye Ravager' },
  { id: 'mvp_auricmaw', label: 'Auric Ceremaw' },
  { id: 'mvp_worldeye', label: 'World-Eye Tortoise' },
  { id: 'mvp_volthorn', label: 'Volthorn Narwhal' },
  { id: 'mvp_dreadclaw', label: 'Dreadclaw Behemoth' },
  { id: 'mvp_stormcoil', label: 'Stormcoil Leviathan' },
]);

export const SOCIAL_ROOM_CAP = 50;
export const DIGIMON_STARTER_EGG_CAP = 48;
