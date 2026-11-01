'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Package, Hammer, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Item {
  id: string;
  sku: string;
  name: string;
  unit: string;
  type: 'raw_material' | 'finished_good';
  current_stock: number;
  sale_price?: number;
}

interface InventoryClientViewProps {
  initialItems: Item[];
  profile: any;
  userEmail: string;
}

export default function InventoryClientView({
  initialItems,
  profile,
  userEmail,
}: InventoryClientViewProps) {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [isProductionOpen, setIsProductionOpen] = useState(false);
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);

  // Formulario Producción
  const [selectedProduct, setSelectedProduct] = useState('');
  const [produceQty, setProduceQty] = useState(1);

  // Formulario Nuevo Ítem
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('unidades');
  const [type, setType] = useState<'raw_material' | 'finished_good'>('raw_material');
  const [initialStock, setInitialStock] = useState(0);
  const [salePrice, setSalePrice] = useState(0);

  const [loadingAction, setLoadingAction] = useState(false);

  const supabase = createClient();
  const router = useRouter();

  const finishedGoods = items.filter((i) => i.type === 'finished_good');

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!profile?.tenant_id) {
      alert('Tu cuenta no tiene una empresa asignada. Completa la configuración inicial.');
      return;
    }

    if (!sku.trim() || !name.trim()) {
      alert('El SKU y el nombre son obligatorios.');
      return;
    }

    setLoadingAction(true);

    try {
      // 1. Insertar ítem con el tenant del usuario
      const { data: newItem, error: itemError } = await supabase
        .from('items')
        .insert([
          {
            tenant_id: profile.tenant_id,
            sku: sku.trim().toUpperCase(),
            name: name.trim(),
            unit: unit.trim(),
            type,
            current_stock: Number(initialStock),
            sale_price: type === 'finished_good' ? Number(salePrice) : 0,
            is_active_for_sale: type === 'finished_good',
          },
        ])
        .select()
        .single();

      if (itemError) throw itemError;

      // 2. Registrar kárdex inicial si el stock es mayor a 0
      if (Number(initialStock) > 0) {
        await supabase.from('inventory_movements').insert([
          {
            tenant_id: profile.tenant_id,
            item_id: newItem.id,
            type: 'entry',
            quantity: Number(initialStock),
          },
        ]);
      }

      setItems((prev) => [...prev, newItem].sort((a, b) => a.name.localeCompare(b.name)));
      setIsAddItemOpen(false);

      // Limpiar formulario
      setSku('');
      setName('');
      setInitialStock(0);
      setSalePrice(0);
      router.refresh();
    } catch (error: any) {
      alert(`Error al registrar ítem: ${error.message}`);
    } finally {
      setLoadingAction(false);
    }
  };

  const handleExecuteProduction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || produceQty <= 0) return;
    setLoadingAction(true);

    try {
      const { error } = await supabase.rpc('record_production', {
        p_finished_good_id: selectedProduct,
        p_quantity: Number(produceQty),
        p_notes: 'Producción manual desde dashboard',
      });

      if (error) throw error;

      alert('¡Producción realizada exitosamente! Stock actualizado.');
      setIsProductionOpen(false);

      const { data: updated } = await supabase
        .from('items')
        .select('*')
        .order('name', { ascending: true });

      if (updated) setItems(updated);
      router.refresh();
    } catch (error: any) {
      alert(`Error al producir: ${error.message}`);
    } finally {
      setLoadingAction(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Barra de Acciones Superior */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Gestión de Inventario</h1>
          <p className="text-xs text-neutral-400">
            Control de materias primas y productos fabricables de la empresa.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsAddItemOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800/80 px-3.5 py-2 text-xs font-medium text-neutral-200 hover:bg-neutral-800 transition shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar Ítem
          </button>

          <button
            onClick={() => setIsProductionOpen(true)}
            style={{ backgroundColor: 'var(--brand-color, #2563eb)' }}
            className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold text-white shadow transition hover:opacity-90"
          >
            <Hammer className="h-3.5 w-3.5" />
            Nueva Producción
          </button>
        </div>
      </div>

      {/* Tabla de Artículos */}
      <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/40">
        <table className="w-full text-left text-sm text-neutral-300">
          <thead className="border-b border-neutral-800 bg-neutral-900/80 text-xs font-semibold uppercase tracking-wider text-neutral-400">
            <tr>
              <th className="px-6 py-3.5">SKU</th>
              <th className="px-6 py-3.5">Nombre</th>
              <th className="px-6 py-3.5">Tipo</th>
              <th className="px-6 py-3.5 text-right">Stock</th>
              <th className="px-6 py-3.5">Unidad</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/60">
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-xs text-neutral-500">
                  No hay ítems registrados. Comienza agregando materias primas o productos terminados.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="hover:bg-neutral-800/30 transition">
                  <td className="px-6 py-4 font-mono text-xs text-neutral-400">{item.sku}</td>
                  <td className="px-6 py-4 font-medium text-white">{item.name}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${
                        item.type === 'finished_good'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}
                    >
                      {item.type === 'finished_good' ? 'Producto Terminado' : 'Materia Prima'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-white text-base">
                    {Number(item.current_stock).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-xs text-neutral-400">{item.unit}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: Agregar Ítem */}
      {isAddItemOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Agregar Nuevo Ítem</h3>

            <form onSubmit={handleCreateItem} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-neutral-300">Código / SKU</label>
                  <input
                    type="text"
                    required
                    placeholder="MP-001"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-300">Tipo</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as any)}
                    className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                  >
                    <option value="raw_material">Materia Prima</option>
                    <option value="finished_good">Producto Terminado</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-neutral-300">Nombre del Ítem</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Madera de Pino, Tornillos 1/2"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-neutral-300">Unidad de Medida</label>
                  <input
                    type="text"
                    required
                    placeholder="kg, metros, unidades"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-300">Stock Inicial</label>
                  <input
                    type="number"
                    min="0"
                    value={initialStock}
                    onChange={(e) => setInitialStock(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {type === 'finished_good' && (
                <div>
                  <label className="text-xs font-medium text-neutral-300">Precio de Venta ($)</label>
                  <input
                    type="number"
                    min="0"
                    value={salePrice}
                    onChange={(e) => setSalePrice(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddItemOpen(false)}
                  className="rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-700 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loadingAction}
                  style={{ backgroundColor: 'var(--brand-color, #2563eb)' }}
                  className="rounded-lg px-4 py-2 text-xs font-medium text-white shadow hover:opacity-90 transition disabled:opacity-50"
                >
                  {loadingAction ? 'Guardando...' : 'Guardar Ítem'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Nueva Producción */}
      {isProductionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Fabricar Producto Terminado</h3>
            <p className="text-xs text-neutral-400">
              El motor atómico de PostgreSQL descontará de inmediato las materias primas vinculadas en la receta (BOM).
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
                  {finishedGoods.map((prod) => (
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
                  style={{ backgroundColor: 'var(--brand-color, #2563eb)' }}
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