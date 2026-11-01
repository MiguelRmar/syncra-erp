'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Mail, Shield, UserPlus } from 'lucide-react';

interface Invitation {
  id: string;
  email: string;
  role: string;
  accepted_at: string | null;
  created_at: string;
}

export default function TeamPage() {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('operator');
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    loadInvitations();
  }, []);

  const loadInvitations = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (profile?.tenant_id) {
      const { data } = await supabase
        .from('tenant_invitations')
        .select('*')
        .eq('tenant_id', profile.tenant_id)
        .order('created_at', { ascending: false });

      if (data) setInvitations(data);
    }
  };

  const handleSendInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('Usuario no autenticado');

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single();

      if (profileError || !profile?.tenant_id) {
        throw new Error('No se encontró una empresa asociada a tu usuario');
      }

      const { data, error } = await supabase
        .from('tenant_invitations')
        .insert([
          {
            tenant_id: profile.tenant_id,
            email: email.trim().toLowerCase(),
            role,
            invited_by: user.id,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      alert(`Invitación creada para ${email}. Al iniciar sesión con Google o correo quedará vinculado automáticamente.`);
      setEmail('');
      setInvitations((prev) => [data, ...prev]);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
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
              <div key={inv.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-white">{inv.email}</p>
                  <p className="text-xs text-neutral-400">Rol: <span className="text-neutral-200 capitalize">{inv.role}</span></p>
                </div>
                <div>
                  {inv.accepted_at ? (
                    <span className="inline-flex text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Aceptada / Vinculado
                    </span>
                  ) : (
                    <span className="inline-flex text-[11px] font-medium px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      Pendiente de ingreso
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}