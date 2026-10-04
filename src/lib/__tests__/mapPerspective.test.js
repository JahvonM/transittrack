import { describe, it, expect, vi } from "vitest";
import { applyMapPerspective } from "../mapPerspective";
function map() {
 const sources = new Set(["composite"]), layers = new Set();
 return {sources,layers,isStyleLoaded:()=>true,getSource:id=>sources.has(id),getLayer:id=>layers.has(id),getStyle:()=>({layers:[{id:"labels",type:"symbol",layout:{"text-field":"name"}}]}),addSource:vi.fn(id=>sources.add(id)),addLayer:vi.fn(l=>layers.add(l.id)),setTerrain:vi.fn(),setLayoutProperty:vi.fn()};
}
describe("optional map perspective",()=>{
 it("reuses sources and buildings when applying more than once",()=>{const m=map();applyMapPerspective(m,true);applyMapPerspective(m,true);expect(m.addSource).toHaveBeenCalledTimes(1);expect(m.addLayer).toHaveBeenCalledTimes(1);});
 it("2D disables terrain and extrusions while retaining the map",()=>{const m=map();applyMapPerspective(m,true);applyMapPerspective(m,false);expect(m.setTerrain).toHaveBeenLastCalledWith(null);expect(m.setLayoutProperty).toHaveBeenLastCalledWith("tt-buildings","visibility","none");});
 it("reinstalls after a style change removes sources and layers",()=>{const m=map();applyMapPerspective(m,true);m.sources.delete("tt-terrain");m.layers.clear();applyMapPerspective(m,true);expect(m.addSource).toHaveBeenCalledTimes(2);expect(m.addLayer).toHaveBeenCalledTimes(2);});
 it("a missing building source or terrain error cannot break live map",()=>{const m=map();m.sources.clear();applyMapPerspective(m,true);expect(m.addLayer).not.toHaveBeenCalled();m.setTerrain=()=>{throw Error("Unsupported terrain");};expect(()=>applyMapPerspective(m,true)).not.toThrow();});
});
