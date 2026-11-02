import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function toCleanSubdomain(rawName: string): string {
  return rawName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quitar tildes y diacríticos (ñ -> n, á -> a)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ''); // dejar solo alfanuméricos continuos (ej: mieldelamontana)
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_super_admin) {
      return NextResponse.json({ error: 'Acceso exclusivo Super Admin' }, { status: 403 });
    }

    const body = await request.json();
    const email = (body.email ?? '').trim().toLowerCase();
    const companyName = (body.company_notes ?? '').trim();

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Correo electrónico inválido' }, { status: 400 });
    }

    let provisionedDomain: string | null = null;
    const vercelToken = process.env.VERCEL_AUTOMATION_TOKEN;
    const vercelProjectId = process.env.VERCEL_PROJECT_ID || 'prj_806TzITFboMNhFsLCpSZs8l46LZz';

    if (companyName) {
      const slug = toCleanSubdomain(companyName);
      if (slug.length >= 3) {
        const candidates = [`${slug}.vercel.app`, `${slug}-syncra.vercel.app`];

        if (vercelToken) {
          for (const domainCandidate of candidates) {
            const vercelRes = await fetch(
              `https://api.vercel.com/v10/projects/${vercelProjectId}/domains`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${vercelToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: domainCandidate }),
              }
            );

            const vercelData = await vercelRes.json();
            if (vercelRes.ok || vercelData?.error?.code === 'domain_already_in_use') {
              // Si fue creado o ya pertenecía a nuestro proyecto
              if (vercelRes.ok || vercelData?.error?.projectId === vercelProjectId) {
                provisionedDomain = domainCandidate;
                break;
              }
            }
          }
        } else {
          provisionedDomain = `${slug}.vercel.app`;
        }
      }
    }

    const { data, error } = await supabase
      .from('authorized_owners')
      .upsert(
        [
          {
            email,
            company_notes: companyName || null,
            custom_domain: provisionedDomain,
            used_at: null,
          },
        ],
        { onConflict: 'email' }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      owner: data,
      provisionedDomain,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

