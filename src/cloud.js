import { createClient } from "@supabase/supabase-js";
import publicCloud from "./cloud-config.json";
// Public browser configuration, protected by Supabase RLS; never use a secret key here.
const url = import.meta.env.VITE_SUPABASE_URL?.trim() || publicCloud.url;
const key =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  publicCloud.publishableKey;
export const cloud = url && key ? createClient(url, key) : null;
export async function readCloud() {
  const { data, error } = await cloud
    .from("balances")
    .select("data,revision")
    .single();
  if (error) throw error;
  return data;
}
export async function writeCloud(data, revision) {
  const { data: next, error } = await cloud.rpc("save_balance", {
    payload: data,
    expected_revision: revision,
  });
  if (error) throw error;
  return next;
}
