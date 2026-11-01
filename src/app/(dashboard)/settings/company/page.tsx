'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Building2, Palette, Upload, CheckCircle, AlertCircle, Loader2, Image as ImageIcon, Globe } from 'lucide-react';

interface TenantData {
  id: string;
  name: string;
  logo_url: string | null;
  primary_color: string | null;
  custom_domain?: string | null;
}

type Status = 'idle' | 'loading' | 'success' | 'error';

export default function CompanySettingsPage() {
  const [tenant, setTenant] = useState<TenantData | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#2563eb');
  const [customDomain, setCustomDomain] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const supabase = createClient();
  const router = useRouter();

  // Carga los datos actuales del tenant al montar
  useEffect(() => {
    const loadTenant = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setStatus('error'); setMessage('No autenticado'); return; }

        const { data: profile } = await supabase
          .from('profiles')
          .select('tenant_id')
          .eq('id', user.id)
          .single();

        if (!profile?.tenant_id) { setStatus('error'); setMessage('Sin empresa vinculada'); return; }

        const { data: tenantData, error } = await supabase
          .from('tenants')
          .select('id, name, logo_url, primary_color, custom_domain')
          .eq('id', profile.tenant_id)
          .single();

        if (error) throw error;

        // Poblar formulario con valores actuales
        setTenant(tenantData);
        setName(tenantData.name ?? '');
        setColor(tenantData.primary_color ?? '#2563eb');
        setCustomDomain(tenantData.custom_domain ?? '');
        setPreviewUrl(tenantData.logo_url);
        setStatus('idle');
      } catch (err: any) {
        setStatus('error');
        setMessage(err.message);
      }
    };

    loadTenant();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    // Preview local inmediata
    const url = URL.createObjectURL(selected);
    setPreviewUrl(url);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;

    setStatus('loading');
    setMessage('');

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('Usuario no autenticado');

      const updates: Partial<TenantData> = {};

      if (name.trim()) {
        updates.name = name.trim();
      }
      // Siempre guarda el color (primary_color puede ser null en BD)
      updates.primary_color = color;
      updates.custom_domain = customDomain.trim().toLowerCase() || null;

      // Subir logo si hay archivo nuevo
      if (file) {
        const ext = file.name.split('.').pop();
        const path = `${tenant.id}/logo-${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('company-logos')
          .upload(path, file, { upsert: true, contentType: file.type });

        if (uploadError) throw new Error(`Error subiendo logo: ${uploadError.message}`);

        const { data: publicUrlData } = supabase.storage
          .from('company-logos')
          .getPublicUrl(path);

        updates.logo_url = publicUrlData.publicUrl;
      }

      console.log('[Settings] Intentando guardar en tenant:', tenant.id, 'Datos:', updates);

      const { error: updateError } = await supabase
        .from('tenants')
        .update(updates)
        .eq('id', tenant.id);

      console.log('[Settings] Resultado UPDATE error:', updateError);

      if (updateError) {
        throw new Error(`Error al guardar: ${updateError.message} (code: ${updateError.code})`);
      }

      // Actualizar estado local
      setTenant((prev) => prev ? { ...prev, ...updates } : prev);
      setFile(null);
      setStatus('success');
      setMessage('¡Identidad visual actualizada con éxito! Recargando...');
      // Hard refresh para forzar re-fetch del Server Component del layout
      setTimeout(() => window.location.reload(), 800);
    } catch (err: any) {
      setStatus('error');
      setMessage(err.message);
    }
  };

  if (status === 'loading' && !tenant) {
    return (
      <div className="flex items-center justify-center h-48 gap-3 text-neutral-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Cargando configuración...</span>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Building2 className="h-6 w-6" style={{ color }} />
          Configuración de Empresa
        </h1>
        <p className="text-xs text-neutral-400 mt-1">
          Personaliza el logotipo, nombre y color corporativo que aparecen en toda la plataforma.
        </p>
      </div>

      <form
        onSubmit={handleUpdate}
        className="space-y-5 rounded-xl border border-neutral-800 bg-neutral-900/50 p-6 backdrop-blur-sm"
      >
        {/* Preview en tiempo real */}
        <div className="flex items-center gap-4 p-3 rounded-lg bg-neutral-950/60 border border-neutral-800">
          <div className="shrink-0">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Logo preview"
                className="h-12 w-12 rounded-xl object-contain border border-neutral-700 bg-neutral-900 p-1"
              />
            ) : (
              <div
                className="h-12 w-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow"
                style={{ backgroundColor: color }}
              >
                {name.charAt(0).toUpperCase() || tenant?.name?.charAt(0).toUpperCase() || 'S'}
              </div>
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-white">
              {name || tenant?.name || 'Nombre de la empresa'}
            </p>
            <p className="text-[10px] font-mono text-neutral-400 mt-0.5">{color}</p>
          </div>
          <div
            className="ml-auto h-5 w-5 rounded-full border border-neutral-700 shadow-inner"
            style={{ backgroundColor: color }}
          />
        </div>

        {/* Nombre */}
        <div>
          <label className="text-xs font-medium text-neutral-300 flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            Nombre de la Empresa
          </label>
          <input
            type="text"
            placeholder={tenant?.name || 'Nombre comercial...'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3.5 py-2.5 text-sm text-white placeholder-neutral-500 outline-none focus:border-blue-500 transition"
          />
        </div>

        {/* Color primario */}
        <div>
          <label className="text-xs font-medium text-neutral-300 flex items-center gap-1.5">
            <Palette className="h-3.5 w-3.5" />
            Color Primario
          </label>
          <div className="mt-1.5 flex items-center gap-3">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-16 cursor-pointer rounded-lg border border-neutral-700 bg-neutral-800 p-1"
            />
            <span className="font-mono text-xs text-neutral-400">{color}</span>
          </div>
        </div>

        {/* Dominio Personalizado (Opcional) */}
        <div>
          <label className="text-xs font-medium text-neutral-300 flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5" />
            Dominio Personalizado (Opcional - Marca Blanca)
          </label>
          <input
            type="text"
            placeholder="Ej: erp.miempresa.com"
            value={customDomain}
            onChange={(e) => setCustomDomain(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3.5 py-2.5 text-sm text-white placeholder-neutral-500 outline-none focus:border-blue-500 transition font-mono"
          />
          <p className="text-[11px] text-neutral-500 mt-1">
            Si vinculas un dominio propio en Vercel para esta empresa, escríbelo aquí para activar su marca en el login.
          </p>
        </div>

        {/* Logo */}
        <div>
          <label className="text-xs font-medium text-neutral-300 flex items-center gap-1.5">
            <ImageIcon className="h-3.5 w-3.5" />
            Logo de la Empresa
          </label>

          {tenant?.logo_url && !file && (
            <div className="mt-2 mb-2 flex items-center gap-2 text-xs text-neutral-400">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              Logo actual guardado en la BD.
              <button
                type="button"
                onClick={() => { setPreviewUrl(null); setFile(null); }}
                className="text-red-400 hover:text-red-300 underline ml-1"
              >
                Quitar
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-1.5 w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-700 bg-neutral-800/60 py-3 text-xs text-neutral-400 hover:border-neutral-500 hover:text-neutral-200 transition"
          >
            <Upload className="h-4 w-4" />
            {file ? file.name : 'Seleccionar archivo (.png, .jpg, .webp)'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png, image/jpeg, image/webp"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {/* Mensaje de estado */}
        {message && (
          <div
            className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs ${
              status === 'success'
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                : 'bg-red-500/10 border border-red-500/20 text-red-400'
            }`}
          >
            {status === 'success' ? (
              <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            )}
            {message}
          </div>
        )}

        <button
          type="submit"
          disabled={status === 'loading'}
          style={{ backgroundColor: color }}
          className="w-full py-2.5 rounded-lg text-xs font-bold text-white shadow-md hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {status === 'loading' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Guardando cambios...
            </>
          ) : (
            'Aplicar Cambios Globales'
          )}
        </button>
      </form>

      {/* Nota sobre el bucket */}
      <p className="text-[10px] text-neutral-600 text-center">
        El logo se almacena en Supabase Storage (bucket: <code>company-logos</code>). Asegúrate de que el bucket exista y sea público.
      </p>
    </div>
  );
}