import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import InventoryClientView from './inventory-client-view';

export default async function InventoryPage() {
  const supabase = await createClient();

  // 1. Validar sesión
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  // 2. Traer perfil y datos de la empresa (Marca Blanca)
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, tenants(name, logo_url, primary_color)')
    .eq('id', user.id)
    .single();

  // 3. Traer catálogo de inventario
  const { data: items } = await supabase
    .from('items')
    .select('*')
    .order('name', { ascending: true });

  return (
    <InventoryClientView 
      initialItems={items || []} 
      profile={profile} 
      userEmail={user.email || ''} 
    />
  );
}