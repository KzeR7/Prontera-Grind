package main

import (
	"fmt"
	"github.com/ragassets/gateway/internal/render/engine"
	"github.com/ragassets/gateway/internal/render/resolve"
	"github.com/ragassets/gateway/internal/render/rotype"
	"image/png"
	"os"
	"path/filepath"
)

func main() {
	if len(os.Args) != 3 {
		panic("usage: wardrobe-collection-proof native-root output")
	}
	e := engine.New(os.Args[1], resolve.DefaultTables())
	for _, j := range []uint32{0, 2, 9, 4010, 1, 7, 4008, 6, 12, 4013, 3, 11, 4012, 4, 8, 4009, 5, 10, 4011, 4054, 4055, 4059} {
		for _, sex := range []string{"m", "f"} {
			s := rotype.Male
			if sex == "f" {
				s = rotype.Female
			}
			weapon := uint32(2)
			attack := 80
			switch j {
			case 0, 6:
				weapon = 1
			case 2, 9, 4010, 4055:
				weapon = 10
			case 4, 5, 8, 4009:
				weapon = 8
			case 10, 4011:
				weapon = 8
				attack = 88
			case 12, 4013, 4059:
				weapon = 16
				attack = 88
			case 3:
				weapon = 11
			case 11, 4012:
				weapon = 11
				attack = 88
			}
			if sex == "f" && (j == 0 || j == 9 || j == 4010 || j == 4055) {
				attack = 88
			}
			for n, gear := range [][]uint32{{0, 0, 0}, {69, 3, 0}, {2, 12, 56}, {17, 8, 57}, {2, 8, 56}, {17, 3, 57}} {
				garment := uint32(0)
				if n > 0 && n < 4 {
					garment = 1
				}
				o := uint32(0)
				if j == 4054 {
					o = 1
				}
				for _, stance := range []string{"idle", "walk", "attack"} {
					off := 0
					if stance == "walk" {
						off = 8
					}
					if stance == "attack" {
						off = attack
					}
					for d := 0; d < 8; d++ {
						r, err := e.Render(engine.Request{Job: j, Outfit: o, Gender: s, Head: 2, HeadPalette: 0, BodyPalette: -1, Headgear: gear, Garment: garment, Weapon: weapon, Action: uint(off + d), Frame: -1, Canvas: "320x280+160+200", EnableShadow: true})
						if err != nil {
							panic(err)
						}
						folder := filepath.Join(os.Args[2], fmt.Sprintf("%d/%s/%d/%s%d", j, sex, n, stance, d))
						os.MkdirAll(folder, 0755)
						for i, img := range r.Frames {
							f, err := os.Create(filepath.Join(folder, fmt.Sprintf("%d.png", i)))
							if err != nil {
								panic(err)
							}
							if err = png.Encode(f, img.ToNRGBA()); err != nil {
								panic(err)
							}
							f.Close()
						}
					}
				}
			}
		}
		fmt.Println(j)
	}
}
