/* World-chat announcer: shared copy and cadence for the Worker scheduler and the browser client.
   The Worker (workers/social/room.mjs) picks and schedules the World lines from the pools below;
   the browser (assets/social.js) reads the persona, the milestone wording and the personal-hint
   thresholds. Edit the strings freely - unknown {placeholders} render as-is, so a typo can never
   crash chat. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PGSocialAnnouncements=api})(globalThis,()=>{
'use strict';
const A={};
// The persona that "speaks" the scheduled lines (tips, community, spotlights, welcomes). Milestone
// and fishing lines speak as facts, without a speaker prefix.
A.PERSONA='Horizon Herald';
// Scheduled World lines: one every 8-18 minutes while anybody is connected. The clock resets when
// the last player leaves, so nobody returns to a burst of catch-up lines.
A.MIN_GAP=8*60000;
A.MAX_GAP=18*60000;
// Relative share of the scheduled pools. A pool with no eligible content is skipped and its weight
// is silently redistributed (spotlights need an eligible player; community and spotlights need at
// least MIN_AUDIENCE connected players). Welcomes are not weighted: they fire on their own short
// clock shortly after a fresh arrival, because an 8-18 minute world line would find them stale.
A.WEIGHTS={tip:40,community:20,spotlight:25};
// Scheduled spotlights and community lines never fire for a lone player.
A.MIN_AUDIENCE=2;
// A scheduled spotlight never repeats the same adventurer inside this window.
A.SPOT_COOLDOWN=90*60000;
// A "say hello" line fires on its own short clock this long after a fresh arrival (far sooner than
// the world-line cadence), but only while the arrival is still fresh and somebody else is online.
// Each adventurer is greeted at most once per announcer session.
A.WELCOME_DELAY_MIN=20000;
A.WELCOME_DELAY_MAX=45000;
A.WELCOME_MS=10*60000;
// Milestone thresholds (owner-tuned).
A.LEVELS=[99,150];          // base-level milestones worth a World line
A.REFINES=[10,15];          // equipment refine milestones worth a World line
A.FISH_WORLD_MIN_KG=800;    // a mythical or secret catch this heavy is World news
A.POKER_WIN_MIN=5000;       // a single Hold'em pot win this big is World news
A.ECHO_BRAG_COOLDOWN=30*60000; // at most one Endless Echo record line per half hour per player
// {online} = players connected anywhere (field or plaza). Used when nobody is in a plaza.
A.COMMUNITY_ONLINE=[
 '🌐 {online} adventurers are online right now. The world feels alive!',
 '{online} heroes are grinding somewhere in Horizon Haven right now.',
];
// {plaza} = the busiest plaza number, {players} = how many are in it. Used while anyone is in a plaza.
A.COMMUNITY_PLAZA=[
 'Fountain Plaza {plaza} is buzzing — {players} adventurers around the fountain.',
 '{players} adventurers are hanging out at Fountain Plaza {plaza}. Walk over and say hi!',
 'The ponds are lively — anglers are casting at Fountain Plaza {plaza} right now.',
];
A.TIPS=[
 'Your character keeps farming while you visit the Fountain Plaza. The grind never stops.',
 'Bag full? Set up Auto-sell in EQUIPMENT ▸ Auto-sell and let the Zeny flow.',
 'Loose cards can be socketed into gear at the Card workspace. Check the fit before you buy sockets.',
 'Unspent stat points do nothing. Spend them under CHARACTER.',
 'Pets only come from monster drops. Farm the field that drops the pet you want.',
 'Three pets can fight beside you. Swap them to match the field.',
 'Endless Echo is a three-minute damage trial. Your only rival is your own record.',
 'Fourth jobs wait beyond the Ascension fields. The Astral Citadel is calling.',
 'Nightmare stages pay better — if your build can take the hits.',
 'The Ascension Forge turns N+ equipment into Mythic set pieces.',
 'Click a name in World chat to whisper, mute or add a friend.',
 'Fishing in the Plaza earns Fishcoins — even while you AFK on a bench.',
 "The Hold'em tables seat six each. The buy-in is yours to defend.",
 'Benches in the Plaza seat two side-by-side. /sit and make a friend.',
 'Your Hunt title shows under your name in the Plaza. Wear it proudly.',
 'Refine protection scrolls keep your rank on a failed attempt. Enable them in Refine.',
 'Daily contracts and the daily roulette reset at 00:00 UTC. Claim before they vanish.',
 'The Black Market takes Zeny you already have. Window-shop before you sell your drops.',
];
// {name} {cls} {lv} - the greeted adventurer. Fires shortly after they connect.
A.WELCOME=[
 '👋 Say hello to {name}, a {cls} who just arrived in Horizon Haven!',
 '👋 Welcome to Horizon Haven, {name} the {cls} — the fountain is this way.',
];
// Spotlight templates. `need` gates a template on live state: "fish" = line in the water,
// "poker" = seated at Hold'em, "title" = wearing a hunt title. Plain templates always qualify.
// {name} {cls} {lv} {title} {ftitle} {plaza} are filled from the room's own data.
A.SPOTLIGHT=[
 {text:'🔍 Spotlight: {name} — Base {lv} {cls}, grinding hard right now!'},
 {text:'⭐ Keep an eye on {name} the {cls} — the "{title}" title suits them.',need:'title'},
 {text:'🎣 {name} is fishing in Plaza {plaza} wearing the "{ftitle}" title. Respect the rod.',need:'fish'},
 {text:"🃏 {name} is holding a seat at the Hold'em table in Plaza {plaza}. Nerves of steel.",need:'poker'},
];
// Milestone wording. The server fills these: {name} plus the values below.
A.MILESTONE={
 level:'🎉 {name} reached Base Level {lv}!',                                    // {lv}
 refine:'🔨 {name} refined a piece of equipment to +{r}!',                      // {r}
 echo:'📯 {name} set a new Endless Echo record — {dps} DPS!',                   // {dps}
 poker:"♠️ {name} won {chips} chips at the Hold'em table!",                     // {chips}
 fishing:'🎣 {name} landed a {rarity} {species} weighing {w} kg — World catch!',// {species} {rarity} {w} (client resolves the catch)
};
// Personal hints: delivered only to that player, driven by the local save. Rendered without the
// persona prefix; the "Just you" wording is deliberate so nobody thinks the whole world read it.
A.HINT={
 // Highest first; each fires once per session when the bag crosses the percentage.
 BAG_PCTS:[100,90,80],
 BAG:'🧭 Just you — your bag is {pct}% full. Auto-sell would like a word.',
 GRIND_MS:6*3600000,
 GRIND:'🧭 Just you — you have been grinding for {hours}h straight. Stretch, hydrate — the mobs will wait.',
};
// Replace {word} placeholders from `vars`; unknown words survive so a typo stays visible but safe.
A.fill=(tpl,vars)=>String(tpl==null?'':tpl).replace(/\{(\w+)\}/g,(all,k)=>vars&&vars[k]!=null?String(vars[k]):all);
A.fmt=n=>Math.round(Number(n)||0).toLocaleString('en-US');
return A;
});
