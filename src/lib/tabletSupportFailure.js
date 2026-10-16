// No server exception text or signaling is shown here.
export function tabletSupportFailure(code) {
 if(typeof code!=="string" || !/^(PREPARE|PUBLISH|PULSE|OFFER|ANSWER_POLL|STARTED|CAPTURE|ICE_GATHERING|PEER_CONNECT)_(ERROR|TIMEOUT|HTTP_[1-5][0-9]{2})$/.test(code)) return "";
 const stage=code.replace(/_(ERROR|TIMEOUT|HTTP_[1-5][0-9]{2})$/,"");
 const names={PREPARE:"Request verification",PUBLISH:"Video authorization",PULSE:"Authorization recheck",OFFER:"Sending tablet connection details",ANSWER_POLL:"Waiting for the Admin connection",STARTED:"Confirming live viewing",CAPTURE:"Camera or screen startup",ICE_GATHERING:"Finding a network connection",PEER_CONNECT:"Connecting tablet video"};
 const cause=code.endsWith("_TIMEOUT")?"timed out":code.includes("_HTTP_")?"was refused (HTTP "+code.split("_HTTP_")[1]+")":"failed";
 return names[stage]+" "+cause+". Code: "+code;
}
