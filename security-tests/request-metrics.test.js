import {it,expect} from "vitest";
import {load,mock} from "./helpers.js";
it.each(["kioskHeartbeat","driverSession"])("bounds %s telemetry and drops credentials",name=>{
 const handler=load(name,mock(null),["cleanAppHealth"]);
 const result=handler.cleanAppHealth({request_metrics:{requests:7,failed:2,auth_errors:1,server_errors:1,rate_limited:1,functions:[{pin:"PRIVATE"}],card_uid:"PRIVATE",token:"PRIVATE"}});
 expect(result.request_metrics).toEqual({requests:7,failed:2,rate_limited:1,auth_errors:1,server_errors:1});
 expect(JSON.stringify(result)).not.toContain("PRIVATE");
});
