/* Native fourth-job body, hair and accessory layers; authored geometry and timing. */
(function(root){
'use strict';
const CLASSES={'Rune Knight':4054,Warlock:4055,Ranger:4056,'Guillotine Cross':4059,'Arch Bishop':4057,Mechanic:4058};
class Store extends PGWardrobe.Store{
 constructor(options={}){super({base:'assets/wardrobe/fourth/v1/',...options,classes:CLASSES})}
}
root.PGFourthJobs={CLASSES,Store};
})(globalThis);
