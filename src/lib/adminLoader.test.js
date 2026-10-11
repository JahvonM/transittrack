import {it,expect} from "vitest";
import {adminLoadProblem} from "./adminLoader";
it.each([[429,"Server is busy"],[401,"Sign-in needs checking"],[403,"Admin access was refused"],[503,"Server couldn't load admin data"]])("explains HTTP %s", (status,title)=>{
 expect(adminLoadProblem([{originalError:{response:{status}}}]).title).toBe(title);
});
