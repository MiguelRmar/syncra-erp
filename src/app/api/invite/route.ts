import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const email = (body.email ?? '').trim().toLowerCase();
    const role = body.role === 'admin' ? 'admin' : 'operator';

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Correo electrónico inválido' }, { status: 400 });
    }

    // Obtener empresa activa y validar permisos del usuario que invita
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('tenant_id, role, is_super_admin')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.tenant_id) {
      return NextResponse.json(
        { error: 'No se encontró una empresa asociada a tu usuario' },
        { status: 400 }
      );
    }

    // Registrar la invitación en tenant_invitations
    const { data: invitation, error: insertError } = await supabase
      .from('tenant_invitations')
      .insert([
        {
          tenant_id: profile.tenant_id,
          email,
          role,
          invited_by: user.id,
        },
      ])
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    // Intentar envío automático por correo vía Supabase Admin Auth si SUPABASE_SERVICE_ROLE_KEY está configurada
    let emailSent = false;
    let emailNote = '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (serviceRoleKey && supabaseUrl) {
      const supabaseAdmin = createSupabaseAdmin(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const origin = new URL(request.url).origin;
      const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${origin}/auth/callback`,
        data: {
          invited_tenant_id: profile.tenant_id,
          invited_role: role,
        },
      });

      if (!inviteError) {
        emailSent = true;
      } else {
        emailNote = inviteError.message;
      }
    }

    return NextResponse.json({
      invitation,
      emailSent,
      emailNote,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

