#!/usr/bin/env python3
"""Writes tools/social/emoji-ref-data.json: the authentic RO emotion table used by emoji-review.html.

Two independent sources are merged, because neither alone is enough:

  * roBrowserLegacy src/DB/Emotions.js  -> enum name and the ACTION INDEX inside emotion.spr
                                           (the same file this repo pins in tools/social/emotions-lock.json)
  * iRO Wiki /wiki/Emotes               -> the slash command and the drawn art for new players

Cross-checking them is what proves PR #269's action numbers wrong: the wiki shows /omg next to
Omg.gif while the sprite DB puts ET_HUK (the "/omg" enum) at action 23, not at the PR's 86.

Run:  python3 tools/social/build-emotion-ref.py
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]

# (id, PR-action, real-action, enum, PR-command, real-commands, real-description, art)
#   real-action is the index inside emotion.spr. None = not an RO sprite action at all.
#   art is the iRO Wiki filename, or None when the emote has no RO sprite artwork.
TABLE = [
    ("surprise",     None,  0, "SURPRISE",          "!",     ["!"],                       "Exclamation mark, surprised",      "Exc.gif",  "shipped"),
    ("question",     None,  1, "QUESTION",          "?",     ["?"],                       "Question mark",                    "Que.gif",  "shipped"),
    ("music",        None,  2, "DELIGHT",           "ho",    ["ho", "delight"],           "Music note, whistling",            "Hoe.gif",  "shipped"),
    ("heart",        None,  3, "THROB",             "lv",    ["lv", "heart"],             "Beating heart",                    "Lov.gif",  "shipped"),
    ("love",         None,  4, "BIGTHROB",          "lv2",   ["lv2"],                     "Exploding heart",                  "Lov2.gif", "shipped"),
    ("sweat",        None,  5, "SWEAT",             "swt",   ["swt", "sweat"],            "Anime sweat drop",                 "Swt.gif",  "shipped"),
    ("idea",         None,  6, "AHA",               "ic",    ["ic", "aha"],               "Light bulb",                       "Lit.gif",  "shipped"),
    ("anger",        None,  7, "FRET",              "an",    ["an", "fret"],              "Anger vein",                       "Ang.gif",  "shipped"),
    ("cloud",        None,  8, "ANGER",             "ag",    ["ag", "anger"],             "Storm cloud, frustration",         "Agh.gif",  "shipped"),
    ("money",        None,  9, "MONEY",             "$",     ["$", "money"],              "Dollar sign",                      "Money.gif","shipped"),
    ("dots",         None, 10, "THINK",             "...",   ["..."],                     "Three dots, speechless",           "....gif",  "shipped"),
    ("rock",         None, 11, "ROCK",              "bawi",  ["rock", "bawi"],            "Rock fist (rock-paper-scissors)",  "Emote_bawi.png","shipped"),
    ("scissors",     None, 12, "SCISSOR",           "gawi",  ["scissors", "gawi"],        "Scissors (rock-paper-scissors)",   "Emote_gawi.png","shipped"),
    ("paper",        None, 13, "WRAP",              "bo",    ["paper", "bo"],             "Paper (rock-paper-scissors)",      "Emote_bo.png",  "shipped"),
    ("kiss",         None, 14, "THROB?14",          "kis2",  [],                          "unmapped action 14",               None,       "shipped"),
    ("ok",           None, 15, "THANKS",            "thx",   ["thx"],                     "Thank you!",                       "Thx.gif",  "shipped"),
    ("dead",         None, 16, "KEK",               "desp",  ["desp", "otl"],             "Giving up, stick figure collapsed","Desp.gif", "shipped"),
    ("sorry",        None, 17, "SORRY",             "sry",   ["sry", "sorry"],            "Sorry look",                       "Sry.gif",  "shipped"),
    ("laugh",        None, 18, "SMILE",             "heh",   ["heh", "smile"],            "Laughing face",                    "Heh.gif",  "shipped"),
    ("smile",        None, 22, "STARE_ABOUT",       "ok",    ["??"],                      "Shaking head / looking around",    "Ono.gif",  "shipped"),
    ("cry",          None, 28, "CRY",               "sob",   ["sob"],                     "Crying face",                      "Sob.gif",  "shipped"),
    ("shy",          None, 29, "KIK",               "hum",   ["gg"],                      "Evil giggling face",               "Ggg.gif",  "shipped"),
    ("kissheart",    None, 30, "CHUP",              "kis",   ["kis"],                     "Kiss with a heart, facing right",  "Kis.gif",  "shipped"),
    ("think",        None, 31, "CHUPCHUP",          "hmm",   ["kis2"],                    "Kiss facing left",                 "Kis2.gif", "shipped"),
    ("hmm",          None, 32, "HNG",               "swt2",  ["pif"],                     "A pif, blowing smoke",             "Pif.gif",  "shipped"),
    ("blush",        None, 33, "OK",                "shy",   ["ok"],                      "Head bobbing up and down",         "Ok.gif",   "shipped"),
    ("drool",        None, 38, "MERONG",            "rice",  ["meh", "e4"],               "Flapping tongue, so what?",        "Meh.gif",  "shipped"),
    ("meh",          None, 39, "SHY",               "meh",   ["shy", "e5"],               "Blushing",                         "Shy.gif",  "shipped"),
    ("panic",        None, 44, "COMEON",            "panic", ["com", "e9"],               "Come-here finger",                 "Come.gif", "shipped"),
    ("sleep",        None, 67, "MOBILE",            "yawn",  ["yawn", "e10"],             "Big yawny face",                   "Yawn.gif", "shipped"),
    ("mail",         None, 68, "MAIL",              "mail",  ["mail", "e22"],             "Mail",                             "Mail.gif", "shipped"),
    ("gg",           None, 78, "ENE",               "gg",    ["ene", "e31"],              "\"Blessed\" face",                 "Ene.gif",  "shipped"),

    # ---- PR #269 proposals that ARE real RO emotions, under different action numbers ----
    ("omg",    86, 23, "HUK",           "omg",  ["omg"],                "Shocked face!",                     "Omg.gif",  "new"),
    ("oh",     87, 24, "O",             "oh",   ["oh", "o"],            "Sign with a red circle",            "Ohh.gif",  "new"),
    ("x",      88, 25, "X",             "x",    ["x", "X"],             "Sign with a red X",                 "Ecks.gif", "new"),
    ("hlp",    89, 26, "HELP",          "hlp",  ["hlp", "help"],        "Four Help signs pop above you",     "Hlp.gif",  "new"),
    ("go",     90, 27, "GO",            "go",   ["go"],                 "Explosive Go! sign",                "Goo.gif",  "new"),
    ("sob",    91, 28, "CRY",           "sob",  ["sob"],                "Crying face",                       "Sob.gif",  "new"),
    ("kis",    92, 30, "CHUP",          "kis",  ["kis"],                "Kiss with a heart, facing right",   "Kis.gif",  "new"),
    ("pif",    93, 32, "HNG",           "pif",  ["pif"],                "A pif, blowing smoke",              "Pif.gif",  "new"),
    ("que2",   94, 22, "STARE_ABOUT",   "??",   ["??"],                 "Shaking head, looking around",      "Ono.gif",  "new"),
    ("bzz",    95, 36, "STARE",         "bzz",  ["bzz", "e1"],          "Angry face with an anger vein",     "Bzz.gif",  "new"),
    ("awsm",   96, 38, "COOL",          "awsm", ["awsm", "e3"],         "Eyes popping hearts",               "Awsm.gif", "new"),
    ("pat",    97, 41, "GOODBOY",       "pat",  ["pat", "e6"],          "A hand petting",                    "Pat.gif",  "new"),
    ("mp",     98, 42, "SPTIME",        "mp",   ["mp", "e7"],           "A clock with SP appears",           "Mep.gif",  "new"),
    ("slur",   99, 43, "SEXY",          "slur", ["slur", "e8"],         "A lustful face with drool",         "Slur.gif", "new"),
    ("com",   100, 44, "COMEON",        "com",  ["com", "e9"],          "A finger beckoning you over",       "Come.gif", "new"),
    ("grat",  101, 46, "CONGRATULATION","grat", ["grat", "e11"],        "Glittery Congratulations!",         "Grat.gif", "new"),
    ("hp",    102, 47, "HPTIME",        "hp",   ["hp", "e12"],          "A clock with HP appears",           "Hep.gif",  "new"),
    ("fsh",   103, 52, "SPARK",         "fsh",  ["fsh", "e13"],         "Shiny eyes",                        "Fsh.gif",  "new"),
    ("spin",  104, 53, "CONFUSE",       "spin", ["spin", "e14"],        "Dizzy look with drool",             "Spin.gif", "new"),
    ("sigh",  105, 54, "OHNO",          "sigh", ["sigh", "e15"],        "An exhaling puff",                  "Sigh.gif", "new"),
    ("dum",   106, 55, "HUM",           "dum",  ["dum", "e16"],         "A blank expression, dumbstruck",    "Dum.gif",  "new"),
    ("crwd",  107, 56, "BLABLA",        "crwd", ["crwd", "e17"],        "Expression of loud clamoring",      "Crwd.gif", "new"),
    ("dice",  108, 58, "DICE1",         "dice", ["dice", "e19"],        "A dice roll, 1-6",                  "Dice.gif", "new"),
    ("e20",   109, 65, "LUV",           "e20",  ["e20"],                "A finger pointing upward",          "E20.gif",  "new"),
    ("hum",   110, 74, "HUM2",          "hum",  ["hum", "e27"],         "An annoyed expression",             "Hum.gif",  "new"),
    ("abs",   111, 75, "ABS",           "abs",  ["abs", "e28"],         "A soul leaving the body",           "Abs.gif",  "new"),
    ("oops",  112, 76, "OOPS",          "oops", ["oops", "e29"],        "Eyepopping red face, embarrassed",  "Oops.gif", "new"),
    ("spit",  113, 77, "SPIT",          "spit", ["spit", "e30"],        "A mouth spitting",                  "Spit.gif", "new"),
    ("ene",   114, 78, "ENE",           "ene",  ["ene", "e31"],         "\"Blessed\" face",                  "Ene.gif",  "new"),
    ("whisp", 115, 80, "WHISP",         "whisp",["whisp", "e33"],       "A spinning whisper face",           "Whisp.gif", "new"),
    ("wah",   128, 16, "KEK",           "wah",  ["wah"],                "Crying like a baby / panic",        "Wah.gif",  "new"),
    ("no1",   129, 21, "BEST",          "no1",  ["no1"],                "Thumbs up and a wink",              "No1.gif",  "new"),

    # ---- PR #269 proposals that are NOT Ragnarok Online emotions at all ----
    # These are Ragnarok Online II action emotes (/clap, /bye, /chaos, /happy, /absurd, /joy,
    # /salute...), which have no entry in emotion.spr and no RO1 sprite artwork.
    ("clap",        116, None, None, "clap",        [], "Ragnarok Online II action emote", None, "new"),
    ("bye",         117, None, None, "bye",         [], "Ragnarok Online II action emote", None, "new"),
    ("happy",       118, None, None, "happy",       [], "Ragnarok Online II action emote", None, "new"),
    ("amazed",      119, None, None, "amazed",      [], "not an RO emote",                 None, "new"),
    ("best",        120, None, None, "best",        [], "not an RO emote",                 None, "new"),
    ("best2",       121, None, None, "best2",       [], "not an RO emote",                 None, "new"),
    ("chaos",       122, None, None, "chaos",       [], "Ragnarok Online II action emote", None, "new"),
    ("absurd",      123, None, None, "absurd",      [], "Ragnarok Online II action emote", None, "new"),
    ("joy",         124, None, None, "joy",         [], "Ragnarok Online II action emote", None, "new"),
    ("kiskis",      125, None, None, "kiskis",      [], "not an RO emote",                 None, "new"),
    ("funny",       126, None, None, "funny",       [], "not an RO emote",                 None, "new"),
    ("martialarts", 127, None, None, "martialarts", [], "not an RO emote",                 None, "new"),
    ("salute",      130, None, None, "salute",      [], "Ragnarok Online II action emote", None, "new"),
]


def main():
    rows = []
    for (eid, pr_act, real_act, enum, pr_cmd, real_cmds, desc, art, state) in TABLE:
        rows.append({
            "id": eid,
            "state": state,                    # 'shipped' (32 in the game) or 'new' (PR proposal)
            "prAction": pr_act,                # action the PR claims (new only)
            "action": real_act,                # true index in emotion.spr, None if not an RO emote
            "enum": enum,                      # RO ET_* name
            "prCmd": pr_cmd,
            "cmds": real_cmds,
            "desc": desc,
            "art": art,                        # iRO Wiki filename, None = no RO artwork exists
        })
    out = {
        "_comment": "Generated by tools/social/build-emotion-ref.py - do not edit by hand.",
        "sources": {
            "actionIndex": "roBrowserLegacy src/DB/Emotions.js (emotion.spr action index)",
            "commandsAndArt": "iRO Wiki /wiki/Emotes (irowiki.org/w/images/...)",
            "spriteActionCount": 93,
        },
        "emotions": rows,
    }
    path = ROOT / "tools/social/emoji-ref-data.json"
    path.write_text(json.dumps(out, indent=1) + "\n")
    new = [r for r in rows if r["state"] == "new"]
    real = [r for r in new if r["action"] is not None]
    false_num = [r for r in new if r["action"] is not None and r["prAction"] != r["action"]]
    print(f"{len(rows)} ids ({len(rows)-len(new)} shipped, {len(new)} proposed)")
    print(f"  {len(real)} of {len(new)} proposals are real RO emotions")
    print(f"  {len(false_num)} of those have a WRONG action number in the PR")
    print(f"  {len(new)-len(real)} of {len(new)} are not RO1 emotions at all")
    print(f"wrote {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
