'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  Boxes,
  Users,
  Settings,
  LogOut,
  ChevronDown,
  Plus,
  Menu,
  X,
  Check,
} from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  logo_url: string | null;
  primary_color: string | null;
}

interface Profile {
  tenant_id: string;
  full_name: string | null;
  role: string | null;
  is_super_admin?: boolean | null;
}

interface HeaderBrandingProps {
  tenant: Tenant | null;
  profile: Profile | null;
  userEmail: string;
  userTenants: Tenant[];
}

export default function HeaderBranding({
  tenant,
  profile,
  userEmail,
  userTenants,
}: HeaderBrandingProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [imageError, setImageError] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const handleSwitchTenant = async (tenantId: string) => {
    if (tenantId === tenant?.id) {
      setDropdownOpen(false);
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('profiles')
        .update({ tenant_id: tenantId })
        .eq('id', user.id);

      if (error) throw error;

      setDropdownOpen(false);
      router.refresh();
    } catch (err: any) {
      alert(`Error al cambiar de empresa: ${err.message}`);
    }
  };

  const navLinks = [
    { href: '/inventory', label: 'Inventario', icon: Boxes },
    { href: '/team', label: 'Equipo', icon: Users },
    { href: '/settings/company', label: 'Ajustes', icon: Settings },
  ];

  const brandColor = tenant?.primary_color || '#2563eb';

  return (
    <header className="sticky top-0 z-40 w-full border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        
        {/* Lado Izquierdo: Identidad de Empresa y Selector Multi-Tenant */}
        <div className="relative flex items-center gap-3">
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2.5 rounded-xl border border-neutral-800 bg-neutral-900/60 p-1.5 pr-3 hover:border-neutral-700 hover:bg-neutral-900 transition text-left"
          >
            {tenant?.logo_url && !imageError ? (
              <img
                src={tenant.logo_url}
                alt={tenant.name || 'Logo'}
                className="h-8 w-8 rounded-lg object-contain bg-neutral-900 border border-neutral-800 p-0.5"
                onError={() => setImageError(true)}
              />
            ) : (
              <div
                className="h-8 w-8 rounded-lg flex items-center justify-center font-bold text-white text-xs shadow-sm"
                style={{ backgroundColor: brandColor }}
              >
                {tenant?.name?.charAt(0).toUpperCase() || 'S'}
              </div>
            )}

            <div className="hidden sm:flex flex-col">
              <span className="text-xs font-semibold text-white leading-tight max-w-[140px] truncate">
                {tenant?.name || 'Syncra ERP'}
              </span>
              <span className="text-[10px] text-neutral-400 capitalize leading-none mt-0.5">
                {profile?.role || 'Miembro'}
              </span>
            </div>

            <ChevronDown className={`h-4 w-4 text-neutral-400 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Menú Flotante de Organizaciones */}
          {dropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setDropdownOpen(false)}
              />
              <div className="absolute left-0 top-12 z-20 w-64 rounded-xl border border-neutral-800 bg-neutral-900 p-2 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100">
                <p className="px-2 py-1 text-[10px] font-semibold tracking-wider text-neutral-400 uppercase">
                  Tus Empresas
                </p>
                
                <div className="my-1 space-y-1 max-h-56 overflow-y-auto">
                  {userTenants.map((t) => {
                    const isCurrent = t.id === tenant?.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => handleSwitchTenant(t.id)}
                        className={`w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs transition ${
                          isCurrent
                            ? 'bg-neutral-800 font-semibold text-white'
                            : 'text-neutral-300 hover:bg-neutral-800/60'
                        }`}
                      >
                        <span className="truncate">{t.name}</span>
                        {isCurrent && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />}
                      </button>
                    );
                  })}
                </div>

                {profile?.is_super_admin && (
                  <div className="border-t border-neutral-800 pt-1 mt-1">
                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        router.push('/onboarding');
                      }}
                      className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-800 hover:text-white transition"
                    >
                      <Plus className="h-4 w-4" />
                      + Registrar Nueva Empresa
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Centro / Derecha: Navegación Escritorio */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition ${
                  isActive
                    ? 'text-white font-semibold'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/60'
                }`}
                style={isActive ? { color: brandColor } : undefined}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Lado Derecho Escritorio: Usuario y Salir */}
        <div className="hidden md:flex items-center gap-3">
          <span className="text-xs text-neutral-400 font-mono max-w-[160px] truncate">
            {userEmail}
          </span>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-1.5 text-xs text-neutral-300 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 transition"
          >
            <LogOut className="h-3.5 w-3.5" />
            Salir
          </button>
        </div>

        {/* Botón de Menú Hamburguesa Móvil */}
        <div className="flex md:hidden">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="rounded-lg border border-neutral-800 bg-neutral-900 p-2 text-neutral-300 hover:text-white"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Menú Desplegable Móvil */}
      {mobileMenuOpen && (
        <div className="border-t border-neutral-800 bg-neutral-950 px-4 py-4 md:hidden space-y-3">
          <div className="pb-2 border-b border-neutral-800 text-xs text-neutral-400">
            Conectado como: <span className="text-white font-mono">{userEmail}</span>
          </div>

          <div className="space-y-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive ? 'bg-neutral-900 text-white font-semibold' : 'text-neutral-400'
                  }`}
                  style={isActive ? { color: brandColor } : undefined}
                >
                  <Icon className="h-4 w-4" />
                  {link.label}
                </Link>
              );
            })}
          </div>

          <div className="pt-2 border-t border-neutral-800">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 py-2.5 text-xs font-semibold text-red-400"
            >
              <LogOut className="h-4 w-4" />
              Cerrar Sesión
            </button>
          </div>
        </div>
      )}
    </header>
  );
}