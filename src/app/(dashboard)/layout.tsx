import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import HeaderBranding from '@/components/header-branding';

interface Tenant {
  id: string;
  name: string;
  logo_url: string | null;
  primary_color: string | null;
}

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { title: 'Syncra ERP' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .single();

  if (!profile?.tenant_id) return { title: 'Syncra ERP' };

  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, logo_url')
    .eq('id', profile.tenant_id)
    .single();

  return {
    title: tenant?.name ? `${tenant.name} | Syncra ERP` : 'Syncra ERP',
    ...(tenant?.logo_url ? { icons: { icon: tenant.logo_url } } : {}),
  };
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
  let tenantId = profile!.tenant_id as string;

  // Validación estricta de Dominio por Empresa (Tenant-Domain Isolation)
  const headersList = await headers();
  const rawHost = (headersList.get('host') ?? '').split(':')[0].toLowerCase();
  const isGenericHost =
    !rawHost ||
    rawHost === 'localhost' ||
    rawHost === 'syncra-erp.vercel.app' ||
    rawHost.endsWith('-miguelrmar.vercel.app');

  if (!isGenericHost) {
    const { data: domainBranding } = await supabase.rpc('get_tenant_branding_by_domain', {
      p_domain: rawHost,
    });

    const domainTenant = Array.isArray(domainBranding) ? domainBranding[0] : null;

    if (domainTenant?.id) {
      if (!profile?.is_super_admin) {
        const { data: membership } = await supabase
          .from('tenant_members')
          .select('tenant_id')
          .eq('user_id', user.id)
          .eq('tenant_id', domainTenant.id)
          .maybeSingle();

        const belongsToDomainTenant =
          Boolean(membership) || profile?.tenant_id === domainTenant.id;

        if (!belongsToDomainTenant) {
          await supabase.auth.signOut();
          redirect('/login?error=wrong_tenant_domain');
        }
      }

      // Si el usuario pertenece a la empresa de este dominio (o es Super Admin), sincronizar su tenant activo
      if (tenantId !== domainTenant.id) {
        await supabase
          .from('profiles')
          .update({ tenant_id: domainTenant.id })
          .eq('id', user.id);
        tenantId = domainTenant.id;
      }
    }
  }

  // Consulta directa a la empresa activa
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name, logo_url, primary_color')
    .eq('id', tenantId)
    .single<Tenant>();

  let userTenants: Tenant[] = [];

  if (profile?.is_super_admin) {
    const { data: allTenantsData } = await supabase
      .from('tenants')
      .select('id, name, logo_url, primary_color')
      .order('created_at', { ascending: false });
    userTenants = (allTenantsData ?? []) as Tenant[];
  } else {
    // Consulta membresías: obtener los tenant_ids del usuario
    const { data: membershipRows } = await supabase
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id);

    const rawTenantIds = membershipRows?.map((m) => m.tenant_id).filter(Boolean) ?? [];
    const tenantIds = rawTenantIds.length > 0 ? rawTenantIds : [tenantId];

    const { data: userTenantsData } = await supabase
      .from('tenants')
      .select('id, name, logo_url, primary_color')
      .in('id', tenantIds);

    userTenants = (userTenantsData ?? []) as Tenant[];
  }

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