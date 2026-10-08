// The owner's saved weapon placements, used by both the proposal page and the game renderer.
// Loaded before either page's inline script, so a fresh browser or another machine uses the same defaults.
//   class -> {family, design, views:{m|f:{<view>:{weapon, blend, base, frames}}}}
// `base` is what a drawing with nothing of its own falls back to; a null hand there
// means the page guesses from that sprite's own art. `frames` holds only the drawings
// the owner placed by hand - the ones between them, and after the last one, are worked
// out from them by the page (see "blend the frames in between").
window.WEAPON_PROPOSAL_DEFAULT = {
 "page": "weapon-proposal",
 "version": 4,
 "note": "The owner's progress, kept as the page's starting point. A frame entry only exists where the owner set it by hand; the rest follow `base` (or blend between the frames that are set). `hand: null` keeps the page's own guess for that sprite. The owner's 2026-10-08 v5 changes export has been merged; classes omitted from that delta keep their previous saved defaults. The follow-up v5 changes for Novice, Swordman and Mage were merged on 2026-10-08; Archer was not in that hand-back, so its previous defaults remain.",
 "classes": {
  "Novice": {
   "family": "dagger",
   "design": "dagger_broken",
   "views": {
    "m": {
     "S": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": [
        87,
        121
       ],
       "handAuto": false,
       "dx": 0,
       "dy": 0,
       "rot": -220,
       "scale": 0.6,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "SE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": [
        95,
        123
       ],
       "handAuto": false,
       "dx": 0,
       "dy": 0,
       "rot": -226,
       "scale": 0.6,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": [
        114,
        117
       ],
       "handAuto": false,
       "dx": 0,
       "dy": 0,
       "rot": -226,
       "scale": 0.6,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": [
        127,
        135
       ],
       "handAuto": false,
       "dx": 0,
       "dy": 0,
       "rot": -348,
       "scale": 0.6,
       "flip": [
        -1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         87,
         115
        ],
        "dx": 0,
        "dy": 0,
        "rot": -344,
        "scale": 0.6,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         88,
         118
        ],
        "dx": 0,
        "dy": 0,
        "rot": -348,
        "scale": 0.6,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         84,
         114
        ],
        "dx": 0,
        "dy": 0,
        "rot": -348,
        "scale": 0.6,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         130,
         129
        ],
        "dx": 0,
        "dy": 0,
        "rot": -346,
        "scale": 0.75,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         128,
         130
        ],
        "dx": 0,
        "dy": 0,
        "rot": -348,
        "scale": 0.7,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       }
      }
     }
    },
    "f": {
     "S": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": [
        87,
        121
       ],
       "handAuto": false,
       "dx": 0,
       "dy": 0,
       "rot": -220,
       "scale": 0.6,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "SE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": [
        95,
        123
       ],
       "handAuto": false,
       "dx": 0,
       "dy": 0,
       "rot": -226,
       "scale": 0.6,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": [
        114,
        117
       ],
       "handAuto": false,
       "dx": 0,
       "dy": 0,
       "rot": -226,
       "scale": 0.6,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": [
        127,
        135
       ],
       "handAuto": false,
       "dx": 0,
       "dy": 0,
       "rot": -348,
       "scale": 0.6,
       "flip": [
        -1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         87,
         115
        ],
        "dx": -13,
        "dy": -37,
        "rot": -248,
        "scale": 0.7,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         88,
         118
        ],
        "dx": -9,
        "dy": -46,
        "rot": -230,
        "scale": 0.7,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         84,
         114
        ],
        "dx": -7,
        "dy": -41,
        "rot": -238,
        "scale": 0.7,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         130,
         129
        ],
        "dx": 0,
        "dy": 0,
        "rot": -346,
        "scale": 0.75,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         128,
         130
        ],
        "dx": 0,
        "dy": 0,
        "rot": -348,
        "scale": 0.7,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       }
      }
     }
    }
   }
  },
  "Swordman": {
   "family": "sword",
   "design": "sword_knight",
   "views": {
    "m": {
     "S": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "SE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         68,
         76
        ],
        "dx": 0,
        "dy": 0,
        "rot": 56,
        "scale": 1.1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         77,
         82
        ],
        "dx": 0,
        "dy": 0,
        "rot": -44,
        "scale": 1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         82,
         74
        ],
        "dx": 0,
        "dy": 0,
        "rot": 0,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         77,
         83
        ],
        "dx": 0,
        "dy": 0,
        "rot": -58,
        "scale": 1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         93,
         92
        ],
        "dx": 0,
        "dy": 0,
        "rot": -58,
        "scale": 1.1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "5": {
        "hand": [
         119,
         102
        ],
        "dx": 0,
        "dy": 0,
        "rot": 112,
        "scale": 1.1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "6": {
        "hand": [
         117,
         108
        ],
        "dx": 0,
        "dy": 0,
        "rot": 116,
        "scale": 1.1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       }
      }
     }
    },
    "f": {
     "S": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "SE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         68,
         76
        ],
        "dx": 21,
        "dy": 21,
        "rot": -48,
        "scale": 1.1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         68,
         76
        ],
        "dx": 20,
        "dy": 20,
        "rot": 316,
        "scale": 1.1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         68,
         76
        ],
        "dx": 19,
        "dy": 20,
        "rot": -48,
        "scale": 1.1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         68,
         76
        ],
        "dx": 21,
        "dy": 18,
        "rot": -40,
        "scale": 1.1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         68,
         76
        ],
        "dx": 51,
        "dy": 34,
        "rot": -90,
        "scale": 1.1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "5": {
        "hand": [
         68,
         76
        ],
        "dx": 56,
        "dy": 19,
        "rot": 118,
        "scale": 1.1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "6": {
        "hand": [
         68,
         76
        ],
        "dx": 56,
        "dy": 19,
        "rot": 118,
        "scale": 1.1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "7": {
        "hand": [
         68,
         76
        ],
        "dx": 56,
        "dy": 19,
        "rot": 118,
        "scale": 1.1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "8": {
        "hand": [
         68,
         76
        ],
        "dx": 56,
        "dy": 19,
        "rot": 118,
        "scale": 1.1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       }
      }
     }
    }
   }
  },
  "Mage": {
   "family": "staff",
   "design": "staff_gold",
   "views": {
    "m": {
     "S": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "SE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         106,
         115
        ],
        "dx": 0,
        "dy": 0,
        "rot": 88,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         108,
         115
        ],
        "dx": 0,
        "dy": 0,
        "rot": 85,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         108,
         116
        ],
        "dx": 0,
        "dy": 0,
        "rot": 88,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         118,
         114
        ],
        "dx": 0,
        "dy": 0,
        "rot": 93,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         103,
         116
        ],
        "dx": 0,
        "dy": 0,
        "rot": 14,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "5": {
        "hand": [
         106,
         116
        ],
        "dx": 0,
        "dy": 0,
        "rot": 18,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       }
      }
     }
    },
    "f": {
     "S": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "SE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         106,
         115
        ],
        "dx": 0,
        "dy": 0,
        "rot": 88,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         108,
         115
        ],
        "dx": 9,
        "dy": -32,
        "rot": 85,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         108,
         116
        ],
        "dx": 7,
        "dy": -33,
        "rot": 88,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         118,
         114
        ],
        "dx": 1,
        "dy": -34,
        "rot": 93,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         103,
         116
        ],
        "dx": 0,
        "dy": 0,
        "rot": 14,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "5": {
        "hand": [
         106,
         116
        ],
        "dx": 0,
        "dy": 0,
        "rot": 18,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       }
      }
     }
    }
   }
  },
  "Archer": {
   "family": "bow",
   "design": "bow_chill",
   "views": {
    "m": {
     "S": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "SE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         121,
         110
        ],
        "dx": 0,
        "dy": 0,
        "rot": 54,
        "scale": 1.3,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         124,
         98
        ],
        "dx": 0,
        "dy": 0,
        "rot": 46,
        "scale": 1.3,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         121,
         87
        ],
        "dx": 0,
        "dy": 0,
        "rot": 32,
        "scale": 1.25,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         124,
         104
        ],
        "dx": 0,
        "dy": 0,
        "rot": 40,
        "scale": 1.3,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         121,
         110
        ],
        "dx": 0,
        "dy": 0,
        "rot": 44,
        "scale": 1.3,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "7": {
        "hand": [
         117,
         112
        ],
        "dx": 0,
        "dy": 0,
        "rot": 48,
        "scale": 1.3,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       }
      }
     }
    },
    "f": {
     "S": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "SE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         121,
         110
        ],
        "dx": 0,
        "dy": 0,
        "rot": 54,
        "scale": 1.3,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         124,
         98
        ],
        "dx": 0,
        "dy": 0,
        "rot": 46,
        "scale": 1.3,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         121,
         87
        ],
        "dx": 0,
        "dy": 0,
        "rot": 32,
        "scale": 1.25,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         124,
         104
        ],
        "dx": 0,
        "dy": 0,
        "rot": 40,
        "scale": 1.3,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         121,
         110
        ],
        "dx": 0,
        "dy": 0,
        "rot": 44,
        "scale": 1.3,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "7": {
        "hand": [
         117,
         112
        ],
        "dx": 0,
        "dy": 0,
        "rot": 48,
        "scale": 1.3,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       }
      }
     }
    }
   }
  },
  "Thief": {
   "family": "dagger",
   "design": "dagger_broken",
   "views": {
    "m": {
     "S": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "SE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         83,
         115
        ],
        "dx": -8,
        "dy": 5,
        "rot": 0,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         83,
         115
        ],
        "dx": -8,
        "dy": 5,
        "rot": 0,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         83,
         115
        ],
        "dx": -4,
        "dy": -1,
        "rot": 0,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         83,
         115
        ],
        "dx": -1,
        "dy": 4,
        "rot": 0,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         137,
         121
        ],
        "dx": 1,
        "dy": 8,
        "rot": 104,
        "scale": 1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "5": {
        "hand": [
         135,
         128
        ],
        "dx": 3,
        "dy": 3,
        "rot": 104,
        "scale": 1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "6": {
        "hand": [
         135,
         122
        ],
        "dx": 4,
        "dy": 9,
        "rot": 96,
        "scale": 1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "7": {
        "hand": [
         83,
         115
        ],
        "dx": 56,
        "dy": 15,
        "rot": 96,
        "scale": 1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "8": {
        "hand": [
         83,
         115
        ],
        "dx": 55,
        "dy": 15,
        "rot": 98,
        "scale": 1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       }
      }
     }
    },
    "f": {
     "S": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "SE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         123,
         120
        ],
        "dx": -38,
        "dy": -9,
        "rot": 110,
        "scale": 1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         123,
         120
        ],
        "dx": -37,
        "dy": -12,
        "rot": 96,
        "scale": 1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         123,
         120
        ],
        "dx": -36,
        "dy": -11,
        "rot": 94,
        "scale": 1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         123,
         120
        ],
        "dx": -24,
        "dy": -5,
        "rot": 82,
        "scale": 1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         123,
         120
        ],
        "dx": 7,
        "dy": 8,
        "rot": 82,
        "scale": 1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "5": {
        "hand": [
         123,
         120
        ],
        "dx": 8,
        "dy": 9,
        "rot": 82,
        "scale": 1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "6": {
        "hand": [
         123,
         120
        ],
        "dx": 8,
        "dy": 9,
        "rot": 82,
        "scale": 1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "7": {
        "hand": [
         123,
         120
        ],
        "dx": 8,
        "dy": 9,
        "rot": 82,
        "scale": 1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "8": {
        "hand": [
         123,
         120
        ],
        "dx": 8,
        "dy": 9,
        "rot": 82,
        "scale": 1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       }
      }
     }
    }
   }
  },
  "Acolyte": {
   "family": "mace",
   "design": "mace_gold",
   "views": {
    "m": {
     "S": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         83,
         127
        ],
        "dx": 0,
        "dy": 0,
        "rot": -10,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       }
      }
     },
     "SE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         86,
         87
        ],
        "dx": -7,
        "dy": 1,
        "rot": 48,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         86,
         87
        ],
        "dx": -9,
        "dy": -1,
        "rot": 48,
        "scale": 1.1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         86,
         87
        ],
        "dx": -9,
        "dy": -1,
        "rot": 48,
        "scale": 1.1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         86,
         87
        ],
        "dx": 29,
        "dy": 21,
        "rot": -62,
        "scale": 1.1,
        "flip": [
         -1,
         -1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         86,
         87
        ],
        "dx": 32,
        "dy": 25,
        "rot": 106,
        "scale": 1.1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       }
      }
     }
    },
    "f": {
     "S": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "SE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         118,
         118
        ],
        "dx": -41,
        "dy": -35,
        "rot": 70,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         118,
         118
        ],
        "dx": -40,
        "dy": -37,
        "rot": 90,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         118,
         118
        ],
        "dx": -3,
        "dy": -6,
        "rot": 124,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       }
      }
     }
    }
   }
  },
  "Merchant": {
   "family": "axe",
   "design": "axe_chill",
   "views": {
    "m": {
     "S": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": -8,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "SE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": -8,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": -8,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": -8,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         97,
         115
        ],
        "dx": -12,
        "dy": -24,
        "rot": -150,
        "scale": 1.35,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         97,
         115
        ],
        "dx": -31,
        "dy": -23,
        "rot": -182,
        "scale": 1.35,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         97,
         115
        ],
        "dx": -34,
        "dy": -20,
        "rot": -194,
        "scale": 1.35,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         97,
         115
        ],
        "dx": -32,
        "dy": -17,
        "rot": -206,
        "scale": 1.35,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         97,
         115
        ],
        "dx": -6,
        "dy": -44,
        "rot": -150,
        "scale": 1.35,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "5": {
        "hand": [
         97,
         115
        ],
        "dx": 70,
        "dy": 3,
        "rot": -54,
        "scale": 1.35,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "6": {
        "hand": [
         97,
         115
        ],
        "dx": 69,
        "dy": 2,
        "rot": -58,
        "scale": 1.35,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "7": {
        "hand": [
         97,
         115
        ],
        "dx": 69,
        "dy": 3,
        "rot": -54,
        "scale": 1.35,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "8": {
        "hand": [
         97,
         115
        ],
        "dx": 70,
        "dy": 4,
        "rot": -54,
        "scale": 1.35,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       }
      }
     }
    },
    "f": {
     "S": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": -8,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "SE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": -8,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": -8,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": -8,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         117,
         119
        ],
        "dx": -2,
        "dy": -9,
        "rot": -32,
        "scale": 1.15,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         117,
         119
        ],
        "dx": -31,
        "dy": -47,
        "rot": -122,
        "scale": 1.15,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         117,
         119
        ],
        "dx": -29,
        "dy": -47,
        "rot": -138,
        "scale": 1.15,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         117,
         119
        ],
        "dx": -28,
        "dy": -46,
        "rot": -146,
        "scale": 1.15,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         117,
         119
        ],
        "dx": 35,
        "dy": 7,
        "rot": -32,
        "scale": 1.15,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "5": {
        "hand": [
         117,
         119
        ],
        "dx": 33,
        "dy": 19,
        "rot": -12,
        "scale": 1.15,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "6": {
        "hand": [
         117,
         119
        ],
        "dx": 30,
        "dy": 25,
        "rot": -2,
        "scale": 1.15,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "7": {
        "hand": [
         117,
         119
        ],
        "dx": 30,
        "dy": 22,
        "rot": -4,
        "scale": 1.15,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "8": {
        "hand": [
         117,
         119
        ],
        "dx": 30,
        "dy": 22,
        "rot": -4,
        "scale": 1.15,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       }
      }
     }
    }
   }
  },
  "Knight": {
   "family": "sword",
   "design": "sword_chill",
   "views": {
    "m": {
     "S": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "SE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         78,
         107
        ],
        "dx": -10,
        "dy": -29,
        "rot": -130,
        "scale": 1.2,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         78,
         107
        ],
        "dx": -10,
        "dy": -29,
        "rot": -130,
        "scale": 1.2,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         78,
         107
        ],
        "dx": -13,
        "dy": -30,
        "rot": -130,
        "scale": 1.2,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         78,
         107
        ],
        "dx": 36,
        "dy": -63,
        "rot": -130,
        "scale": 1.2,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         78,
         107
        ],
        "dx": 63,
        "dy": 36,
        "rot": -58,
        "scale": 1.2,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "5": {
        "hand": [
         78,
         107
        ],
        "dx": 63,
        "dy": 36,
        "rot": -58,
        "scale": 1.2,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "6": {
        "hand": [
         78,
         107
        ],
        "dx": 63,
        "dy": 36,
        "rot": -58,
        "scale": 1.2,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "7": {
        "hand": [
         78,
         107
        ],
        "dx": 63,
        "dy": 36,
        "rot": -58,
        "scale": 1.2,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "8": {
        "hand": [
         78,
         107
        ],
        "dx": 63,
        "dy": 36,
        "rot": -58,
        "scale": 1.2,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       }
      }
     }
    },
    "f": {
     "S": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "SE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         124,
         117
        ],
        "dx": -14,
        "dy": -47,
        "rot": -40,
        "scale": 1.1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         124,
         117
        ],
        "dx": -14,
        "dy": -47,
        "rot": -40,
        "scale": 1.1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         124,
         117
        ],
        "dx": 31,
        "dy": -1,
        "rot": -40,
        "scale": 1.1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         124,
         117
        ],
        "dx": 31,
        "dy": 2,
        "rot": -40,
        "scale": 1.1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         124,
         117
        ],
        "dx": 30,
        "dy": 1,
        "rot": -40,
        "scale": 1.1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       }
      }
     }
    }
   }
  },
  "Wizard": {
   "family": "staff",
   "design": "staff_ion",
   "views": {
    "m": {
     "S": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "SE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         119,
         118
        ],
        "dx": -11,
        "dy": 0,
        "rot": 6,
        "scale": 1.15,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         119,
         118
        ],
        "dx": -12,
        "dy": -4,
        "rot": 6,
        "scale": 1.15,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         119,
         118
        ],
        "dx": -11,
        "dy": 0,
        "rot": 6,
        "scale": 1.15,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         119,
         118
        ],
        "dx": -11,
        "dy": 0,
        "rot": 6,
        "scale": 1.15,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         119,
         118
        ],
        "dx": -38,
        "dy": 2,
        "rot": 72,
        "scale": 1.15,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "5": {
        "hand": [
         119,
         118
        ],
        "dx": -36,
        "dy": 13,
        "rot": 6,
        "scale": 1.15,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "6": {
        "hand": [
         119,
         118
        ],
        "dx": -35,
        "dy": 11,
        "rot": 6,
        "scale": 1.15,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "7": {
        "hand": [
         119,
         118
        ],
        "dx": -34,
        "dy": 10,
        "rot": 6,
        "scale": 1.15,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       }
      }
     }
    },
    "f": {
     "S": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "SE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     }
    }
   }
  },
  "Hunter": {
   "family": "bow",
   "design": "bow_chill",
   "views": {
    "m": {
     "S": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         83,
         126
        ],
        "dx": -23,
        "dy": -17,
        "rot": 0,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       }
      }
     },
     "SE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         125,
         119
        ],
        "dx": -9,
        "dy": -14,
        "rot": 42,
        "scale": 1.3,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         125,
         119
        ],
        "dx": 2,
        "dy": -28,
        "rot": 42,
        "scale": 1.3,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         125,
         119
        ],
        "dx": 1,
        "dy": -34,
        "rot": 28,
        "scale": 1.3,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         125,
         119
        ],
        "dx": -1,
        "dy": -28,
        "rot": 42,
        "scale": 1.3,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         125,
         119
        ],
        "dx": -6,
        "dy": -14,
        "rot": 42,
        "scale": 1.3,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "5": {
        "hand": [
         125,
         119
        ],
        "dx": -6,
        "dy": -14,
        "rot": 42,
        "scale": 1.3,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "6": {
        "hand": [
         125,
         119
        ],
        "dx": -6,
        "dy": -14,
        "rot": 42,
        "scale": 1.3,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "7": {
        "hand": [
         125,
         119
        ],
        "dx": -8,
        "dy": -16,
        "rot": 42,
        "scale": 1.3,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       }
      }
     }
    },
    "f": {
     "S": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "SE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         120,
         119
        ],
        "dx": -14,
        "dy": 0,
        "rot": 238,
        "scale": 1.3,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         120,
         119
        ],
        "dx": -4,
        "dy": -12,
        "rot": 160,
        "scale": 1.3,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         120,
         119
        ],
        "dx": -4,
        "dy": -24,
        "rot": 158,
        "scale": 1.3,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         120,
         119
        ],
        "dx": -2,
        "dy": -24,
        "rot": 160,
        "scale": 1.3,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         120,
         119
        ],
        "dx": -5,
        "dy": -11,
        "rot": 216,
        "scale": 1.3,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "5": {
        "hand": [
         120,
         119
        ],
        "dx": -5,
        "dy": -10,
        "rot": 214,
        "scale": 1.3,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "6": {
        "hand": [
         120,
         119
        ],
        "dx": -4,
        "dy": -9,
        "rot": 210,
        "scale": 1.3,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "7": {
        "hand": [
         120,
         119
        ],
        "dx": -8,
        "dy": -16,
        "rot": 214,
        "scale": 1.3,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       }
      }
     }
    }
   }
  },
  "Assassin": {
   "family": "katar",
   "design": "katar_reinf",
   "views": {
    "m": {
     "S": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         83,
         126
        ],
        "dx": 35,
        "dy": -3,
        "rot": -38,
        "scale": 0.8,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         83,
         126
        ],
        "dx": 37,
        "dy": -5,
        "rot": -38,
        "scale": 0.8,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         83,
         126
        ],
        "dx": 32,
        "dy": -9,
        "rot": -38,
        "scale": 0.65,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         83,
         126
        ],
        "dx": 35,
        "dy": -4,
        "rot": -38,
        "scale": 0.8,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         83,
         126
        ],
        "dx": 35,
        "dy": -3,
        "rot": -38,
        "scale": 0.8,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "5": {
        "hand": [
         83,
         126
        ],
        "dx": 29,
        "dy": -5,
        "rot": -38,
        "scale": 0.8,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "6": {
        "hand": [
         83,
         126
        ],
        "dx": 29,
        "dy": -3,
        "rot": -38,
        "scale": 0.8,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "7": {
        "hand": [
         83,
         126
        ],
        "dx": 32,
        "dy": -1,
        "rot": -38,
        "scale": 0.8,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       }
      }
     },
     "SE": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         118,
         124
        ],
        "dx": -24,
        "dy": 3,
        "rot": -42,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         118,
         124
        ],
        "dx": -27,
        "dy": 3,
        "rot": -42,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         118,
         124
        ],
        "dx": -26,
        "dy": 5,
        "rot": -42,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         118,
         124
        ],
        "dx": -26,
        "dy": 3,
        "rot": -42,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         118,
         124
        ],
        "dx": -23,
        "dy": 2,
        "rot": -42,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "5": {
        "hand": [
         118,
         124
        ],
        "dx": -22,
        "dy": 3,
        "rot": -42,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "6": {
        "hand": [
         118,
         124
        ],
        "dx": -18,
        "dy": 3,
        "rot": -42,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "7": {
        "hand": [
         118,
         124
        ],
        "dx": -23,
        "dy": 2,
        "rot": -42,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       }
      }
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         117,
         117
        ],
        "dx": -14,
        "dy": -24,
        "rot": -128,
        "scale": 1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         117,
         117
        ],
        "dx": 1,
        "dy": -13,
        "rot": -136,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         117,
         117
        ],
        "dx": 4,
        "dy": -10,
        "rot": -62,
        "scale": 1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         117,
         117
        ],
        "dx": -30,
        "dy": 7,
        "rot": 28,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         117,
         117
        ],
        "dx": -32,
        "dy": 7,
        "rot": 26,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "5": {
        "hand": [
         117,
         117
        ],
        "dx": -33,
        "dy": 7,
        "rot": 24,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "6": {
        "hand": [
         117,
         117
        ],
        "dx": -20,
        "dy": 2,
        "rot": -10,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "7": {
        "hand": [
         117,
         117
        ],
        "dx": -20,
        "dy": -1,
        "rot": -10,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       }
      }
     }
    },
    "f": {
     "S": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         83,
         127
        ],
        "dx": 5,
        "dy": -4,
        "rot": -32,
        "scale": 0.9,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         83,
         127
        ],
        "dx": 5,
        "dy": -4,
        "rot": -32,
        "scale": 0.9,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         83,
         127
        ],
        "dx": 5,
        "dy": -3,
        "rot": -32,
        "scale": 0.9,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         83,
         127
        ],
        "dx": 5,
        "dy": -5,
        "rot": -32,
        "scale": 0.9,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         83,
         127
        ],
        "dx": 5,
        "dy": -6,
        "rot": -32,
        "scale": 0.9,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "5": {
        "hand": [
         83,
         127
        ],
        "dx": 5,
        "dy": -4,
        "rot": -32,
        "scale": 0.9,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "6": {
        "hand": [
         83,
         127
        ],
        "dx": 5,
        "dy": -3,
        "rot": -32,
        "scale": 0.9,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "7": {
        "hand": [
         83,
         127
        ],
        "dx": 5,
        "dy": -3,
        "rot": -32,
        "scale": 0.9,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       }
      }
     },
     "SE": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         117,
         125
        ],
        "dx": -24,
        "dy": -6,
        "rot": -46,
        "scale": 0.85,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         117,
         125
        ],
        "dx": -26,
        "dy": -6,
        "rot": -46,
        "scale": 0.85,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         117,
         125
        ],
        "dx": -26,
        "dy": -6,
        "rot": -46,
        "scale": 0.85,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         117,
         125
        ],
        "dx": -24,
        "dy": -4,
        "rot": -46,
        "scale": 0.85,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         117,
         125
        ],
        "dx": -24,
        "dy": -6,
        "rot": -46,
        "scale": 0.85,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "5": {
        "hand": [
         117,
         125
        ],
        "dx": -22,
        "dy": -6,
        "rot": -46,
        "scale": 0.85,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "6": {
        "hand": [
         117,
         125
        ],
        "dx": -21,
        "dy": -4,
        "rot": -46,
        "scale": 0.85,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "7": {
        "hand": [
         117,
         125
        ],
        "dx": -24,
        "dy": -6,
        "rot": -46,
        "scale": 0.85,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       }
      }
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         124,
         118
        ],
        "dx": -43,
        "dy": -6,
        "rot": 46,
        "scale": 0.85,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         124,
         118
        ],
        "dx": -43,
        "dy": -6,
        "rot": 46,
        "scale": 0.85,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         124,
         118
        ],
        "dx": -25,
        "dy": 5,
        "rot": -36,
        "scale": 0.85,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         124,
         118
        ],
        "dx": -8,
        "dy": 13,
        "rot": -44,
        "scale": 0.85,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         124,
         118
        ],
        "dx": -6,
        "dy": 13,
        "rot": -40,
        "scale": 0.85,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "5": {
        "hand": [
         124,
         118
        ],
        "dx": -2,
        "dy": 9,
        "rot": -80,
        "scale": 0.85,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "6": {
        "hand": [
         124,
         118
        ],
        "dx": 17,
        "dy": 4,
        "rot": -40,
        "scale": 0.85,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "7": {
        "hand": [
         124,
         118
        ],
        "dx": 11,
        "dy": 5,
        "rot": -40,
        "scale": 0.85,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       }
      }
     }
    }
   }
  },
  "Priest": {
   "family": "mace",
   "design": "mace_wand",
   "views": {
    "m": {
     "S": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "SE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         122,
         117
        ],
        "dx": -41,
        "dy": -22,
        "rot": 108,
        "scale": 1.1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         122,
         117
        ],
        "dx": -42,
        "dy": -30,
        "rot": 118,
        "scale": 1.1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         122,
         117
        ],
        "dx": 6,
        "dy": -17,
        "rot": 74,
        "scale": 1.1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         122,
         117
        ],
        "dx": 18,
        "dy": -27,
        "rot": -18,
        "scale": 1.1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         122,
         117
        ],
        "dx": 18,
        "dy": -27,
        "rot": -18,
        "scale": 1.1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       }
      }
     }
    },
    "f": {
     "S": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "SE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         120,
         118
        ],
        "dx": -13,
        "dy": 5,
        "rot": 80,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         120,
         118
        ],
        "dx": -8,
        "dy": -1,
        "rot": 80,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         120,
         118
        ],
        "dx": 2,
        "dy": 11,
        "rot": 32,
        "scale": 0.4,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         120,
         118
        ],
        "dx": -13,
        "dy": 5,
        "rot": 80,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         120,
         118
        ],
        "dx": -13,
        "dy": 5,
        "rot": 80,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       }
      }
     }
    }
   }
  },
  "Blacksmith": {
   "family": "axe",
   "design": "axe_single",
   "views": {
    "m": {
     "S": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "SE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         123,
         116
        ],
        "dx": -40,
        "dy": -36,
        "rot": -40,
        "scale": 1.3,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         123,
         116
        ],
        "dx": -40,
        "dy": -36,
        "rot": -40,
        "scale": 1.3,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         123,
         116
        ],
        "dx": -35,
        "dy": -32,
        "rot": -40,
        "scale": 1.3,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         123,
         116
        ],
        "dx": 8,
        "dy": 0,
        "rot": 120,
        "scale": 1.3,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         123,
         116
        ],
        "dx": 8,
        "dy": 0,
        "rot": 108,
        "scale": 1.3,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "5": {
        "hand": [
         123,
         116
        ],
        "dx": 8,
        "dy": 0,
        "rot": 106,
        "scale": 1.3,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "6": {
        "hand": [
         123,
         116
        ],
        "dx": 8,
        "dy": 0,
        "rot": 106,
        "scale": 1.3,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "7": {
        "hand": [
         123,
         116
        ],
        "dx": 8,
        "dy": 0,
        "rot": 106,
        "scale": 1.3,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       }
      }
     }
    },
    "f": {
     "S": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "SE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         122,
         116
        ],
        "dx": -34,
        "dy": -8,
        "rot": 178,
        "scale": 1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         122,
         116
        ],
        "dx": -35,
        "dy": -28,
        "rot": -60,
        "scale": 1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         122,
         116
        ],
        "dx": -31,
        "dy": -24,
        "rot": -50,
        "scale": 1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         122,
         116
        ],
        "dx": 9,
        "dy": 6,
        "rot": 124,
        "scale": 1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "5": {
        "hand": [
         122,
         116
        ],
        "dx": 9,
        "dy": 9,
        "rot": 128,
        "scale": 1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "6": {
        "hand": [
         122,
         116
        ],
        "dx": 11,
        "dy": 10,
        "rot": 132,
        "scale": 1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       }
      }
     }
    }
   }
  },
  "Lord Knight": {
   "family": "sword",
   "design": "sword_elem",
   "views": {
    "m": {
     "S": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "SE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         123,
         118
        ],
        "dx": -45,
        "dy": -4,
        "rot": 28,
        "scale": 1.3,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         123,
         118
        ],
        "dx": -45,
        "dy": -4,
        "rot": 28,
        "scale": 1.3,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         123,
         118
        ],
        "dx": -38,
        "dy": -6,
        "rot": 28,
        "scale": 1.3,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         123,
         118
        ],
        "dx": 44,
        "dy": 10,
        "rot": -62,
        "scale": 1.3,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         123,
         118
        ],
        "dx": 44,
        "dy": 10,
        "rot": -62,
        "scale": 1.3,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       }
      }
     }
    },
    "f": {
     "S": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "SE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         126,
         119
        ],
        "dx": -61,
        "dy": -17,
        "rot": -222,
        "scale": 1.1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         126,
         119
        ],
        "dx": -46,
        "dy": -64,
        "rot": -174,
        "scale": 1.1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         126,
         119
        ],
        "dx": -34,
        "dy": -68,
        "rot": -150,
        "scale": 1.1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         126,
         119
        ],
        "dx": 31,
        "dy": 3,
        "rot": -56,
        "scale": 1.1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         126,
         119
        ],
        "dx": 34,
        "dy": 5,
        "rot": -48,
        "scale": 1.1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       }
      }
     }
    }
   }
  },
  "High Wizard": {
   "family": "staff",
   "design": "staff_shadow",
   "views": {
    "m": {
     "S": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "SE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         119,
         118
        ],
        "dx": 5,
        "dy": -9,
        "rot": 0,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         117,
         111
        ],
        "dx": 0,
        "dy": 0,
        "rot": 0,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         122,
         126
        ],
        "dx": 0,
        "dy": 0,
        "rot": 0,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         83,
         120
        ],
        "dx": 0,
        "dy": 0,
        "rot": 0,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       }
      }
     }
    },
    "f": {
     "S": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         83,
         128
        ],
        "dx": 26,
        "dy": -10,
        "rot": 2,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         83,
         128
        ],
        "dx": 26,
        "dy": -10,
        "rot": 2,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         83,
         128
        ],
        "dx": 26,
        "dy": -6,
        "rot": 2,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         83,
         128
        ],
        "dx": 26,
        "dy": -7,
        "rot": 2,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         83,
         128
        ],
        "dx": 26,
        "dy": -10,
        "rot": 2,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "5": {
        "hand": [
         83,
         128
        ],
        "dx": 26,
        "dy": -10,
        "rot": 2,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "6": {
        "hand": [
         83,
         128
        ],
        "dx": 26,
        "dy": -7,
        "rot": 2,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "7": {
        "hand": [
         83,
         128
        ],
        "dx": 26,
        "dy": -7,
        "rot": 2,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       }
      }
     },
     "SE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         119,
         118
        ],
        "dx": -2,
        "dy": -19,
        "rot": 34,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         119,
         118
        ],
        "dx": -2,
        "dy": -19,
        "rot": 34,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         119,
         118
        ],
        "dx": -5,
        "dy": -19,
        "rot": 46,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         119,
         118
        ],
        "dx": -1,
        "dy": -19,
        "rot": 46,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         119,
         118
        ],
        "dx": -11,
        "dy": 12,
        "rot": 122,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "5": {
        "hand": [
         119,
         118
        ],
        "dx": -11,
        "dy": 12,
        "rot": 122,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "6": {
        "hand": [
         119,
         118
        ],
        "dx": -8,
        "dy": 15,
        "rot": 122,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "7": {
        "hand": [
         119,
         118
        ],
        "dx": -8,
        "dy": 15,
        "rot": 122,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       }
      }
     }
    }
   }
  },
  "Sniper": {
   "family": "bow",
   "design": "bow_thorn",
   "views": {
    "m": {
     "S": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "SE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         122,
         105
        ],
        "dx": -1,
        "dy": -10,
        "rot": -4,
        "scale": 1.3,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         123,
         85
        ],
        "dx": 0,
        "dy": 0,
        "rot": -4,
        "scale": 1.3,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         121,
         80
        ],
        "dx": 0,
        "dy": 0,
        "rot": -4,
        "scale": 1.3,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         130,
         91
        ],
        "dx": 0,
        "dy": 0,
        "rot": -4,
        "scale": 1.3,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         122,
         105
        ],
        "dx": -1,
        "dy": -10,
        "rot": -4,
        "scale": 1.3,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "5": {
        "hand": [
         122,
         105
        ],
        "dx": -1,
        "dy": -10,
        "rot": -4,
        "scale": 1.3,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "6": {
        "hand": [
         122,
         105
        ],
        "dx": -1,
        "dy": -10,
        "rot": -4,
        "scale": 1.3,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "7": {
        "hand": [
         129,
         102
        ],
        "dx": 0,
        "dy": 0,
        "rot": -4,
        "scale": 1.3,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       }
      }
     }
    },
    "f": {
     "S": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "SE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         120,
         120
        ],
        "dx": -7,
        "dy": -7,
        "rot": 16,
        "scale": 1.1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         120,
         120
        ],
        "dx": -1,
        "dy": -15,
        "rot": 16,
        "scale": 1.1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         120,
         120
        ],
        "dx": -2,
        "dy": -29,
        "rot": 16,
        "scale": 1.1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         120,
         120
        ],
        "dx": -2,
        "dy": -30,
        "rot": 16,
        "scale": 1.1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         120,
         120
        ],
        "dx": -6,
        "dy": -17,
        "rot": 16,
        "scale": 1.1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "5": {
        "hand": [
         120,
         120
        ],
        "dx": -9,
        "dy": -15,
        "rot": 16,
        "scale": 1.1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "6": {
        "hand": [
         120,
         120
        ],
        "dx": -9,
        "dy": -15,
        "rot": 16,
        "scale": 1.1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "7": {
        "hand": [
         120,
         120
        ],
        "dx": -5,
        "dy": -16,
        "rot": 16,
        "scale": 1.1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       }
      }
     }
    }
   }
  },
  "Assassin Cross": {
   "family": "katar",
   "design": "katar_guil",
   "views": {
    "m": {
     "S": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         86,
         123
        ],
        "dx": -1,
        "dy": -2,
        "rot": -30,
        "scale": 0.95,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         86,
         123
        ],
        "dx": 0,
        "dy": 0,
        "rot": -30,
        "scale": 0.95,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         86,
         123
        ],
        "dx": 5,
        "dy": 3,
        "rot": -30,
        "scale": 0.95,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         86,
         123
        ],
        "dx": 0,
        "dy": 0,
        "rot": -30,
        "scale": 0.95,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         86,
         123
        ],
        "dx": 0,
        "dy": -3,
        "rot": -30,
        "scale": 0.95,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "5": {
        "hand": [
         86,
         123
        ],
        "dx": 0,
        "dy": -2,
        "rot": -30,
        "scale": 0.95,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "6": {
        "hand": [
         86,
         123
        ],
        "dx": 0,
        "dy": 0,
        "rot": -30,
        "scale": 0.95,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "7": {
        "hand": [
         86,
         123
        ],
        "dx": 0,
        "dy": -3,
        "rot": -30,
        "scale": 0.95,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       }
      }
     },
     "SE": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         89,
         119
        ],
        "dx": 0,
        "dy": 0,
        "rot": -42,
        "scale": 0.95,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         89,
         119
        ],
        "dx": 0,
        "dy": 1,
        "rot": -42,
        "scale": 0.95,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         89,
         119
        ],
        "dx": 1,
        "dy": 4,
        "rot": -42,
        "scale": 0.95,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         89,
         119
        ],
        "dx": -3,
        "dy": 4,
        "rot": -42,
        "scale": 0.95,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         89,
         119
        ],
        "dx": 0,
        "dy": 0,
        "rot": -42,
        "scale": 0.95,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "5": {
        "hand": [
         89,
         119
        ],
        "dx": 4,
        "dy": -2,
        "rot": -42,
        "scale": 0.95,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "6": {
        "hand": [
         89,
         119
        ],
        "dx": 8,
        "dy": -1,
        "rot": -42,
        "scale": 0.95,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "7": {
        "hand": [
         89,
         119
        ],
        "dx": 4,
        "dy": 2,
        "rot": -42,
        "scale": 0.95,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       }
      }
     },
     "NE": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         114,
         117
        ],
        "dx": 0,
        "dy": 0,
        "rot": -40,
        "scale": 0.95,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         111,
         120
        ],
        "dx": 0,
        "dy": 0,
        "rot": -40,
        "scale": 0.95,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         111,
         120
        ],
        "dx": 0,
        "dy": 0,
        "rot": -40,
        "scale": 0.95,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         113,
         120
        ],
        "dx": 0,
        "dy": 0,
        "rot": -40,
        "scale": 0.95,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         115,
         118
        ],
        "dx": 0,
        "dy": 0,
        "rot": -40,
        "scale": 0.95,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "5": {
        "hand": [
         117,
         120
        ],
        "dx": 0,
        "dy": 0,
        "rot": -40,
        "scale": 0.95,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "6": {
        "hand": [
         120,
         119
        ],
        "dx": 0,
        "dy": 0,
        "rot": -54,
        "scale": 0.95,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "7": {
        "hand": [
         117,
         117
        ],
        "dx": 0,
        "dy": 0,
        "rot": -40,
        "scale": 0.95,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       }
      }
     },
     "attack": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         101,
         98
        ],
        "dx": 3,
        "dy": -2,
        "rot": -166,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         101,
         98
        ],
        "dx": 10,
        "dy": 2,
        "rot": -152,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         101,
         98
        ],
        "dx": 15,
        "dy": -1,
        "rot": -156,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         101,
         98
        ],
        "dx": -14,
        "dy": 22,
        "rot": -262,
        "scale": 1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         101,
         98
        ],
        "dx": -16,
        "dy": 22,
        "rot": -258,
        "scale": 1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "5": {
        "hand": [
         101,
         98
        ],
        "dx": -21,
        "dy": 24,
        "rot": -256,
        "scale": 1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "6": {
        "hand": [
         101,
         98
        ],
        "dx": -1,
        "dy": 19,
        "rot": -346,
        "scale": 1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "7": {
        "hand": [
         101,
         98
        ],
        "dx": 4,
        "dy": 17,
        "rot": -12,
        "scale": 1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       }
      }
     }
    },
    "f": {
     "S": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         83,
         128
        ],
        "dx": 6,
        "dy": -13,
        "rot": -30,
        "scale": 0.9,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         83,
         128
        ],
        "dx": 6,
        "dy": -13,
        "rot": -30,
        "scale": 0.9,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         83,
         128
        ],
        "dx": 6,
        "dy": -9,
        "rot": -30,
        "scale": 0.9,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         83,
         128
        ],
        "dx": 6,
        "dy": -13,
        "rot": -30,
        "scale": 0.9,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         83,
         128
        ],
        "dx": 6,
        "dy": -17,
        "rot": -30,
        "scale": 0.9,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "5": {
        "hand": [
         83,
         128
        ],
        "dx": 6,
        "dy": -13,
        "rot": -30,
        "scale": 0.9,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "6": {
        "hand": [
         83,
         128
        ],
        "dx": 6,
        "dy": -8,
        "rot": -30,
        "scale": 0.9,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "7": {
        "hand": [
         83,
         128
        ],
        "dx": 6,
        "dy": -9,
        "rot": -30,
        "scale": 0.9,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       }
      }
     },
     "SE": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         117,
         125
        ],
        "dx": -20,
        "dy": -8,
        "rot": -42,
        "scale": 0.9,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         117,
         125
        ],
        "dx": -20,
        "dy": -8,
        "rot": -42,
        "scale": 0.9,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         117,
         125
        ],
        "dx": -20,
        "dy": -5,
        "rot": -42,
        "scale": 0.9,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         117,
         125
        ],
        "dx": -20,
        "dy": -6,
        "rot": -42,
        "scale": 0.9,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         117,
         125
        ],
        "dx": -20,
        "dy": -8,
        "rot": -42,
        "scale": 0.9,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "5": {
        "hand": [
         117,
         125
        ],
        "dx": -20,
        "dy": -8,
        "rot": -42,
        "scale": 0.9,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "6": {
        "hand": [
         117,
         125
        ],
        "dx": -19,
        "dy": -6,
        "rot": -42,
        "scale": 0.9,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "7": {
        "hand": [
         117,
         125
        ],
        "dx": -19,
        "dy": -6,
        "rot": -42,
        "scale": 0.9,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       }
      }
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         124,
         118
        ],
        "dx": -42,
        "dy": 0,
        "rot": 40,
        "scale": 0.95,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         124,
         118
        ],
        "dx": -43,
        "dy": -1,
        "rot": 40,
        "scale": 0.95,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         124,
         118
        ],
        "dx": -39,
        "dy": 3,
        "rot": 40,
        "scale": 0.95,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         124,
         118
        ],
        "dx": -15,
        "dy": 7,
        "rot": -50,
        "scale": 0.95,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         124,
         118
        ],
        "dx": -15,
        "dy": 7,
        "rot": -50,
        "scale": 0.95,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "5": {
        "hand": [
         124,
         118
        ],
        "dx": -6,
        "dy": -1,
        "rot": -68,
        "scale": 0.95,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "6": {
        "hand": [
         124,
         118
        ],
        "dx": 6,
        "dy": 3,
        "rot": -32,
        "scale": 0.95,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "7": {
        "hand": [
         124,
         118
        ],
        "dx": 6,
        "dy": 3,
        "rot": -32,
        "scale": 0.95,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       }
      }
     }
    }
   }
  },
  "High Priest": {
   "family": "mace",
   "design": "mace_forge",
   "views": {
    "m": {
     "S": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "SE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         121,
         120
        ],
        "dx": -29,
        "dy": -8,
        "rot": -32,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         121,
         120
        ],
        "dx": -43,
        "dy": -26,
        "rot": 132,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         121,
         120
        ],
        "dx": -46,
        "dy": -36,
        "rot": 144,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         121,
         120
        ],
        "dx": 8,
        "dy": -15,
        "rot": 66,
        "scale": 1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       },
       "4": {
        "hand": [
         121,
         120
        ],
        "dx": 9,
        "dy": -24,
        "rot": 84,
        "scale": 1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       }
      }
     },
     "N": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     }
    },
    "f": {
     "S": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "SE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": true,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {
       "0": {
        "hand": [
         117,
         117
        ],
        "dx": -9,
        "dy": 4,
        "rot": 12,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "1": {
        "hand": [
         117,
         117
        ],
        "dx": -29,
        "dy": -6,
        "rot": -32,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "2": {
        "hand": [
         117,
         117
        ],
        "dx": -28,
        "dy": -18,
        "rot": -20,
        "scale": 1,
        "flip": [
         1,
         1
        ],
        "src": "frame"
       },
       "3": {
        "hand": [
         117,
         117
        ],
        "dx": 4,
        "dy": -2,
        "rot": 74,
        "scale": 1,
        "flip": [
         -1,
         1
        ],
        "src": "frame"
       }
      }
     },
     "N": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     }
    }
   }
  },
  "Whitesmith": {
   "family": "axe",
   "design": "axe_chill",
   "views": {
    "m": {
     "S": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "SE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     }
    },
    "f": {
     "S": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "SE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "NE": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     },
     "attack": {
      "weapon": false,
      "blend": true,
      "base": {
       "hand": null,
       "handAuto": true,
       "dx": 0,
       "dy": 0,
       "rot": 0,
       "scale": 1,
       "flip": [
        1,
        1
       ]
      },
      "frames": {}
     }
    }
   }
  }
 }
};
