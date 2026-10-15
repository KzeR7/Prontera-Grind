// Install as gateway/cmd/fourth-export/main.go in the pinned ragassets checkout.
// This exports the original renderer composition, without wardrobe substitutions.
package main

import (
	"encoding/json"
	"fmt"
	"github.com/ragassets/gateway/internal/render/engine"
	"github.com/ragassets/gateway/internal/render/resolve"
	"github.com/ragassets/gateway/internal/render/rotype"
	"image/png"
	"os"
	"path/filepath"
)

type Class struct {
	Name        string
	Job, Weapon uint32
	Attack      int
}

var classes = []Class{{"Rune Knight", 4054, 2, 80}, {"Warlock", 4055, 10, 80}, {"Ranger", 4056, 11, 88}, {"Guillotine Cross", 4059, 16, 88}, {"Arch Bishop", 4057, 8, 80}, {"Mechanic", 4058, 8, 88}}

func main() {
	if len(os.Args) != 4 || (os.Args[3] != "plan" && os.Args[3] != "render") {
		panic("usage: fourth-export native-root output plan|render")
	}
	e := engine.New(os.Args[1], resolve.DefaultTables())
	keys := map[string]bool{}
	for _, c := range classes {
		for _, sex := range []string{"m", "f"} {
			gender := rotype.Male
			if sex == "f" {
				gender = rotype.Female
			}
			attack := c.Attack
			if sex == "f" && c.Job == 4055 {
				attack = 88
			}
			stances := []string{"idle", "walk", "attack", "cast"}
			if c.Job == 4059 {
				stances = append(stances, "roll")
			}
			for _, stance := range stances {
				off := 0
				if stance == "walk" {
					off = 8
				}
				if stance == "cast" {
					off = 96
				}
				if stance == "roll" {
					off = 88
				}
				if stance == "attack" {
					off = attack
				}
				for d := 0; d < 8; d++ {
					req := engine.Request{Job: c.Job, Gender: gender, Head: 2, HeadPalette: 0, BodyPalette: -1, Weapon: c.Weapon, Action: uint(off + d), Frame: -1, Canvas: "320x280+160+200", EnableShadow: true}
					if os.Args[3] == "plan" {
						for _, key := range e.Plan(req).Keys {
							keys[key] = true
						}
						continue
					}
					r, err := e.Render(req)
					if err != nil {
						panic(err)
					}
					folder := filepath.Join(os.Args[2], fmt.Sprintf("%d/%s/%s%d", c.Job, sex, stance, d))
					if err = os.MkdirAll(folder, 0755); err != nil {
						panic(err)
					}
					for i, im := range r.Frames {
						f, err := os.Create(filepath.Join(folder, fmt.Sprintf("%d.png", i)))
						if err != nil {
							panic(err)
						}
						if err = png.Encode(f, im.ToNRGBA()); err != nil {
							panic(err)
						}
						if err = f.Close(); err != nil {
							panic(err)
						}
					}
					b, err := json.Marshal(map[string]any{"delay": r.IntervalMs * 25, "frames": len(r.Frames), "action": off + d})
					if err != nil {
						panic(err)
					}
					if err = os.WriteFile(filepath.Join(folder, "action.json"), b, 0644); err != nil {
						panic(err)
					}
				}
			}
		}
	}
	if os.Args[3] == "plan" {
		if err := json.NewEncoder(os.Stdout).Encode(keys); err != nil {
			panic(err)
		}
	}
}
