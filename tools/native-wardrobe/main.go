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
		panic("usage: wardrobe-export source-root catalog.json output [full|proof] [job]")
	}
	root, cat, out := os.Args[1], os.Args[2], os.Args[3]
	proof := os.Getenv("WARDROBE_PROOF") == "1" || (len(os.Args) > 4 && os.Args[4] == "proof")
	job := uint32(4008)
	weapon, attack := uint32(2), 80
	jobArg := 4
	if len(os.Args) > 4 && (os.Args[4] == "proof" || os.Args[4] == "full" || os.Args[4] == "accessories") {
		jobArg = 5
	}
	if len(os.Args) > jobArg {
		n, err := strconv.Atoi(os.Args[jobArg])
		must(err)
		job = uint32(n)
	}
	switch job {
	case 0:
		weapon = 1
	case 2, 9, 4010, 4055:
		weapon = 10
	case 4, 5, 8, 4009:
		weapon = 8
	case 10, 4011:
		weapon = 8
		attack = 88
	case 6:
		weapon = 1
	case 12, 4013, 4059:
		weapon = 16
		attack = 88
	case 3:
		weapon = 11
	case 11, 4012:
		weapon = 11
		attack = 88
	}
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
		sexAttack := attack
		if sex == "f" && (job == 0 || job == 9 || job == 4010 || job == 4055) {
			sexAttack = 88
		}
		styles := catalog.Hairs[sex]
		if proof || (len(os.Args) > 4 && os.Args[4] == "accessories") {
			styles = []uint32{2}
		}
		for _, head := range styles {
			for pal := 0; pal < 9; pal++ {
				if (proof || (len(os.Args) > 4 && os.Args[4] == "accessories")) && pal > 0 {
					break
				}
				req := engine.Request{Job: job, Gender: g, Head: head, HeadPalette: pal, BodyPalette: -1, Headgear: []uint32{69, 3}, Garment: 1, Weapon: weapon, Frame: -1, HeadDir: rotype.Straight, EnableShadow: true, Canvas: "320x280+160+200"}
				if job == 4054 {
					req.Outfit = 1
				}
				hair := map[string]engine.WardrobeAction{}
				base := map[string]engine.WardrobeAction{}
				for _, stance := range []string{"idle", "walk", "attack"} {
					offset := 0
					if stance == "walk" {
						offset = 8
					}
					if stance == "attack" {
						offset = sexAttack
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
							// Export alternative pieces with the renderer's own attachments and order.
							// Their pixels are bundled once; only one piece per slot is drawn at runtime.
							for _, id := range []uint32{2, 17, 12, 8, 56, 57} {
								variant := req
								variant.Headgear = []uint32{id}
								variant.Garment = 0
								extra, err := e.ExportWardrobe(variant, out, false, "")
								must(err)
								current := base[key]
								if len(extra.Frames) != len(current.Frames) || extra.Delay != current.Delay {
									panic("accessory changed native timeline")
								}
								for i, frame := range extra.Frames {
									for _, layer := range frame {
										if layer.Slot != "body" && layer.Slot != "weapon" && layer.Slot != "shadow" {
											current.Frames[i] = append(current.Frames[i], layer)
										}
									}
								}
								base[key] = current
							}
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
