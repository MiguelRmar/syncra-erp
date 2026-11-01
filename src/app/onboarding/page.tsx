'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Building2, ArrowRight, Upload, Image as ImageIcon, Loader2 } from 'lucide-react';

export default function OnboardingPage() {
  const [name, setName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#2563eb');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifyingAccess, setVerifyingAccess] = useState(true);

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const checkAuthorization = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login');
        return;
      }

      const userEmail = (user.email ?? '').toLowerCase();
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_super_admin')
        .eq('id', user.id)
        .single();

      const { data: authorizedOwner } = await supabase
        .from('authorized_owners')
        .select('email, company_notes')
        .eq('email', userEmail)
        .maybeSingle();

      if (!profile?.is_super_admin && !authorizedOwner) {
        await supabase.auth.signOut();
        router.replace('/login?error=unauthorized');
        return;
      }

      if (authorizedOwner?.company_notes) {
        setName(authorizedOwner.company_notes);
      }

      setVerifyingAccess(false);
    };

    checkAuthorization();
  }, [router, supabase]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setLogoFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);

    try {
      // Obtener usuario actual
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('No autenticado');

      let uploadedLogoUrl: string | null = null;
      const slug = name.toLowerCase().trim().replace(/[\s\W-]+/g, '-');

      if (logoFile) {
        const fileExt = logoFile.name.split('.').pop();
        const filePath = `${slug}-${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('company-logos')
          .upload(filePath, logoFile, { cacheControl: '3600', upsert: true });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from('company-logos')
          .getPublicUrl(filePath);

        uploadedLogoUrl = publicUrlData.publicUrl;
      }

      // Llamar RPC — retorna el nuevo tenant_id
      const { data: newTenantId, error: rpcError } = await supabase.rpc(
        'create_tenant_and_assign_user',
        {
          p_name: name.trim(),
          p_slug: slug,
          p_primary_color: primaryColor,
          p_logo_url: uploadedLogoUrl,
        }
      );

      if (rpcError) throw rpcError;

      // Respaldo: actualizar el perfil desde el cliente por si la función no lo hizo
      if (newTenantId) {
        await supabase
          .from('profiles')
          .update({ tenant_id: newTenantId })
          .eq('id', user.id);
      }

      // Hard redirect: garantiza que el Server Component re-fetcha datos frescos
      window.location.href = '/inventory';
    } catch (error: any) {
      alert(`Error al registrar empresa: ${error.message}`);
      setLoading(false);
    }
  };

  if (verifyingAccess) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-neutral-950 text-neutral-400 gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-xs font-medium">Verificando licencia comercial...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-neutral-950 p-4 sm:p-8">
      <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-900/70 p-6 sm:p-10 shadow-2xl backdrop-blur-xl">
        <div className="text-center space-y-2 mb-6">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600/10 text-blue-500 border border-blue-500/20">
            <Building2 className="h-6 w-6" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">Configura tu Empresa</h1>
          <p className="text-xs sm:text-sm text-neutral-400">
            Define la identidad visual y datos iniciales de tu espacio de trabajo.
          </p>
        </div>

        <form onSubmit={handleCreateCompany} className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Nombre de la Empresa
            </label>
            <input
              type="text"
              required
              placeholder="Ej: Metálicas Andinas S.A.S."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800/80 px-3.5 py-2.5 text-sm text-white placeholder-neutral-500 outline-none focus:border-blue-500 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Logotipo Corporativo
            </label>
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-neutral-700 bg-neutral-800/50">
                {previewUrl ? (
                  <img src={previewUrl} alt="Preview" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-6 w-6 text-neutral-500" />
                )}
              </div>

              <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800/80 px-3 py-2.5 text-xs font-medium text-neutral-200 hover:bg-neutral-800 transition">
                <Upload className="h-4 w-4 shrink-0 text-neutral-400" />
                <span className="truncate">{logoFile ? logoFile.name : 'Subir logo (.png, .jpg)'}</span>
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/webp"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Color Primario de Interfaz
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-10 w-16 cursor-pointer rounded-lg border border-neutral-700 bg-neutral-800 p-1"
              />
              <span className="font-mono text-xs text-neutral-400">{primaryColor}</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{ backgroundColor: primaryColor }}
            className="flex w-full items-center justify-center gap-2 rounded-lg py-3 px-4 text-sm font-semibold text-white shadow-md hover:opacity-90 disabled:opacity-50 transition"
          >
            {loading ? 'Configurando espacio...' : 'Comenzar a Trabajar'}
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}