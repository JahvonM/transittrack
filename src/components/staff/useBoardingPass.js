import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { codeQrDataUrl } from "@/lib/qr";
import { errorData } from "@/lib/requestError";

export default function useBoardingPass() {
  const { user } = useAuth();
  const client = useQueryClient();
  const key = ["personal-boarding-pass", user?.id, user?.company_id];
  const query = useQuery({
    queryKey: key, enabled: !!user?.id, retry: false, staleTime: 60000,
    queryFn: async () => {
      const { data } = await base44.functions.invoke("generateOneTimeCode", { action: "boarding_get" });
      return { ...data, qrUrl: await codeQrDataUrl(data.qr_token) };
    },
  });
  const mutation = useMutation({
    mutationFn: code => base44.functions.invoke("generateOneTimeCode", { action: "boarding_set_code", code }),
    onSuccess: ({ data }) => client.setQueryData(key, current => ({ ...current, ...data })),
  });
  const save = async code => {
    try { await mutation.mutateAsync(code); return true; }
    catch { return false; }
  };
  return { pass: query.data, loading: query.isPending, saving: mutation.isPending, save,
    retry: () => query.refetch(),
    problem: query.error ? errorData(query.error).error || "Couldn't load your boarding QR. Please try again." : "",
    saveError: mutation.error ? errorData(mutation.error).error || "Couldn't save your code. Please try again." : "" };
}