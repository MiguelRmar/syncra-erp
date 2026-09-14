'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Package, Hammer, Plus, LogOut, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function InventoryClientView({ initialItems, profile, userEmail }: any) {
  const [items, setItems] = useState(initialItems);
  const [isProductionOpen, setIsProductionOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [produceQty, setProduceQty] = useState(1);
  const [loadingAction, setLoadingAction] = useState(false);

  const supabase = createClient();
  const router = useRouter();

  const tenant = profile?.tenants;
  const primaryColor = tenant?.primary_color || '#2563eb';

  const rawMaterials = items.filter((i: any) => i.type === 'raw_material');
  const finishedGoods = items.filter((i: any) => i.type === 'finished_good');

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const handleExecuteProduction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || produceQty <= 0) return;
    setLoadingAction(true);

    const { data, error } = await supabase.rpc('record_production', {
      p_finished_good_id: selectedProduct,
      p_quantity: Number(produceQty),
      p_notes: 'Producción manual desde dashboard'
    });

    if (error) {
      alert(`Error al producir: ${error.message}`);
    } else {
      alert('¡Producción realizada exitosamente! Stock actualizado.');
      setIsProductionOpen(false);
      // Recargar datos
      const { data: updated } = await supabase.from('items').select('*').order('name');
      if (updated) setItems(updated);
    }
    setLoadingAction(false);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {/* Header corporativo con Branding */}
      <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div 
            className="h-9 w-9 rounded-lg flex items-center justify-center font-bold text-white shadow-sm"
            style={{ backgroundColor: primaryColor }}
          >
            {tenant?.name?.charAt(0) || 'S'}
          </div>
          <div>
            <h2 className="text-base font-bold text-white leading-none">{tenant?.name || 'Syncra ERP'}</h2>
            <span className="text-xs text-neutral-400">{profile?.full_name || userEmail} ({profile?.role || 'Operador'})</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsProductionOpen(true)}
            className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-medium text-white shadow transition hover:opacity-90"
            style={{ backgroundColor: primaryColor }}
          >
            <Hammer className="h-4 w-4" />
            Nueva Producción
          </button>

          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800/80 px-3 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-800 transition"
          >
            <LogOut className="h-3.5 w-3.5" />
            Salir
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto p-6 space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Gestión de Inventario</h1>
          <p className="text-xs text-neutral-400">Catálogo de materias primas y productos fabricables</p>
        </div>

        {/* Tabla de Artículos */}
        <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/40">
          <table className="w-full text-left text-sm text-neutral-300">
            <thead className="border-b border-neutral-800 bg-neutral-900/80 text-xs font-semibold uppercase tracking-wider text-neutral-400">
              <tr>
                <th className="px-6 py-3.5">SKU</th>
                <th className="px-6 py-3.5">Nombre del Ítem</th>
                <th className="px-6 py-3.5">Tipo</th>
                <th className="px-6 py-3.5 text-right">Stock Actual</th>
                <th className="px-6 py-3.5">Unidad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60">
              {items.map((item: any) => (
                <tr key={item.id} className="hover:bg-neutral-800/30 transition">
                  <td className="px-6 py-4 font-mono text-xs text-neutral-400">{item.sku}</td>
                  <td className="px-6 py-4 font-medium text-white">{item.name}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${
                      item.type === 'finished_good' 
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}>
                      {item.type === 'finished_good' ? 'Producto Terminado' : 'Materia Prima'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-white text-base">
                    {Number(item.current_stock).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-xs text-neutral-400">{item.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* Modal de Producción */}
      {isProductionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Fabricar Producto Terminado</h3>
            <p className="text-xs text-neutral-400">
              El sistema verificará la receta (BOM) y descontará automáticamente las materias primas del inventario.
            </p>

            <form onSubmit={handleExecuteProduction} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-neutral-300">Producto a Fabricar</label>
                <select
                  required
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                >
                  <option value="">Selecciona un producto...</option>
                  {finishedGoods.map((prod: any) => (
                    <option key={prod.id} value={prod.id}>
                      {prod.name} ({prod.sku})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-neutral-300">Cantidad a Fabricar</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={produceQty}
                  onChange={(e) => setProduceQty(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsProductionOpen(false)}
                  className="rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-700 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loadingAction}
                  style={{ backgroundColor: primaryColor }}
                  className="rounded-lg px-4 py-2 text-xs font-medium text-white shadow hover:opacity-90 transition disabled:opacity-50"
                >
                  {loadingAction ? 'Fabricando...' : 'Confirmar y Descontar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}