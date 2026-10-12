// Build separately as gateway/cmd/wardrobe-accessory-proof/main.go.
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
	"strconv"
)

type Item struct {
	Key  string
	View uint32
}

func must(e error) {
	if e != nil {
		panic(e)
	}
}
func main() {
	if len(os.Args) != 5 {
		panic("usage: accessory-proof native-root definitions output job")
	}
	var defs map[string][]Item
	b, err := os.ReadFile(os.Args[2])
	must(err)
	must(json.Unmarshal(b, &defs))
	n, err := strconv.Atoi(os.Args[4])
	must(err)
	job := uint32(n)
	e := engine.New(os.Args[1], resolve.DefaultTables())
	weapon := uint32(2)
	attack := 80
	switch job {
	case 0, 6:
		weapon = 1
	case 2, 9, 4010:
		weapon = 10
	case 4, 5, 8, 4009:
		weapon = 8
	case 10, 4011:
		weapon = 8
		attack = 88
	case 12, 4013:
		weapon = 16
		attack = 88
	case 3:
		weapon = 11
	case 11, 4012:
		weapon = 11
		attack = 88
	}
	for _, sex := range []string{"m", "f"} {
		gender := rotype.Male
		off := attack
		if sex == "f" {
			gender = rotype.Female
			if job == 0 || job == 9 || job == 4010 {
				off = 88
			}
		}
		for slot, items := range defs {
			for _, item := range items {
				for name, action := range map[string]uint{"idle0": 0, "walk2": 10, "attack4": uint(off + 4)} {
					req := engine.Request{Job: job, Gender: gender, Head: 2, HeadPalette: 0, BodyPalette: -1, Weapon: weapon, Action: action, Frame: -1, EnableShadow: true, Canvas: "320x280+160+200"}
					if slot == "backwear" {
						req.Garment = item.View
					} else {
						req.Headgear = []uint32{item.View}
					}
					rendered, err := e.Render(req)
					must(err)
					folder := filepath.Join(os.Args[3], sex, item.Key, name)
					must(os.MkdirAll(folder, 0755))
					for i, img := range rendered.Frames {
						f, err := os.Create(filepath.Join(folder, fmt.Sprintf("%d.png", i)))
						must(err)
						must(png.Encode(f, img.ToNRGBA()))
						must(f.Close())
					}
				}
			}
		}
	}
}
