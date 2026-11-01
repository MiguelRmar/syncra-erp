import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import HeaderBranding from '@/components/header-branding';

interface Tenant {
  id: string;
  name: string;
  logo_url: string | null;
  primary_color: string | null;
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Consulta el perfil del usuario
  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, full_name, role, is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.tenant_id) {
    const userEmail = (user.email ?? '').toLowerCase();

    // Verificar si es propietario autorizado para crear empresa
    const { data: authorizedOwner } = await supabase
      .from('authorized_owners')
      .select('email')
      .eq('email', userEmail)
      .maybeSingle();

    if (profile?.is_super_admin || authorizedOwner) {
      redirect('/onboarding');
    }

    // Bloqueo de seguridad: usuario sin tenant y sin autorización comercial
    redirect('/login?error=unauthorized');
  }

  // Necesario para que TypeScript entienda que profile no es null después del redirect
  const tenantId = profile!.tenant_id as string;

  // Consulta directa a la empresa activa
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name, logo_url, primary_color')
    .eq('id', tenantId)
    .single<Tenant>();

  // Consulta membresías: obtener los tenant_ids del usuario
  const { data: membershipRows } = await supabase
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', user.id);

  // Fallback: si tenant_members está vacío, al menos incluir el tenant activo del perfil
  const rawTenantIds = membershipRows?.map((m) => m.tenant_id).filter(Boolean) ?? [];
  const tenantIds = rawTenantIds.length > 0
    ? rawTenantIds
    : [tenantId]; // garantiza que el tenant activo siempre aparece

  const { data: userTenantsData } = await supabase
    .from('tenants')
    .select('id, name, logo_url, primary_color')
    .in('id', tenantIds);

  const userTenants: Tenant[] = (userTenantsData ?? []) as Tenant[];

  const brandColor = tenant?.primary_color ?? '#2563eb';

  return (
    <div
      className="min-h-screen w-full bg-neutral-950 text-neutral-100 flex flex-col font-sans"
      style={{ '--brand-color': brandColor } as React.CSSProperties}
    >
      <HeaderBranding
        tenant={tenant ?? null}
        profile={profile}
        userEmail={user.email ?? ''}
        userTenants={userTenants}
      />
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}