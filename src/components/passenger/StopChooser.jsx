import React, { useMemo } from "react";
import PickupSelector from "./PickupSelector";
import { sortStops } from "./passengerState";
export default function StopChooser({ routes=[], value, onChoose, userLoc, intro=true, companyName, onConfirmed }) {
 const options=useMemo(()=>routes.flatMap(r=>sortStops(r.stops).map(s=>({...s,route_id:r.id,routeName:r.name}))),[routes]);
 return <div className="px-6 pb-6 lg:px-0"><PickupSelector options={options} routes={routes} value={value} onChoose={onChoose} userLoc={userLoc} intro={intro} companyName={companyName} onConfirmed={onConfirmed} /></div>;
}
