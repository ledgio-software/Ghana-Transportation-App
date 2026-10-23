// "Delete my account" (Act 843 rights, P1-LEGAL). Deleting the auth user cascades to every
// personal table; crowd reports keep their fare data but lose the link to the user.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: cors });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('unauthorized', { status: 401, headers: cors });

  const url = Deno.env.get('SUPABASE_URL')!;
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return new Response('unauthorized', { status: 401, headers: cors });

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id);
  if (deleteError) {
    console.error('delete-account failed', deleteError.message);
    return new Response('could not delete account', { status: 500, headers: cors });
  }
  return new Response(JSON.stringify({ deleted: true }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
