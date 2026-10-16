// Build as gateway/cmd/wardrobe-accessories/main.go in the pinned native renderer.
package main

import (
	"encoding/json"
	"fmt"
	"github.com/ragassets/gateway/internal/render/engine"
	"github.com/ragassets/gateway/internal/render/resolve"
	"github.com/ragassets/gateway/internal/render/rotype"
	"os"
	"path/filepath"
	"strconv"
)

type Item struct {
	Key   string
	View  uint32
	Clock string
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}
func main() {
	if len(os.Args) != 5 {
		panic("usage: wardrobe-accessories native-root accessories.json output job")
	}
	var defs map[string][]Item
	b, err := os.ReadFile(os.Args[2])
	must(err)
	must(json.Unmarshal(b, &defs))
	j, err := strconv.Atoi(os.Args[4])
	must(err)
	job := uint32(j)
	e := engine.New(os.Args[1], resolve.DefaultTables())
	out := os.Args[3]
	must(os.MkdirAll(out, 0755))
	weapon := uint32(2)
	attack := 80
	switch job {
	case 0, 6:
		weapon = 1
	case 2, 9, 4010, 4055:
		weapon = 10
	case 4, 5, 8, 4009, 4057:
		weapon = 8
	case 10, 4011, 4058:
		weapon = 8
		attack = 88
	case 12, 4013, 4059:
		weapon = 16
		attack = 88
	case 3:
		weapon = 11
	case 11, 4012, 4056:
		weapon = 11
		attack = 88
	}
	for _, sex := range []string{"m", "f"} {
		g := rotype.Male
		offset := attack
		if sex == "f" {
			g = rotype.Female
			if job == 0 || job == 9 || job == 4010 || job == 4055 {
				offset = 88
			}
		}
		for _, slot := range []string{"headwear", "facewear", "mouthwear", "backwear"} {
			for _, item := range defs[slot] {
				if item.Clock == "independent" {
					continue
				} // STR effects have a separate exporter.
				req := engine.Request{Job: job, Gender: g, Head: 2, HeadPalette: 0, BodyPalette: -1, Weapon: weapon, Frame: -1, HeadDir: rotype.Straight, EnableShadow: true, Canvas: "320x280+160+200"}
				if slot == "backwear" {
					req.Garment = item.View
				} else {
					req.Headgear = []uint32{item.View}
				}
				actions := map[string]engine.WardrobeAction{}
				visible := false
				for _, stance := range []string{"idle", "walk", "attack"} {
					action := 0
					if stance == "walk" {
						action = 8
					}
					if stance == "attack" {
						action = offset
					}
					for d := 0; d < 8; d++ {
						req.Action = uint(action + d)
						full, err := e.ExportWardrobe(req, out, false, "")
						if err != nil {
							panic(fmt.Sprintf("job %d sex %s piece %s: %v", job, sex, item.Key, err))
						}
						for i, frame := range full.Frames {
							selected := []engine.WardrobeLayer{}
							for _, layer := range frame {
								if layer.Slot == item.Key {
									selected = append(selected, layer)
									visible = true
								}
							}
							full.Frames[i] = selected
						}
						actions[stance+strconv.Itoa(d)] = full
					}
				}
				if !visible {
					panic("invisible accessory: " + item.Key)
				}
				b, err = json.Marshal(actions)
				must(err)
				must(os.WriteFile(filepath.Join(out, item.Key+"-"+sex+".json"), b, 0644))
				fmt.Println(job, sex, item.Key)
			}
		}
	}
}
