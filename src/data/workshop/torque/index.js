// Starter torque tables for the Workshop (Workshop → Models → Ready to add),
// one per model page. Research from public sources: every value has its
// source and is added as "Not checked" until a mechanic confirms it on the
// vehicle or in a manual. A value with no source found is left out, not
// guessed. Numbers only, in our own words: nothing copied from paid manuals.
//
// guide_key is the starter_key of the model page the values go on. The bus
// pages come from the Bus library's own starters; a file with a "page" makes
// its model page when there isn't one yet (the workshop's own cars).
import toyotaHiaceH200 from "./toyota-hiace-h200.json";
import nissanNv350E26 from "./nissan-nv350-e26.json";
import bmwX3F25 from "./bmw-x3-f25.json";
import nissanSerenaC23 from "./nissan-serena-c23.json";

export const TORQUE_STARTERS = [toyotaHiaceH200, nissanNv350E26, bmwX3F25, nissanSerenaC23];
