'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Mail, Shield, Copy, Check, Send, Trash2, CheckCircle2, AlertCircle, Building2, Sparkles } from 'lucide-react';

interface Invitation {
  id: string;
  email: string;
  role: string;
  accepted_at: string | null;
  created_at: string;
}

interface AuthorizedOwner {
  email: string;
  company_notes: string | null;
  custom_domain?: string | null;
  used_at: string | null;
  created_at: string;
}

export default function TeamPage() {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('operator');
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [tenantName, setTenantName] = useState('Syncra ERP');
  const [tenantCustomDomain, setTenantCustomDomain] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [authorizedOwners, setAuthorizedOwners] = useState<AuthorizedOwner[]>([]);
  const [newOwnerEmail, setNewOwnerEmail] = useState('');
  const [newOwnerNotes, setNewOwnerNotes] = useState('');
  const [ownerLoading, setOwnerLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);
  const supabase = createClient();

  useEffect(() => {
    loadInvitations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadInvitations = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id, is_super_admin')
      .eq('id', user.id)
      .single();

    if (profile?.is_super_admin) {
      setIsSuperAdmin(true);
      const { data: ownersData } = await supabase
        .from('authorized_owners')
        .select('*')
        .order('created_at', { ascending: false });
      if (ownersData) setAuthorizedOwners(ownersData);
    }

    if (profile?.tenant_id) {
      const [{ data: invData }, { data: tenantData }] = await Promise.all([
        supabase
          .from('tenant_invitations')
          .select('*')
          .eq('tenant_id', profile.tenant_id)
          .order('created_at', { ascending: false }),
        supabase
          .from('tenants')
          .select('name, custom_domain')
          .eq('id', profile.tenant_id)
          .single(),
      ]);

      if (invData) setInvitations(invData);
      if (tenantData?.name) setTenantName(tenantData.name);
      if (tenantData?.custom_domain) setTenantCustomDomain(tenantData.custom_domain);
    }
  };

  const getRoleLabel = (r: string) => (r === 'admin' ? 'Administrador' : 'Operario');

  const buildInviteMessage = (targetEmail: string, targetRole: string) => {
    const appUrl = tenantCustomDomain
      ? `https://${tenantCustomDomain}/login`
      : typeof window !== 'undefined'
      ? `${window.location.origin}/login`
      : 'https://syncra-erp.vercel.app/login';
    return `Hola, has sido autorizado para unirte a ${tenantName} en Syncra ERP con el rol de ${getRoleLabel(targetRole)}.\n\nIngresa aquí usando tu correo (${targetEmail}):\n${appUrl}`;
  };

  const handleCopyInvite = async (inv: Invitation) => {
    const text = buildInviteMessage(inv.email, inv.role);
    await navigator.clipboard.writeText(text);
    setCopiedId(inv.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleMailto = (inv: Invitation) => {
    const subject = encodeURIComponent(`Invitación a ${tenantName} en Syncra ERP`);
    const body = encodeURIComponent(buildInviteMessage(inv.email, inv.role));
    window.open(`mailto:${inv.email}?subject=${subject}&body=${body}`, '_blank');
  };

  const handleRevokeInvitation = async (id: string) => {
    const { error } = await supabase.from('tenant_invitations').delete().eq('id', id);
    if (!error) {
      setInvitations((prev) => prev.filter((item) => item.id !== id));
    }
  };

  const buildOwnerLicenseMessage = (owner: AuthorizedOwner) => {
    const appUrl = owner.custom_domain
      ? `https://${owner.custom_domain}/login`
      : typeof window !== 'undefined'
      ? `${window.location.origin}/login`
      : 'https://syncra-erp.vercel.app/login';
    const companyRef = owner.company_notes ? ` (${owner.company_notes})` : '';
    return `Hola, tu licencia comercial en Syncra ERP${companyRef} ha sido activada.\n\nIngresa a tu portal exclusivo aquí con tu correo (${owner.email}):\n${appUrl}`;
  };

  const handleAuthorizeNewOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOwnerEmail.trim()) return;
    setOwnerLoading(true);
    setFeedback(null);

    try {
      const cleanEmail = newOwnerEmail.trim().toLowerCase();
      const response = await fetch('/api/admin/authorize-owner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          company_notes: newOwnerNotes.trim(),
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Error al autorizar cliente');

      const data: AuthorizedOwner = result.owner;
      setAuthorizedOwners((prev) => [
        data,
        ...prev.filter((o) => o.email !== cleanEmail),
      ]);
      setNewOwnerEmail('');
      setNewOwnerNotes('');
      setFeedback({
        type: 'success',
        text: data.custom_domain
          ? `¡Licencia y URL creadas! Se aprovisionó https://${data.custom_domain} para ${cleanEmail}.`
          : `Licencia para nueva empresa habilitada para ${cleanEmail}.`,
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

  const handleSendInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setFeedback(null);

    try {
      const response = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), role }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Error al crear la invitación');
      }

      setInvitations((prev) => [result.invitation, ...prev]);
      setEmail('');

      if (result.emailSent) {
        setFeedback({
          type: 'success',
          text: `Acceso habilitado y correo de invitación enviado automáticamente a ${result.invitation.email}.`,
        });
      } else {
        setFeedback({
          type: 'info',
          text: `Acceso habilitado para ${result.invitation.email}. Puedes copiar el mensaje de invitación o enviarlo con un clic desde la lista inferior.`,
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error inesperado';
      setFeedback({ type: 'error', text: message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">Equipo e Invitaciones</h1>
        <p className="text-xs text-neutral-400">
          Invita a tus colaboradores por correo. Al registrarse o iniciar sesión con Google entrarán directo a esta empresa.
        </p>
      </div>

      {feedback && (
        <div
          className={`flex items-start gap-2.5 rounded-xl border p-3.5 text-xs ${
            feedback.type === 'error'
              ? 'border-red-500/30 bg-red-500/10 text-red-400'
              : feedback.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-blue-500/30 bg-blue-500/10 text-blue-300'
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

      <form onSubmit={handleSendInvitation} className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="text-xs font-medium text-neutral-300">Correo Electrónico del Colaborador</label>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-neutral-500" />
              <input
                type="email"
                required
                placeholder="empleado@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 pl-9 pr-3 py-2 text-sm text-white placeholder-neutral-500 outline-none focus:border-blue-500 transition"
              />
            </div>
          </div>

          <div className="w-full sm:w-44">
            <label className="text-xs font-medium text-neutral-300">Rol Asignado</label>
            <div className="relative mt-1">
              <Shield className="absolute left-3 top-2.5 h-4 w-4 text-neutral-500" />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-blue-500 transition"
              >
                <option value="operator">Operario</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{ backgroundColor: 'var(--brand-color, #2563eb)' }}
          className="w-full sm:w-auto px-5 py-2.5 rounded-lg text-xs font-bold text-white hover:opacity-90 transition disabled:opacity-50"
        >
          {loading ? 'Generando...' : '+ Enviar / Habilitar Acceso'}
        </button>
      </form>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 overflow-hidden">
        <div className="p-4 border-b border-neutral-800">
          <h2 className="text-sm font-semibold text-white">Invitaciones Pendientes / Activas</h2>
        </div>
        <div className="divide-y divide-neutral-800/60">
          {invitations.length === 0 ? (
            <p className="p-6 text-center text-xs text-neutral-500">No hay invitaciones registradas.</p>
          ) : (
            invitations.map((inv) => (
              <div key={inv.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">{inv.email}</p>
                  <p className="text-xs text-neutral-400">
                    Rol: <span className="text-neutral-200">{getRoleLabel(inv.role)}</span>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {inv.accepted_at ? (
                    <span className="inline-flex text-[11px] font-medium px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Aceptada / Vinculado
                    </span>
                  ) : (
                    <>
                      <span className="inline-flex text-[11px] font-medium px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        Pendiente de ingreso
                      </span>

                      <button
                        type="button"
                        onClick={() => handleCopyInvite(inv)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-800/80 px-2.5 py-1 text-[11px] font-medium text-neutral-200 hover:bg-neutral-700 transition"
                        title="Copiar mensaje con link para WhatsApp o Slack"
                      >
                        {copiedId === inv.id ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                            Copiado
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5 text-neutral-400" />
                            Copiar Invitación
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleMailto(inv)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-800/80 px-2.5 py-1 text-[11px] font-medium text-neutral-200 hover:bg-neutral-700 transition"
                        title="Abrir cliente de correo con invitación redactada"
                      >
                        <Send className="h-3.5 w-3.5 text-neutral-400" />
                        Enviar Correo
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRevokeInvitation(inv.id)}
                        className="inline-flex items-center justify-center rounded-md border border-red-500/20 bg-red-500/10 p-1 text-red-400 hover:bg-red-500/20 transition"
                        title="Revocar invitación"
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

      {/* Panel exclusivo Super Admin: Autorizar Nuevas Empresas (Clientes B2B) */}
      {isSuperAdmin && (
        <div className="pt-6 border-t border-neutral-800 space-y-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
              <Sparkles className="h-3 w-3" />
              Super Admin B2B
            </span>
            <h2 className="text-lg font-bold text-white">Licencias para Nuevas Empresas</h2>
          </div>
          <p className="text-xs text-neutral-400">
            Autoriza aquí el correo de un nuevo cliente que haya adquirido Syncra ERP. Al iniciar sesión con su correo, el sistema le permitirá crear su propia empresa desde cero en <code>/onboarding</code>.
          </p>

          <form
            onSubmit={handleAuthorizeNewOwner}
            className="rounded-xl border border-amber-500/20 bg-neutral-900/60 p-4 sm:p-6 space-y-4"
          >
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="text-xs font-medium text-neutral-300">Correo del Dueño / Cliente</label>
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
                <label className="text-xs font-medium text-neutral-300">Nombre de Empresa / Referencia Comercial</label>
                <div className="relative mt-1">
                  <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-neutral-500" />
                  <input
                    type="text"
                    placeholder="Ej: Industrias Beta S.A.S."
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
              {ownerLoading ? 'Habilitando licencia...' : '+ Autorizar Creación de Nueva Empresa'}
            </button>
          </form>

          <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 overflow-hidden">
            <div className="p-4 border-b border-neutral-800">
              <h3 className="text-sm font-semibold text-white">Clientes Autorizados (Owners)</h3>
            </div>
            <div className="divide-y divide-neutral-800/60">
              {authorizedOwners.length === 0 ? (
                <p className="p-6 text-center text-xs text-neutral-500">No hay licencias registradas.</p>
              ) : (
                authorizedOwners.map((owner) => (
                  <div key={owner.email} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">{owner.email}</p>
                      {owner.company_notes && (
                        <p className="text-xs text-neutral-400">Ref: {owner.company_notes}</p>
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
                            Licencia Lista para Usar
                          </span>

                          <button
                            type="button"
                            onClick={async () => {
                              await navigator.clipboard.writeText(buildOwnerLicenseMessage(owner));
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
                                `Bienvenido a Syncra ERP - Portal ${owner.company_notes || ''}`.trim()
                              );
                              const body = encodeURIComponent(buildOwnerLicenseMessage(owner));
                              window.open(`mailto:${owner.email}?subject=${subject}&body=${body}`, '_blank');
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
        </div>
      )}
    </div>
  );
}