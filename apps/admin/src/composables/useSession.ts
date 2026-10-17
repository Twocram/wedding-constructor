import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/vue-query';
import { useRouter } from 'vue-router';
import { api, unwrap } from '@/lib/api';

// null — не вошли; 401 здесь штатный ответ, а не повод для редиректа из unwrap
export const sessionQuery = {
  queryKey: ['me'] as const,
  queryFn: async () => {
    const { data } = await api.auth.me.get();
    return data?.user ?? null;
  },
  retry: false,
  staleTime: 5 * 60 * 1000,
};

export const loadSession = (client: QueryClient) => client.fetchQuery(sessionQuery).catch(() => null);

export const useSession = () => useQuery(sessionQuery);

export const useLogin = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (credentials: { login: string; password: string }) => unwrap(api.auth.login.post(credentials)),
    onSuccess: (res) => client.setQueryData(sessionQuery.queryKey, res.user),
  });
};

export const useLogout = () => {
  const client = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: () => unwrap(api.auth.logout.post()),
    onSettled: async () => {
      client.clear();
      await router.replace({ name: 'login' });
    },
  });
};
