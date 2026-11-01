import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import InventoryClientView from './inventory-client-view';

export default async function InventoryPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, full_name, role')
    .eq('id', user.id)
    .single();

  if (!profile?.tenant_id) {
    redirect('/onboarding');
  }

  const { data: items } = await supabase
    .from('items')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .order('name', { ascending: true });

  return (
    <InventoryClientView
      initialItems={items || []}
      profile={profile}
      userEmail={user.email || ''}
    />
  );
}