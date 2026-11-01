import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { withRateLimitRetry } from "@/lib/scopedEntities";
import { errorData } from "@/lib/requestError";
export default function usePassengerAccount(user, companyId, enabled) {
 const client=useQueryClient(), key=["passenger-account",user?.id,companyId];
 const query=useQuery({queryKey:key,enabled:!!enabled && !!user?.id && !!companyId,staleTime:60000,retry:false,
  queryFn:()=>withRateLimitRetry(()=>base44.functions.invoke("passengerAccount",{action:"summary"}),{attempts:3}).then(r=>r.data)});
 const lost=useMutation({mutationFn:()=>base44.functions.invoke("passengerAccount",{action:"report_lost_card"}),
  onSuccess:()=>client.invalidateQueries({queryKey:key})});
 return {summary:query.data,loading:query.isPending,error:query.error?errorData(query.error).error || "Couldn't load your card details.":"",retry:query.refetch,
  reportLost:()=>lost.mutateAsync(),reporting:lost.isPending};
}

// My rides: the passenger's own boardings and exits from the last 60 days.
export function usePassengerRides(user, companyId, enabled) {
 const query=useQuery({queryKey:["passenger-rides",user?.id,companyId],enabled:!!enabled && !!user?.id && !!companyId,staleTime:60000,retry:false,
  queryFn:()=>withRateLimitRetry(()=>base44.functions.invoke("passengerAccount",{action:"rides"}),{attempts:3}).then(r=>r.data?.events || [])});
 return {events:query.data || [],loading:query.isPending,error:query.error?errorData(query.error).error || "Couldn't load your rides.":"",retry:query.refetch};
}

// Today's own taps, for the Home journey (boarded, on board, got off). Polls
// gently while the screen is open and checks again when the phone comes back.
export function usePassengerToday(user, companyId, enabled) {
 const query=useQuery({queryKey:["passenger-today",user?.id,companyId],enabled:!!enabled && !!user?.id && !!companyId,staleTime:20000,retry:false,
  refetchInterval:()=>typeof document!=="undefined" && document.visibilityState==="hidden"?false:45000,refetchOnWindowFocus:true,
  queryFn:()=>base44.functions.invoke("passengerAccount",{action:"today"}).then(r=>r.data?.events || [])});
 return {events:query.data || [],known:query.isSuccess,error:query.isError};
}

// The passenger's requests and support cases (with lost item reports).
export function usePassengerCases(user, companyId, enabled) {
 const client=useQueryClient(), key=["passenger-cases",user?.id,companyId];
 const query=useQuery({queryKey:key,enabled:!!enabled && !!user?.id && !!companyId,staleTime:30000,retry:false,refetchOnWindowFocus:true,
  queryFn:()=>withRateLimitRetry(()=>base44.functions.invoke("passengerCases",{action:"mine"}),{attempts:2}).then(r=>({cases:r.data?.cases || [],pattern:r.data?.pattern || null}))});
 const send=useMutation({mutationFn:(body)=>base44.functions.invoke("passengerCases",body).then(r=>r.data),onSuccess:()=>client.invalidateQueries({queryKey:key})});
 const cases=query.data?.cases || [];
 // Regular days off the office approved (null if none).
 return {cases,pattern:query.data?.pattern || null,loading:query.isPending,error:query.error?errorData(query.error).error || "Couldn't load your requests.":"",retry:query.refetch,
  send:(body)=>send.mutateAsync(body),sending:send.isPending,unread:cases.filter(c=>c.unread).length};
}
