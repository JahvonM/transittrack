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
