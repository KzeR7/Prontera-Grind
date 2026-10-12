// Offline extension for ragassets at 4de4fa747431979d35c747d7edd549a872efd9e1.
// Copy into gateway/internal/render/engine to use its native attachment/order logic.
package engine

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"github.com/ragassets/gateway/internal/render/geom"
	"github.com/ragassets/gateway/internal/render/raster"
	"github.com/ragassets/gateway/internal/render/sprite"
	"image/png"
	"os"
	"path/filepath"
)

type WardrobeLayer struct {
	Image string `json:"image"`
	X     int    `json:"x"`
	Y     int    `json:"y"`
	Z     int    `json:"z"`
	Slot  string `json:"slot"`
}
type WardrobeAction struct {
	Delay  float32           `json:"delay"`
	Frames [][]WardrobeLayer `json:"frames"`
}

// ExportWardrobe records whole native component layers, retaining per-frame sort order.
// No guessed attachment offsets, pixel subtraction, or art repainting is used.
func (e *Engine) ExportWardrobe(req Request, folder string, headOnly bool, proof string) (WardrobeAction, error) {
	frame := -1
	ss, interval, err := e.processPlayer(req, e.Plan(req), &frame)
	if err != nil {
		return WardrobeAction{}, err
	}
	if req.EnableShadow {
		if sh := e.shadowSprite(req.Job); sh != nil {
			ss = append(ss, sh)
		}
	}
	parts := map[string]int{}
	for _, s := range ss {
		switch s.Type {
		case sprite.TypePlayerBody:
			parts["body"]++
		case sprite.TypePlayerHead:
			parts["head"]++
		case sprite.TypeWeapon:
			parts["weapon"]++
		case sprite.TypeAccessory:
			parts["accessory"]++
		case sprite.TypeGarment:
			parts["garment"]++
		case sprite.TypeShadow:
			parts["shadow"]++
		}
	}
	weapons := 2
	if req.Weapon == 10 || req.Weapon == 11 || req.Job == 8 || req.Job == 10 || req.Job == 4009 || req.Job == 4011 {
		weapons = 1
	} // Staves, bows and these mace sets have no separate slash component.
	accessories := 0
	for _, id := range req.Headgear {
		if id > 0 {
			accessories++
		}
	}
	garments := 0
	if req.Garment > 0 {
		garments = 1
	}
	for k, n := range map[string]int{"body": 1, "head": 1, "weapon": weapons, "accessory": accessories, "garment": garments, "shadow": 1} {
		if parts[k] != n {
			return WardrobeAction{}, fmt.Errorf("missing native %s: got %d, want %d", k, parts[k], n)
		}
	}
	objects := make([]raster.DrawObject, len(ss))
	maxframes := 0
	for i, s := range ss {
		a := int(req.Action)
		if s.Type == sprite.TypeShadow {
			a = 0
		}
		objects[i] = s.DrawObjectsOfAction(a)
		if len(objects[i].Children) > maxframes {
			maxframes = len(objects[i].Children)
		}
	}
	result := WardrobeAction{Delay: interval * 25, Frames: make([][]WardrobeLayer, maxframes)}
	sort := e.sortDelegate(ss, req, e.imfForJob(req.Job, req.Gender, req.Madogear))
	order := make([]int, len(ss))
	os.MkdirAll(filepath.Join(folder, "images"), 0755)
	for i := 0; i < maxframes; i++ {
		sort(order, i, maxframes)
		result.Frames[i] = []WardrobeLayer{}
		for _, j := range order {
			s := ss[j]
			slot := ""
			switch s.Type {
			case sprite.TypePlayerHead:
				slot = "hair"
			case sprite.TypePlayerBody:
				slot = "body"
			case sprite.TypeWeapon:
				slot = "weapon"
			case sprite.TypeGarment:
				slot = map[uint32]string{1: "wings", 11: "mechanicWings", 15: "blueCupidWings", 18: "angelFeathers", 20: "twilightWings", 42: "ribbonWings", 203: "leticiaWings", 88: "sandalphonWings", 95: "fairyEden", 156: "mysteryWings", 79: "evilScythe"}[req.Garment]
			case sprite.TypeShadow:
				slot = "shadow"
			case sprite.TypeAccessory:
				slot = map[uint32]string{69: "halo", 2: "catEars", 17: "ribbon", 328: "freyaCrown", 338: "umbrellaHat", 475: "classicHat", 559: "redBeret", 642: "blackRibbon", 1012: "aquaBunny", 1070: "foxEars", 3: "glasses", 12: "sunglasses", 8: "mask", 289: "elvenGlasses", 405: "elfEars", 498: "darkElfEars", 710: "phantomMask", 772: "bandagedEye", 779: "heartPatch", 822: "hexGlasses", 56: "flower", 57: "leaf", 814: "orange", 818: "hankie", 861: "strawberry", 884: "chocoStick", 889: "pokerCard", 931: "redPencil", 1025: "frozenRose", 604: "poringLetter"}[s.AccessoryID]
			}
			if slot == "" {
				return result, fmt.Errorf("unexpected part")
			}
			if headOnly != (slot == "hair") {
				continue
			}
			obj, imframe, action, ok := resolveFrame(s, req.Action, i, maxframes, objects[j])
			if !ok {
				continue
			}
			img := raster.NewRawImage(320, 280)
			drawFrameOnImage(&img, s, action, imframe, obj, geom.Vec3{X: -160, Y: -200})
			box := img.OpaqueBounds()
			if box.Empty() {
				continue
			}
			if box.Min.X == 0 || box.Min.Y == 0 || box.Max.X == 320 || box.Max.Y == 280 {
				return result, fmt.Errorf("clipped %s action %d frame %d", slot, req.Action, i)
			}
			crop := img.ToNRGBARect(box)
			sum := sha256.New()
			fmt.Fprintf(sum, "%dx%d:", box.Dx(), box.Dy())
			sum.Write(crop.Pix)
			id := hex.EncodeToString(sum.Sum(nil))
			path := filepath.Join(folder, "images", id+".png")
			if _, err := os.Stat(path); os.IsNotExist(err) {
				f, err := os.Create(path)
				if err != nil {
					return result, err
				}
				err = png.Encode(f, crop)
				f.Close()
				if err != nil {
					return result, err
				}
			}
			result.Frames[i] = append(result.Frames[i], WardrobeLayer{id, box.Min.X, box.Min.Y, s.ZIndex, slot})
		}
	}
	if proof != "" {
		r, err := e.Render(req)
		if err != nil {
			return result, err
		}
		os.MkdirAll(proof, 0755)
		for i, im := range r.Frames {
			f, err := os.Create(filepath.Join(proof, fmt.Sprintf("%d.png", i)))
			if err != nil {
				return result, err
			}
			err = png.Encode(f, im.ToNRGBA())
			f.Close()
			if err != nil {
				return result, err
			}
		}
	}
	return result, nil
}
