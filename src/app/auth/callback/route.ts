import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/inventory';

  if (code) {
    const supabase = await createClient();
    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(
        `${origin}/login?error=oauth_error&reason=${encodeURIComponent(error.message)}`
      );
    }

    if (sessionData.user) {
      const user = sessionData.user;
      const userEmail = (user.email ?? '').toLowerCase();

      // 1. Verificar perfil actual
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id, is_super_admin')
        .eq('id', user.id)
        .single();

      if (profile?.tenant_id) {
        return NextResponse.redirect(`${origin}${next}`);
      }

      // 2. Si no tiene tenant_id, verificar invitación pendiente en tenant_invitations
      if (userEmail) {
        const { data: invitation } = await supabase
          .from('tenant_invitations')
          .select('id, tenant_id, role')
          .eq('email', userEmail)
          .is('accepted_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (invitation) {
          await supabase
            .from('profiles')
            .update({ tenant_id: invitation.tenant_id, role: invitation.role })
            .eq('id', user.id);

          await supabase
            .from('tenant_members')
            .upsert(
              { tenant_id: invitation.tenant_id, user_id: user.id, role: invitation.role },
              { onConflict: 'tenant_id,user_id' }
            );

          await supabase
            .from('tenant_invitations')
            .update({ accepted_at: new Date().toISOString() })
            .eq('id', invitation.id);

          return NextResponse.redirect(`${origin}${next}`);
        }

        // 3. Verificar si es un dueño autorizado (B2B Allowlist o Super Admin)
        const { data: authorizedOwner } = await supabase
          .from('authorized_owners')
          .select('email')
          .eq('email', userEmail)
          .maybeSingle();

        if (profile?.is_super_admin || authorizedOwner) {
          return NextResponse.redirect(`${origin}/onboarding`);
        }
      }

      // 4. Acceso denegado: revocar sesión inmediatamente
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=unauthorized`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth_error`);
}
