'use strict';
// Shared pure routing code: the browser and node tests use this exact implementation.
((root) => {
  const api = {
    resolve(catalog, state, sex) {
      const cls = catalog.classes.find(c => c.name === state.cls);
      const hair = Number(state.hair[sex]), palette = Number(state.palette[sex]);
      if (!cls || !cls.weapons.includes(state.weapon) || !catalog.hairs[sex]?.includes(hair) ||
          !catalog.palettes[sex].some(p => p.id === palette) ||
          !Object.hasOwn(catalog.directions, state.direction) || !Object.hasOwn(catalog.stances, state.stance || 'attack')) throw new Error('Invalid appearance selection');
      const stance=state.stance || 'attack';
      const action = (stance==='attack' ? (cls.action || cls.actions[sex][state.weapon]) : catalog.stances[stance].baseAction) + catalog.directions[state.direction];
      const params = new URLSearchParams({job:cls.job, gender:sex==='f'?'female':'male', head:hair,
        headPalette:palette, headgear:'69,3', garment:1, weapon:catalog.weapons[state.weapon],
        action, enableShadow:'true', canvas:catalog.canvas});
      if(stance==='idle') params.set('headdir','straight');
      if (!state.animated) params.set('frame', '0');
      return {key:`${cls.job}-${sex}-${state.weapon}-${hair}-${palette}-${state.direction}${stance==='attack'?'':'-'+stance}`,
        url:catalog.provider+'?'+params, hair, palette, action, stance};
    },
    source(catalog, state, sex, records, embedded) {
      const result = api.resolve(catalog, state, sex), row = records.get(result.key);
      if (row?.status === 'pass') {
        const file = state.animated ? row.file : row.file.replace('.png', '-still.png');
        const url = embedded ? embedded[file] : 'art/'+file;
        if (url) return {...result, src:url, local:true, frames:row.frames};
      }
      return {...result, src:result.url, local:false};
    }
  };
  if (typeof module !== 'undefined') module.exports = api;
  else root.HairModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
