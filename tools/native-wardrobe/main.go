// Run from pinned ragassets gateway/cmd/wardrobe-export (see README).
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

func must(err error) {
	if err != nil {
		panic(err)
	}
}
func main() {
	if len(os.Args) < 4 {
		panic("usage: wardrobe-export source-root catalog.json output [proof]")
	}
	root, cat, out := os.Args[1], os.Args[2], os.Args[3]
	proof := len(os.Args) > 4
	var catalog struct{ Hairs map[string][]uint32 }
	b, err := os.ReadFile(cat)
	must(err)
	must(json.Unmarshal(b, &catalog))
	e := engine.New(root, resolve.DefaultTables())
	os.MkdirAll(out, 0755)
	for _, sex := range []string{"m", "f"} {
		g := rotype.Male
		if sex == "f" {
			g = rotype.Female
		}
		styles := catalog.Hairs[sex]
		if proof {
			styles = []uint32{2}
		}
		for _, head := range styles {
			for pal := 0; pal < 9; pal++ {
				if proof && pal > 0 {
					break
				}
				req := engine.Request{Job: 4008, Gender: g, Head: head, HeadPalette: pal, BodyPalette: -1, Headgear: []uint32{69, 3}, Garment: 1, Weapon: 2, Frame: -1, HeadDir: rotype.Straight, EnableShadow: true, Canvas: "320x280+160+200"}
				hair := map[string]engine.WardrobeAction{}
				base := map[string]engine.WardrobeAction{}
				for _, stance := range []string{"idle", "walk", "attack"} {
					offset := 0
					if stance == "walk" {
						offset = 8
					}
					if stance == "attack" {
						offset = 80
					}
					for d := 0; d < 8; d++ {
						key := stance + strconv.Itoa(d)
						req.Action = uint(offset + d)
						hair[key], err = e.ExportWardrobe(req, out, true, "")
						must(err)
						if head == 2 && pal == 0 {
							p := ""
							if proof {
								p = filepath.Join(out, "proof", sex, key)
							}
							base[key], err = e.ExportWardrobe(req, out, false, p)
							must(err)
							if proof {
								for mask := 0; mask < 8; mask++ {
									variant := req
									variant.Headgear = []uint32{0, 0}
									variant.Garment = 0
									if mask&1 != 0 {
										variant.Headgear[0] = 69
									}
									if mask&2 != 0 {
										variant.Headgear[1] = 3
									}
									if mask&4 != 0 {
										variant.Garment = 1
									}
									res, err := e.Render(variant)
									must(err)
									folder := filepath.Join(out, "variants", sex, key, strconv.Itoa(mask))
									must(os.MkdirAll(folder, 0755))
									for i, img := range res.Frames {
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
				b, err = json.Marshal(hair)
				must(err)
				must(os.WriteFile(filepath.Join(out, fmt.Sprintf("hair-%s-%d-%d.json", sex, head, pal)), b, 0644))
				if len(base) > 0 {
					b, err = json.Marshal(base)
					must(err)
					must(os.WriteFile(filepath.Join(out, "base-"+sex+".json"), b, 0644))
				}
				fmt.Printf("exported %s %d %d\n", sex, head, pal)
			}
		}
	}
}
