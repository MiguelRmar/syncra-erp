'use client';

import { useState, useEffect, Suspense } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import { LogIn, Layers, ShieldAlert, UserCheck } from 'lucide-react';

interface TenantBranding {
  id: string;
  name: string;
  logo_url: string | null;
  primary_color: string | null;
}

function LoginForm() {
  const [authMode, setAuthMode] = useState<'login' | 'activate'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [branding, setBranding] = useState<TenantBranding | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  useEffect(() => {
    const errorParam = searchParams.get('error');
    const reasonParam = searchParams.get('reason');
    if (errorParam === 'unauthorized') {
      setErrorMsg(
        'Acceso restringido (Beta Privada): Tu correo no cuenta con una invitación activa ni licencia comercial en Syncra ERP.'
      );
    } else if (errorParam === 'wrong_tenant_domain') {
      setErrorMsg(
        'Acceso denegado: Tu cuenta no pertenece a la empresa propietaria de esta URL.'
      );
    } else if (errorParam === 'oauth_error') {
      setErrorMsg(
        reasonParam
          ? `No se pudo completar la autenticación: ${reasonParam}`
          : 'No se pudo completar la autenticación con el proveedor. Si abriste el enlace desde Gmail, ábrelo directamente en tu navegador (Safari o Chrome).'
      );
    }
  }, [searchParams]);

  useEffect(() => {
    const resolveDomainBranding = async () => {
      const host = window.location.hostname;
      if (!host || host === 'localhost' || host === 'syncra-erp.vercel.app') return;

      const { data } = await supabase.rpc('get_tenant_branding_by_domain', {
        p_domain: host,
      });

      if (Array.isArray(data) && data.length > 0) {
        setBranding(data[0]);
      }
    };

    resolveDomainBranding();
  }, [supabase]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    const cleanEmail = email.trim().toLowerCase();

    if (authMode === 'activate') {
      // 1. Verificar en BD si el correo cuenta con invitación o licencia B2B antes de crear contraseña
      const { data: isEligible, error: checkError } = await supabase.rpc(
        'check_email_b2b_eligibility',
        { p_email: cleanEmail }
      );

      if (checkError || !isEligible) {
        setErrorMsg(
          'Acceso restringido (Beta Privada): Este correo no tiene una invitación pendiente ni licencia comercial activa para crear cuenta.'
        );
        setLoading(false);
        return;
      }

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
      });

      if (signUpError) {
        setErrorMsg(
          signUpError.message.includes('already registered')
            ? 'Este correo ya tiene una contraseña registrada. Cambia a la pestaña "Iniciar Sesión".'
            : signUpError.message
        );
        setLoading(false);
        return;
      }

      if (signUpData.user) {
        // Verificar si quedó vinculado por invitación o si es dueño nuevo -> /onboarding
        const { data: authorizedOwner } = await supabase
          .from('authorized_owners')
          .select('email, used_at')
          .eq('email', cleanEmail)
          .maybeSingle();

        if (authorizedOwner && !authorizedOwner.used_at) {
          router.push('/onboarding');
          router.refresh();
          return;
        }

        router.push('/inventory');
        router.refresh();
        return;
      }
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });
    if (error) {
      setErrorMsg(
        error.message.includes('Invalid login credentials')
          ? 'Credenciales inválidas. Si es tu primera vez entrando con invitación, usa la pestaña "Activar Invitación" para crear tu contraseña.'
          : error.message
      );
      setLoading(false);
      return;
    }

    if (data.user) {
      const userEmail = (data.user.email ?? '').toLowerCase();
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id, is_super_admin')
        .eq('id', data.user.id)
        .single();

      if (!profile?.tenant_id) {
        // 1. Si tiene invitación a una empresa existente, vincularlo de inmediato
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
            .eq('id', data.user.id);

          await supabase
            .from('tenant_members')
            .upsert(
              { tenant_id: invitation.tenant_id, user_id: data.user.id, role: invitation.role },
              { onConflict: 'tenant_id,user_id' }
            );

          await supabase
            .from('tenant_invitations')
            .update({ accepted_at: new Date().toISOString() })
            .eq('id', invitation.id);

          router.push('/inventory');
          router.refresh();
          return;
        }

        // 2. Si es un cliente nuevo autorizado para crear empresa -> enviarlo directo a /onboarding
        const { data: authorizedOwner } = await supabase
          .from('authorized_owners')
          .select('email')
          .eq('email', userEmail)
          .maybeSingle();

        if (profile?.is_super_admin || authorizedOwner) {
          router.push('/onboarding');
          router.refresh();
          return;
        }

        // 3. Sin invitación ni licencia
        await supabase.auth.signOut();
        setErrorMsg(
          'Acceso restringido (Beta Privada): Tu correo no cuenta con una invitación activa ni licencia comercial en Syncra ERP.'
        );
        setLoading(false);
        return;
      }
      // Si está entrando por la URL exclusiva de una empresa ya creada, verificar que pertenezca a ella
      if (branding?.id && profile?.tenant_id && !profile?.is_super_admin) {
        if (profile.tenant_id !== branding.id) {
          const { data: membership } = await supabase
            .from('tenant_members')
            .select('tenant_id')
            .eq('user_id', data.user.id)
            .eq('tenant_id', branding.id)
            .maybeSingle();

          if (!membership) {
            await supabase.auth.signOut();
            setErrorMsg(
              `Acceso denegado: Tu cuenta no pertenece a ${branding.name}. Ingresa desde la URL de tu propia empresa.`
            );
            setLoading(false);
            return;
          }
        }
      }
    }

    router.push('/inventory');
    router.refresh();
  };

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-4 font-sans text-neutral-100">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-8 backdrop-blur-xl shadow-2xl">
        <div className="text-center space-y-2">
          {branding?.logo_url ? (
            <img
              src={branding.logo_url}
              alt={branding.name}
              className="mx-auto h-12 w-12 rounded-xl object-contain border border-neutral-800 bg-neutral-900 p-1 mb-2"
            />
          ) : (
            <div
              className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600/10 text-blue-500 border border-blue-500/20 mb-2"
              style={
                branding?.primary_color
                  ? { color: branding.primary_color, borderColor: `${branding.primary_color}40` }
                  : undefined
              }
            >
              <Layers className="h-6 w-6" />
            </div>
          )}
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {branding?.name || 'Syncra ERP'}
          </h1>
          <p className="text-sm text-neutral-400">Acceso a módulo de inventario y producción</p>
        </div>

        {errorMsg && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Selector: Iniciar Sesión vs Activar Invitación (Primer Ingreso con Contraseña) */}
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-neutral-950 p-1 border border-neutral-800">
          <button
            type="button"
            onClick={() => {
              setAuthMode('login');
              setErrorMsg('');
            }}
            className={`rounded-lg py-2 text-xs font-semibold transition ${
              authMode === 'login'
                ? 'bg-neutral-800 text-white shadow'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Iniciar Sesión
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMode('activate');
              setErrorMsg('');
            }}
            className={`rounded-lg py-2 text-xs font-semibold transition ${
              authMode === 'activate'
                ? 'bg-neutral-800 text-white shadow'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Activar Invitación
          </button>
        </div>

        <form onSubmit={handleEmailLogin} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-neutral-300">Correo Autorizado</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@empresa.com"
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800/80 px-3.5 py-2.5 text-sm text-white placeholder-neutral-500 outline-none focus:border-blue-500 transition"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-neutral-300">
              {authMode === 'activate' ? 'Crea tu Contraseña (mín. 6 caracteres)' : 'Contraseña'}
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800/80 px-3.5 py-2.5 text-sm text-white placeholder-neutral-500 outline-none focus:border-blue-500 transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-blue-500 disabled:opacity-50 transition"
          >
            {authMode === 'activate' ? (
              <>
                <UserCheck className="h-4 w-4" />
                {loading ? 'Activando cuenta...' : 'Crear Contraseña e Ingresar'}
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4" />
                {loading ? 'Ingresando...' : 'Iniciar Sesión'}
              </>
            )}
          </button>
        </form>

        <div className="relative my-4 flex items-center justify-center">
          <div className="w-full border-t border-neutral-800" />
          <span className="absolute bg-neutral-900 px-2 text-xs text-neutral-500">o continuar con</span>
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-neutral-700 bg-neutral-800/50 px-4 py-2.5 text-sm font-medium text-neutral-200 hover:bg-neutral-800 transition"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24">
            <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.7 1 4 3.5 2.2 7.1l3.7 2.8C6.8 6.9 9.2 5 12 5z"/>
            <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"/>
            <path fill="#FBBC05" d="M5.9 14.9c-.2-.7-.4-1.5-.4-2.4s.2-1.7.4-2.4L2.2 7.3C1.4 8.8 1 10.4 1 12.5s.4 3.7 1.2 5.2l3.7-2.8z"/>
            <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-2.8 0-5.2-1.9-6.1-4.5L2.2 17.6C4 21.2 7.7 24 12 24z"/>
          </svg>
          Google
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-neutral-950" />}>
      <LoginForm />
    </Suspense>
  );
}
