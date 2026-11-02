'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PackagePlus, Hammer, Plus, Layers, Trash2, CheckCircle2, AlertCircle, BookOpen } from 'lucide-react';
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

interface BomLine {
  id: string;
  finished_good_id: string;
  raw_material_id: string;
  required_quantity: number;
}

interface InventoryClientViewProps {
  initialItems: Item[];
  profile: any;
  userEmail: string;
}

const COMMON_UNITS = ['unidades', 'kg', 'gramos', 'litros', 'ml', 'metros', 'cajas', 'frascos'];

export default function InventoryClientView({
  initialItems,
  profile,
  userEmail,
}: InventoryClientViewProps) {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [bomLines, setBomLines] = useState<BomLine[]>([]);
  const [isProductionOpen, setIsProductionOpen] = useState(false);
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);

  // Modo dentro del modal de Inventario: 'restock' (sumar a existente) vs 'create' (crear desde 0)
  const [inventoryMode, setInventoryMode] = useState<'restock' | 'create'>(
    initialItems.length > 0 ? 'restock' : 'create'
  );
  const [selectedExistingItemId, setSelectedExistingItemId] = useState<string>('');
  const [restockQty, setRestockQty] = useState<number>(1);

  // Formulario Producción
  const [selectedProduct, setSelectedProduct] = useState('');
  const [produceQty, setProduceQty] = useState(1);
  // Agregar insumo a la receta (BOM) desde el modal de producción
  const [newBomRawMaterialId, setNewBomRawMaterialId] = useState('');
  const [newBomQty, setNewBomQty] = useState<number>(1);
  const [savingBom, setSavingBom] = useState(false);

  // Formulario Nuevo Ítem
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('unidades');
  const [type, setType] = useState<'raw_material' | 'finished_good'>('raw_material');
  const [initialStock, setInitialStock] = useState(0);
  const [salePrice, setSalePrice] = useState(0);

  const [loadingAction, setLoadingAction] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const supabase = createClient();
  const router = useRouter();

  const finishedGoods = items.filter((i) => i.type === 'finished_good');
  const rawMaterials = items.filter((i) => i.type === 'raw_material');

  useEffect(() => {
    const loadBom = async () => {
      if (!profile?.tenant_id) return;
      const { data } = await supabase
        .from('bill_of_materials')
        .select('id, finished_good_id, raw_material_id, required_quantity')
        .eq('tenant_id', profile.tenant_id);
      if (data) setBomLines(data as BomLine[]);
    };
    loadBom();
  }, [profile?.tenant_id, supabase]);

  const openRestockForItem = (item: Item) => {
    setInventoryMode('restock');
    setSelectedExistingItemId(item.id);
    setRestockQty(1);
    setIsAddItemOpen(true);
  };

  const openProductionForProduct = (product: Item) => {
    setSelectedProduct(product.id);
    setProduceQty(1);
    setIsProductionOpen(true);
  };

  // Auto-sugerir SKU cuando el usuario cambia el tipo al crear desde 0
  const suggestNextSku = (targetType: 'raw_material' | 'finished_good') => {
    const prefix = targetType === 'raw_material' ? 'MP-' : 'PT-';
    const count = items.filter((i) => i.type === targetType).length + 1;
    return `${prefix}${String(count).padStart(3, '0')}`;
  };

  const handleOpenAddModal = () => {
    if (items.length > 0) {
      setInventoryMode('restock');
      if (!selectedExistingItemId) {
        setSelectedExistingItemId(items[0].id);
      }
    } else {
      setInventoryMode('create');
      setSku(suggestNextSku('raw_material'));
    }
    setRestockQty(1);
    setIsAddItemOpen(true);
  };

  const handleRestockExistingItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExistingItemId || restockQty <= 0) return;

    setLoadingAction(true);
    setFeedback(null);

    try {
      const { data: newStock, error } = await supabase.rpc('add_inventory_stock', {
        p_item_id: selectedExistingItemId,
        p_quantity: Number(restockQty),
      });

      if (error) throw error;

      const updatedItem = items.find((i) => i.id === selectedExistingItemId);
      setItems((prev) =>
        prev.map((i) =>
          i.id === selectedExistingItemId ? { ...i, current_stock: Number(newStock) } : i
        )
      );

      setIsAddItemOpen(false);
      setFeedback({
        type: 'success',
        text: `Se sumaron +${restockQty} ${updatedItem?.unit || 'unidades'} a "${updatedItem?.name}". Nuevo stock: ${Number(newStock).toLocaleString()}.`,
      });
      router.refresh();
    } catch (error: any) {
      alert(`Error al ingresar stock: ${error.message}`);
    } finally {
      setLoadingAction(false);
    }
  };

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

    // Si el SKU o Nombre ya existe exactamente, sumar stock en vez de fallar
    const existingMatch = items.find(
      (i) =>
        i.sku.toLowerCase() === sku.trim().toLowerCase() ||
        i.name.toLowerCase() === name.trim().toLowerCase()
    );

    if (existingMatch && Number(initialStock) > 0) {
      setSelectedExistingItemId(existingMatch.id);
      setRestockQty(Number(initialStock));
      setInventoryMode('restock');
      alert(
        `El ítem "${existingMatch.name}" (${existingMatch.sku}) ya existe en tu catálogo. Te hemos cambiado a la pestaña "Sumar Stock a Existente" para adicionar las ${initialStock} unidades.`
      );
      return;
    }

    setLoadingAction(true);
    setFeedback(null);

    try {
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
      setFeedback({
        type: 'success',
        text: `Ítem "${newItem.name}" (${newItem.sku}) registrado en el catálogo.`,
      });

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

  const handleAddBomIngredient = async () => {
    if (!selectedProduct || !newBomRawMaterialId || newBomQty <= 0 || !profile?.tenant_id) return;
    setSavingBom(true);

    try {
      const { data, error } = await supabase
        .from('bill_of_materials')
        .insert([
          {
            tenant_id: profile.tenant_id,
            finished_good_id: selectedProduct,
            raw_material_id: newBomRawMaterialId,
            required_quantity: Number(newBomQty),
          },
        ])
        .select('id, finished_good_id, raw_material_id, required_quantity')
        .single();

      if (error) throw error;
      if (data) {
        setBomLines((prev) => [...prev, data as BomLine]);
        setNewBomRawMaterialId('');
        setNewBomQty(1);
      }
    } catch (error: any) {
      alert(`Error al guardar insumo en la receta: ${error.message}`);
    } finally {
      setSavingBom(false);
    }
  };

  const handleRemoveBomLine = async (bomId: string) => {
    const { error } = await supabase.from('bill_of_materials').delete().eq('id', bomId);
    if (!error) {
      setBomLines((prev) => prev.filter((b) => b.id !== bomId));
    }
  };

  const handleExecuteProduction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || produceQty <= 0) return;
    setLoadingAction(true);
    setFeedback(null);

    try {
      const { error } = await supabase.rpc('record_production', {
        p_finished_good_id: selectedProduct,
        p_quantity: Number(produceQty),
        p_notes: 'Producción manual desde dashboard',
      });

      if (error) throw error;

      const producedItem = items.find((i) => i.id === selectedProduct);
      setIsProductionOpen(false);

      const { data: updated } = await supabase
        .from('items')
        .select('*')
        .eq('tenant_id', profile.tenant_id)
        .order('name', { ascending: true });

      if (updated) setItems(updated);
      setFeedback({
        type: 'success',
        text: `¡Producción completada! Se sumaron +${produceQty} ${producedItem?.unit || 'unidades'} de "${producedItem?.name}" y se descontaron los insumos.`,
      });
      router.refresh();
    } catch (error: any) {
      alert(`Error al producir: ${error.message}`);
    } finally {
      setLoadingAction(false);
    }
  };

  const selectedExistingItem = items.find((i) => i.id === selectedExistingItemId);
  const selectedProductBom = bomLines.filter((b) => b.finished_good_id === selectedProduct);

  return (
    <div className="space-y-6">
      {/* Barra de Acciones Superior */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Gestión de Inventario</h1>
          <p className="text-xs text-neutral-400">
            Selecciona ítems existentes para sumar unidades rápidamente o registra nuevos productos en el catálogo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800/80 px-3.5 py-2 text-xs font-medium text-neutral-200 hover:bg-neutral-800 transition shadow-sm"
          >
            <PackagePlus className="h-3.5 w-3.5" />
            Ingresar Stock / Nuevo Ítem
          </button>

          <button
            onClick={() => {
              if (!selectedProduct && finishedGoods.length > 0) {
                setSelectedProduct(finishedGoods[0].id);
              }
              setIsRecipeModalOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800/80 px-3.5 py-2 text-xs font-medium text-neutral-200 hover:bg-neutral-800 transition shadow-sm"
          >
            <BookOpen className="h-3.5 w-3.5 text-amber-400" />
            Configurar Recetas (BOM)
          </button>

          <button
            onClick={() => {
              if (!selectedProduct && finishedGoods.length > 0) {
                setSelectedProduct(finishedGoods[0].id);
              }
              setIsProductionOpen(true);
            }}
            style={{ backgroundColor: 'var(--brand-color, #2563eb)' }}
            className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold text-white shadow transition hover:opacity-90"
          >
            <Hammer className="h-3.5 w-3.5" />
            Registrar Producción
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`flex items-start justify-between gap-3 rounded-xl border p-3.5 text-xs ${
            feedback.type === 'error'
              ? 'border-red-500/30 bg-red-500/10 text-red-400'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'error' ? (
              <AlertCircle className="h-4 w-4 shrink-0" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-[11px] opacity-75 hover:opacity-100"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Tabla de Artículos con Acciones Rápidas en 1 Clic */}
      <div className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900/40">
        <table className="w-full text-left text-sm text-neutral-300">
          <thead className="border-b border-neutral-800 bg-neutral-900/80 text-xs font-semibold uppercase tracking-wider text-neutral-400">
            <tr>
              <th className="px-6 py-3.5">SKU</th>
              <th className="px-6 py-3.5">Nombre</th>
              <th className="px-6 py-3.5">Tipo</th>
              <th className="px-6 py-3.5 text-right">Stock Actual</th>
              <th className="px-6 py-3.5">Unidad</th>
              <th className="px-6 py-3.5 text-right">Acción Rápida</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/60">
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-xs text-neutral-500">
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
                  <td className="px-6 py-4 text-right">
                    <div className="inline-flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openRestockForItem(item)}
                        className="inline-flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700 hover:text-white transition"
                        title="Adicionar unidades a este ítem"
                      >
                        <Plus className="h-3.5 w-3.5 text-emerald-400" />
                        Sumar Stock
                      </button>

                      {item.type === 'finished_good' && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProduct(item.id);
                              setIsRecipeModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700 hover:text-white transition"
                            title="Configurar receta / insumos de este producto"
                          >
                            <BookOpen className="h-3.5 w-3.5 text-amber-400" />
                            Receta ({bomLines.filter((b) => b.finished_good_id === item.id).length})
                          </button>

                          <button
                            type="button"
                            onClick={() => openProductionForProduct(item)}
                            style={{ backgroundColor: 'var(--brand-color, #2563eb)' }}
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition"
                            title="Fabricar más unidades de este producto"
                          >
                            <Hammer className="h-3.5 w-3.5" />
                            Producir
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Híbrido: Sumar Stock a Ítem Existente (Dropdown) O Crear Nuevo Ítem */}
      {isAddItemOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Movimiento de Inventario</h3>
            </div>

            {/* Selector de Pestaña: Reabastecer Existente vs Crear Desde Cero */}
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-neutral-950 p-1 border border-neutral-800">
              <button
                type="button"
                onClick={() => setInventoryMode('restock')}
                disabled={items.length === 0}
                className={`rounded-lg py-2 text-xs font-semibold transition ${
                  inventoryMode === 'restock'
                    ? 'bg-neutral-800 text-white shadow'
                    : 'text-neutral-400 hover:text-neutral-200 disabled:opacity-40'
                }`}
              >
                + Sumar a Existente
              </button>
              <button
                type="button"
                onClick={() => {
                  setInventoryMode('create');
                  if (!sku) setSku(suggestNextSku(type));
                }}
                className={`rounded-lg py-2 text-xs font-semibold transition ${
                  inventoryMode === 'create'
                    ? 'bg-neutral-800 text-white shadow'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Crear Nuevo Catálogo
              </button>
            </div>

            {inventoryMode === 'restock' ? (
              <form onSubmit={handleRestockExistingItem} className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-neutral-300">
                    Selecciona el Ítem o Producto Registrado
                  </label>
                  <select
                    required
                    value={selectedExistingItemId}
                    onChange={(e) => setSelectedExistingItemId(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500"
                  >
                    <option value="">Selecciona un ítem de la lista...</option>
                    {rawMaterials.length > 0 && (
                      <optgroup label="Materias Primas / Insumos">
                        {rawMaterials.map((rm) => (
                          <option key={rm.id} value={rm.id}>
                            {rm.name} ({rm.sku}) — Stock actual: {rm.current_stock} {rm.unit}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {finishedGoods.length > 0 && (
                      <optgroup label="Productos Terminados">
                        {finishedGoods.map((fg) => (
                          <option key={fg.id} value={fg.id}>
                            {fg.name} ({fg.sku}) — Stock actual: {fg.current_stock} {fg.unit}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>

                {selectedExistingItem && (
                  <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-3.5 flex items-center justify-between text-xs">
                    <div>
                      <p className="text-neutral-400">Stock actual disponible</p>
                      <p className="text-base font-bold text-white mt-0.5">
                        {Number(selectedExistingItem.current_stock).toLocaleString()}{' '}
                        <span className="text-xs font-normal text-neutral-400">
                          {selectedExistingItem.unit}
                        </span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-neutral-400">Nuevo total tras ingreso</p>
                      <p className="text-base font-bold text-emerald-400 mt-0.5">
                        {(
                          Number(selectedExistingItem.current_stock) + Number(restockQty || 0)
                        ).toLocaleString()}{' '}
                        <span className="text-xs font-normal text-emerald-500/80">
                          {selectedExistingItem.unit}
                        </span>
                      </p>
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-xs font-medium text-neutral-300">
                    Cantidad a Adicionar ({selectedExistingItem?.unit || 'unidades'})
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    required
                    value={restockQty}
                    onChange={(e) => setRestockQty(Number(e.target.value))}
                    className="mt-1.5 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500"
                  />

                  {/* Botones de cantidad rápida */}
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className="text-[11px] text-neutral-500 mr-1">Suma rápida:</span>
                    {[5, 10, 25, 50, 100].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setRestockQty(preset)}
                        className="rounded-md border border-neutral-700 bg-neutral-800/70 px-2 py-1 text-[11px] font-mono text-neutral-300 hover:bg-neutral-700 hover:text-white transition"
                      >
                        +{preset}
                      </button>
                    ))}
                  </div>
                </div>

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
                    disabled={loadingAction || !selectedExistingItemId}
                    style={{ backgroundColor: 'var(--brand-color, #2563eb)' }}
                    className="rounded-lg px-4 py-2 text-xs font-semibold text-white shadow hover:opacity-90 transition disabled:opacity-50"
                  >
                    {loadingAction ? 'Actualizando...' : '+ Sumar al Inventario'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleCreateItem} className="space-y-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-neutral-300">Tipo</label>
                    <select
                      value={type}
                      onChange={(e) => {
                        const newType = e.target.value as 'raw_material' | 'finished_good';
                        setType(newType);
                        setSku(suggestNextSku(newType));
                      }}
                      className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                    >
                      <option value="raw_material">Materia Prima</option>
                      <option value="finished_good">Producto Terminado</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-neutral-300">Código / SKU</label>
                    <input
                      type="text"
                      required
                      placeholder="MP-001"
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-neutral-300">Nombre del Ítem</label>
                  <input
                    type="text"
                    required
                    list="existing-item-names"
                    placeholder="Ej: Miel Pura, Frasco de Vidrio 500ml"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                  />
                  <datalist id="existing-item-names">
                    {items.map((i) => (
                      <option key={i.id} value={i.name} />
                    ))}
                  </datalist>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-neutral-300">Unidad de Medida</label>
                    <select
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                    >
                      {COMMON_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-neutral-300">Stock Inicial</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
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
                      step="any"
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
                    className="rounded-lg px-4 py-2 text-xs font-semibold text-white shadow hover:opacity-90 transition disabled:opacity-50"
                  >
                    {loadingAction ? 'Guardando...' : 'Guardar Nuevo Ítem'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal: Nueva Producción con Previsualización y Configuración de Receta (BOM) */}
      {isProductionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-900 p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-white">Registrar Orden de Producción</h3>
            <p className="text-xs text-neutral-400">
              Selecciona un producto terminado de tu lista para sumar lotes fabricados y descontar automáticamente sus materias primas.
            </p>

            <form onSubmit={handleExecuteProduction} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-neutral-300">Producto a Fabricar</label>
                <select
                  required
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500"
                >
                  <option value="">Selecciona un producto...</option>
                  {finishedGoods.map((prod) => (
                    <option key={prod.id} value={prod.id}>
                      {prod.name} ({prod.sku}) — Stock actual: {prod.current_stock} {prod.unit}
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
                  className="mt-1.5 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                />
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="text-[11px] text-neutral-500 mr-1">Lotes rápidos:</span>
                  {[1, 5, 10, 20, 50].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setProduceQty(preset)}
                      className="rounded-md border border-neutral-700 bg-neutral-800/70 px-2 py-1 text-[11px] font-mono text-neutral-300 hover:bg-neutral-700 hover:text-white transition"
                    >
                      +{preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Receta / Insumos asociados (BOM) */}
              {selectedProduct && (
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-blue-400" />
                      Insumos requeridos para {produceQty} unidad(es)
                    </span>
                  </div>

                  {selectedProductBom.length === 0 ? (
                    <p className="text-[11px] text-neutral-500">
                      Este producto no tiene materias primas vinculadas aún (se sumará al stock directo sin descontar insumos, o puedes vincular un insumo abajo).
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {selectedProductBom.map((line) => {
                        const rm = items.find((i) => i.id === line.raw_material_id);
                        const totalNeeded = Number(line.required_quantity) * Number(produceQty || 0);
                        const available = Number(rm?.current_stock ?? 0);
                        const isShort = available < totalNeeded;
                        return (
                          <div
                            key={line.id}
                            className="flex items-center justify-between rounded-lg bg-neutral-900 px-3 py-2 text-xs border border-neutral-800/80"
                          >
                            <div>
                              <span className="font-medium text-white">
                                {rm?.name || 'Materia prima'}
                              </span>
                              <span className="text-neutral-500 ml-1.5">
                                ({line.required_quantity} {rm?.unit} c/u)
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`font-mono font-semibold ${
                                  isShort ? 'text-red-400' : 'text-emerald-400'
                                }`}
                              >
                                Req: {totalNeeded} / Disp: {available}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveBomLine(line.id)}
                                className="text-neutral-500 hover:text-red-400 transition"
                                title="Quitar de la receta"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Vincular materia prima existente desde dropdown */}
                  {rawMaterials.length > 0 && (
                    <div className="pt-2 border-t border-neutral-800/80 flex flex-col sm:flex-row gap-2">
                      <select
                        value={newBomRawMaterialId}
                        onChange={(e) => setNewBomRawMaterialId(e.target.value)}
                        className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-xs text-white outline-none"
                      >
                        <option value="">+ Vincular materia prima a la receta...</option>
                        {rawMaterials.map((rm) => (
                          <option key={rm.id} value={rm.id}>
                            {rm.name} ({rm.unit})
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="0.01"
                        step="any"
                        placeholder="Cant. x 1"
                        value={newBomQty}
                        onChange={(e) => setNewBomQty(Number(e.target.value))}
                        className="w-24 rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-xs text-white outline-none"
                      />
                      <button
                        type="button"
                        disabled={!newBomRawMaterialId || savingBom}
                        onClick={handleAddBomIngredient}
                        className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700 disabled:opacity-40 transition"
                      >
                        Añadir Insumo
                      </button>
                    </div>
                  )}
                </div>
              )}

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
                  disabled={loadingAction || !selectedProduct}
                  style={{ backgroundColor: 'var(--brand-color, #2563eb)' }}
                  className="rounded-lg px-4 py-2 text-xs font-semibold text-white shadow hover:opacity-90 transition disabled:opacity-50"
                >
                  {loadingAction ? 'Fabricando...' : 'Confirmar y Producir'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Dedicado: Configurar Recetas de Producción (BOM) */}
      {isRecipeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-900 p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-amber-400" />
                  Configurar Recetas de Producción (BOM)
                </h3>
                <p className="text-xs text-neutral-400 mt-1">
                  Define qué materias primas (y en qué cantidad) se descuentan automáticamente por cada 1 unidad fabricada de tu producto terminado.
                </p>
              </div>
            </div>

            {finishedGoods.length === 0 ? (
              <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4 text-xs text-neutral-400">
                Primero debes registrar al menos un ítem de tipo <strong>Producto Terminado</strong> en el inventario para armar su receta.
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-neutral-300">
                    1. Selecciona el Producto Terminado
                  </label>
                  <select
                    value={selectedProduct}
                    onChange={(e) => setSelectedProduct(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500"
                  >
                    <option value="">Selecciona un producto terminado...</option>
                    {finishedGoods.map((prod) => (
                      <option key={prod.id} value={prod.id}>
                        {prod.name} ({prod.sku})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedProduct && (
                  <>
                    <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-4 space-y-3">
                      <h4 className="text-xs font-semibold text-neutral-300">
                        Ingredientes actuales para fabricar 1 unidad:
                      </h4>

                      {selectedProductBom.length === 0 ? (
                        <p className="text-xs text-neutral-500 py-2">
                          Aún no hay materias primas asignadas a este producto. Agrega la primera abajo.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {selectedProductBom.map((line) => {
                            const rm = items.find((i) => i.id === line.raw_material_id);
                            return (
                              <div
                                key={line.id}
                                className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 px-3.5 py-2.5 text-xs"
                              >
                                <div>
                                  <span className="font-semibold text-white">
                                    {rm?.name || 'Materia prima'}
                                  </span>
                                  <span className="text-neutral-500 ml-1.5 font-mono">
                                    ({rm?.sku})
                                  </span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="rounded bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 font-mono text-amber-400">
                                    {line.required_quantity} {rm?.unit}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveBomLine(line.id)}
                                    className="text-neutral-500 hover:text-red-400 transition"
                                    title="Eliminar insumo de la receta"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4 space-y-3">
                      <label className="text-xs font-semibold text-neutral-300 block">
                        2. Agregar Materia Prima a esta Receta
                      </label>

                      {rawMaterials.length === 0 ? (
                        <p className="text-xs text-amber-400">
                          No tienes ítems de tipo &quot;Materia Prima&quot; en tu inventario. Registra primero tus insumos (ej. Frascos, Etiquetas, Miel a granel) para poder agregarlos a la receta.
                        </p>
                      ) : (
                        <div className="flex flex-col sm:flex-row gap-2.5">
                          <select
                            value={newBomRawMaterialId}
                            onChange={(e) => setNewBomRawMaterialId(e.target.value)}
                            className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
                          >
                            <option value="">Selecciona materia prima...</option>
                            {rawMaterials.map((rm) => (
                              <option key={rm.id} value={rm.id}>
                                {rm.name} ({rm.sku}) — en {rm.unit}
                              </option>
                            ))}
                          </select>

                          <input
                            type="number"
                            min="0.01"
                            step="any"
                            placeholder="Cantidad"
                            value={newBomQty}
                            onChange={(e) => setNewBomQty(Number(e.target.value))}
                            className="w-full sm:w-28 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-white outline-none focus:border-blue-500"
                          />

                          <button
                            type="button"
                            disabled={!newBomRawMaterialId || savingBom}
                            onClick={handleAddBomIngredient}
                            style={{ backgroundColor: 'var(--brand-color, #2563eb)' }}
                            className="rounded-lg px-4 py-2 text-xs font-semibold text-white shadow hover:opacity-90 disabled:opacity-40 transition shrink-0"
                          >
                            {savingBom ? 'Agregando...' : '+ Añadir'}
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="flex items-center justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsRecipeModalOpen(false)}
                className="rounded-lg border border-neutral-700 bg-neutral-800 px-5 py-2 text-xs font-semibold text-white hover:bg-neutral-700 transition"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
