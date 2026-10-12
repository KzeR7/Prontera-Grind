// Build as gateway/cmd/pet-export/main.go in ragassets at
// 4de4fa747431979d35c747d7edd549a872efd9e1. Original native pixels only.
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"image/png"
	"os"
	"path/filepath"

	"github.com/ragassets/gateway/internal/render/engine"
	"github.com/ragassets/gateway/internal/render/resolve"
)

type Frame struct {
	Image string `json:"image"`
	X int `json:"x"`
	Y int `json:"y"`
}
type Action struct {
	Delay float32 `json:"delay"`
	Frames []Frame `json:"frames"`
}
func must(err error) { if err != nil { panic(err) } }
func main() {
	if len(os.Args) != 3 { panic("usage: pet-export native-root output") }
	e := engine.New(os.Args[1], resolve.DefaultTables())
	for _, id := range []uint32{1002,1063,1013,1106,1019,1155,1101,1096,1113,1031,1007,1056,1057,1014,1170,1109,1180,1582,1120,1115} {
		folder := filepath.Join(os.Args[2], fmt.Sprint(id))
		must(os.MkdirAll(filepath.Join(folder,"images"),0755))
		actions := map[string]Action{}
		for _, stance := range []string{"idle","walk","attack"} {
			base := uint(0); if stance == "walk" { base=8 }; if stance == "attack" { base=16 }
			for direction:=uint(0);direction<8;direction++ {
				rendered,err:=e.Render(engine.Request{Job:id,Action:base+direction,Frame:-1,BodyPalette:-1,HeadPalette:-1,Canvas:"256x256+128+192"})
				must(err); if len(rendered.Frames)==0 { panic("missing native animation") }
				view:=Action{Delay:rendered.IntervalMs,Frames:[]Frame{}}
				for i,frame:=range rendered.Frames {
					box:=frame.OpaqueBounds()
					if box.Empty() || box.Min.X<=0 || box.Min.Y<=0 || box.Max.X>=256 || box.Max.Y>=256 { panic(fmt.Sprintf("clipped/empty %d %s%d frame %d",id,stance,direction,i)) }
					crop:=frame.ToNRGBARect(box);sum:=sha256.New();fmt.Fprintf(sum,"%dx%d:",box.Dx(),box.Dy());sum.Write(crop.Pix);key:=hex.EncodeToString(sum.Sum(nil))
					path:=filepath.Join(folder,"images",key+".png")
					f,err:=os.Create(path);must(err);must(png.Encode(f,crop));must(f.Close())
					// Full renders remain independent proof fixtures for the Python packing audit.
					proof:=filepath.Join(folder,"proof",fmt.Sprintf("%s%d",stance,direction));must(os.MkdirAll(proof,0755))
					f,err=os.Create(filepath.Join(proof,fmt.Sprintf("%d.png",i)));must(err);must(png.Encode(f,frame.ToNRGBA()));must(f.Close())
					view.Frames=append(view.Frames,Frame{key,box.Min.X,box.Min.Y})
				}
				actions[fmt.Sprintf("%s%d",stance,direction)]=view
			}
		}
		data,err:=json.Marshal(actions);must(err);must(os.WriteFile(filepath.Join(folder,"actions.json"),data,0644));fmt.Println(id)
	}
}
