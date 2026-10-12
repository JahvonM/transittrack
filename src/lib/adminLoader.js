export function adminLoadProblem(errors) {
 const statuses=errors.map(e=>e?.status ?? e?.response?.status ?? e?.originalError?.response?.status);
 if(statuses.includes(401))return {title:"Sign-in needs checking",description:"The server refused your sign-in. Try again to check your session."};
 if(statuses.includes(403))return {title:"Admin access was refused",description:"The server refused this request. Try again; if it continues, check this account’s admin access."};
 if(statuses.includes(429))return {title:"Server is busy",description:"The server reached its request limit. Wait a moment, then try again. Saved information is kept."};
 if(statuses.some(s=>s>=500))return {title:"Server couldn't load admin data",description:"The server returned an error. Try again shortly. Saved information is kept."};
 return {title:"Couldn't connect to admin data",description:"Check your connection, then try again. Saved information is kept."};
}
