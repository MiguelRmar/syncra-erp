'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Sparkles,
  Mail,
  Copy,
  Check,
  Send,
  Trash2,
  ExternalLink,
  Plus,
  Globe,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';

interface TenantRow {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
  primary_color: string | null;
  custom_domain: string | null;
  created_at: string;
}

interface AuthorizedOwner {
  email: string;
  company_notes: string | null;
  used_at: string | null;
  created_at: string;
}

export default function SuperAdminCompaniesPage() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [authorizedOwners, setAuthorizedOwners] = useState<AuthorizedOwner[]>([]);
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  const [newOwnerEmail, setNewOwnerEmail] = useState('');
  const [newOwnerNotes, setNewOwnerNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [ownerLoading, setOwnerLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    const loadSuperAdminData = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id, is_super_admin')
        .eq('id', user.id)
        .single();

      if (!profile?.is_super_admin) {
        router.replace('/inventory');
        return;
      }

      setActiveTenantId(profile.tenant_id);

      const [{ data: tenantsData }, { data: ownersData }] = await Promise.all([
        supabase.from('tenants').select('*').order('created_at', { ascending: false }),
        supabase.from('authorized_owners').select('*').order('created_at', { ascending: false }),
      ]);

      if (tenantsData) setTenants(tenantsData as TenantRow[]);
      if (ownersData) setAuthorizedOwners(ownersData as AuthorizedOwner[]);
      setLoading(false);
    };

    loadSuperAdminData();
  }, [router, supabase]);

  const buildOwnerLicenseMessage = (targetEmail: string, notes: string | null) => {
    const appUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/login`
        : 'https://syncra-erp.vercel.app/login';
    const companyRef = notes ? ` (${notes})` : '';
    return `Hola, tu licencia comercial en Syncra ERP${companyRef} ha sido activada.\n\nIngresa aquí con tu correo (${targetEmail}) para registrar y configurar tu empresa:\n${appUrl}`;
  };

  const handleAuthorizeNewOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOwnerEmail.trim()) return;
    setOwnerLoading(true);
    setFeedback(null);

    try {
      const cleanEmail = newOwnerEmail.trim().toLowerCase();
      const { data, error } = await supabase
        .from('authorized_owners')
        .upsert(
          [{ email: cleanEmail, company_notes: newOwnerNotes.trim() || null, used_at: null }],
          { onConflict: 'email' }
        )
        .select()
        .single();

      if (error) throw error;

      setAuthorizedOwners((prev) => [data, ...prev.filter((o) => o.email !== cleanEmail)]);
      setNewOwnerEmail('');
      setNewOwnerNotes('');
      setFeedback({
        type: 'success',
        text: `Licencia B2B habilitada para ${cleanEmail}. En su primer ingreso será dirigido a /onboarding para crear su empresa.`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al autorizar cliente';
      setFeedback({ type: 'error', text: message });
    } finally {
      setOwnerLoading(false);
    }
  };

  const handleRevokeOwner = async (targetEmail: string) => {
    const { error } = await supabase.from('authorized_owners').delete().eq('email', targetEmail);
    if (!error) {
      setAuthorizedOwners((prev) => prev.filter((item) => item.email !== targetEmail));
    }
  };

  const handleEnterTenant = async (tenantId: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('profiles')
      .update({ tenant_id: tenantId })
      .eq('id', user.id);

    if (!error) {
      window.location.href = '/inventory';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-neutral-400">
        <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
        <span className="text-sm">Cargando consola Super Admin...</span>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8">
      {/* Encabezado Super Admin */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-400 mb-2">
            <Sparkles className="h-3.5 w-3.5" />
            Consola Global Super Admin
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Administración de Empresas y Licencias B2B
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Gestiona todas las empresas registradas en Syncra ERP, inspecciona sus espacios de trabajo y otorga nuevas licencias comerciales.
          </p>
        </div>

        <button
          onClick={() => router.push('/onboarding')}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg hover:bg-amber-500 transition shrink-0"
        >
          <Plus className="h-4 w-4" />
          Crear Empresa Manualmente
        </button>
      </div>

      {feedback && (
        <div
          className={`flex items-start gap-2.5 rounded-xl border p-3.5 text-xs ${
            feedback.type === 'error'
              ? 'border-red-500/30 bg-red-500/10 text-red-400'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
          }`}
        >
          {feedback.type === 'error' ? (
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Sección 1: Empresas Activas (Tenants) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-amber-400" />
            Empresas Registradas ({tenants.length})
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tenants.map((t) => {
            const isCurrent = t.id === activeTenantId;
            const color = t.primary_color || '#2563eb';
            return (
              <div
                key={t.id}
                className={`rounded-xl border p-5 flex flex-col justify-between gap-4 transition ${
                  isCurrent
                    ? 'border-amber-500/40 bg-neutral-900/90 shadow-lg'
                    : 'border-neutral-800 bg-neutral-900/40 hover:border-neutral-700'
                }`}
              >
                <div className="flex items-start gap-3.5">
                  {t.logo_url ? (
                    <img
                      src={t.logo_url}
                      alt={t.name}
                      className="h-11 w-11 rounded-xl object-contain bg-neutral-950 border border-neutral-800 p-1 shrink-0"
                    />
                  ) : (
                    <div
                      className="h-11 w-11 rounded-xl flex items-center justify-center font-bold text-white text-sm shrink-0 shadow"
                      style={{ backgroundColor: color }}
                    >
                      {t.name.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white truncate">{t.name}</h3>
                      {isCurrent && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Activa
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] font-mono text-neutral-500 truncate mt-0.5">
                      Slug: {t.slug || 'N/A'}
                    </p>
                    {t.custom_domain && (
                      <p className="text-[11px] font-mono text-blue-400 flex items-center gap-1 mt-1 truncate">
                        <Globe className="h-3 w-3 shrink-0" />
                        {t.custom_domain}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-neutral-800/80 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-3 w-3 rounded-full border border-neutral-700"
                      style={{ backgroundColor: color }}
                    />
                    <span className="font-mono text-[11px] text-neutral-400">{color}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleEnterTenant(t.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700 hover:text-white transition"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {isCurrent ? 'Ir al Inventario' : 'Administrar Empresa'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Sección 2: Autorizar Nuevos Clientes (Licencias B2B para Onboarding) */}
      <section className="space-y-4 pt-4 border-t border-neutral-800">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-400" />
            Otorgar Licencia para Nueva Empresa (Onboarding Cliente)
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Autoriza el correo del dueño de una empresa nueva. Cuando inicie sesión por primera vez, el sistema le pedirá el logo, color y nombre de su empresa en <code>/onboarding</code>.
          </p>
        </div>

        <form
          onSubmit={handleAuthorizeNewOwner}
          className="rounded-xl border border-amber-500/20 bg-neutral-900/60 p-4 sm:p-6 space-y-4"
        >
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-neutral-300">
                Correo del Dueño / Cliente Nuevo
              </label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-neutral-500" />
                <input
                  type="email"
                  required
                  placeholder="gerente@nuevaempresa.com"
                  value={newOwnerEmail}
                  onChange={(e) => setNewOwnerEmail(e.target.value)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 pl-9 pr-3 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:border-amber-500 transition"
                />
              </div>
            </div>

            <div className="flex-1">
              <label className="text-xs font-medium text-neutral-300">
                Nombre de la Empresa (Pre-llenado en Onboarding)
              </label>
              <div className="relative mt-1">
                <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-neutral-500" />
                <input
                  type="text"
                  placeholder="Ej: Miel de la Montaña"
                  value={newOwnerNotes}
                  onChange={(e) => setNewOwnerNotes(e.target.value)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 pl-9 pr-3 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:border-amber-500 transition"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={ownerLoading}
            className="w-full sm:w-auto px-5 py-2.5 rounded-lg text-xs font-bold bg-amber-600 text-white hover:bg-amber-500 transition disabled:opacity-50"
          >
            {ownerLoading ? 'Habilitando licencia...' : '+ Autorizar Nueva Empresa'}
          </button>
        </form>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 overflow-hidden">
          <div className="p-4 border-b border-neutral-800">
            <h3 className="text-sm font-semibold text-white">
              Historial de Licencias Comerciales ({authorizedOwners.length})
            </h3>
          </div>
          <div className="divide-y divide-neutral-800/60">
            {authorizedOwners.length === 0 ? (
              <p className="p-6 text-center text-xs text-neutral-500">
                No hay licencias registradas.
              </p>
            ) : (
              authorizedOwners.map((owner) => (
                <div
                  key={owner.email}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-medium text-white">{owner.email}</p>
                    {owner.company_notes && (
                      <p className="text-xs text-neutral-400">
                        Empresa asignada: <span className="text-neutral-200">{owner.company_notes}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {owner.used_at ? (
                      <span className="inline-flex text-[11px] font-medium px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Empresa Creada
                      </span>
                    ) : (
                      <>
                        <span className="inline-flex text-[11px] font-medium px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          Pendiente de Primer Login
                        </span>

                        <button
                          type="button"
                          onClick={async () => {
                            await navigator.clipboard.writeText(
                              buildOwnerLicenseMessage(owner.email, owner.company_notes)
                            );
                            setCopiedId(owner.email);
                            setTimeout(() => setCopiedId(null), 2000);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-800/80 px-2.5 py-1 text-[11px] font-medium text-neutral-200 hover:bg-neutral-700 transition"
                        >
                          {copiedId === owner.email ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-emerald-400" />
                              Copiado
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5 text-neutral-400" />
                              Copiar Bienvenida
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const subject = encodeURIComponent(
                              'Bienvenido a Syncra ERP - Configura tu Empresa'
                            );
                            const body = encodeURIComponent(
                              buildOwnerLicenseMessage(owner.email, owner.company_notes)
                            );
                            window.open(
                              `mailto:${owner.email}?subject=${subject}&body=${body}`,
                              '_blank'
                            );
                          }}
                          className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-800/80 px-2.5 py-1 text-[11px] font-medium text-neutral-200 hover:bg-neutral-700 transition"
                        >
                          <Send className="h-3.5 w-3.5 text-neutral-400" />
                          Enviar Correo
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRevokeOwner(owner.email)}
                          className="inline-flex items-center justify-center rounded-md border border-red-500/20 bg-red-500/10 p-1 text-red-400 hover:bg-red-500/20 transition"
                          title="Revocar licencia"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

