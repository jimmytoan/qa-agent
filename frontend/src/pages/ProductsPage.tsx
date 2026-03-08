import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, Trash2, Edit, AlertCircle, Search, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { createProduct, deleteProduct, listProducts, type Product, updateProduct } from '../lib/api'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'

const SELECT_CLS = 'flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
const TEXTAREA_CLS = 'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

type ModalMode = 'create' | 'edit'

export function ProductsPage() {
  const navigate = useNavigate()
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<ModalMode>('create')
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [mName, setMName] = useState('')
  const [mSlug, setMSlug] = useState('')
  const [mDescription, setMDescription] = useState('')

  async function refresh() {
    setLoading(true)
    try { setProducts(await listProducts()); setError(null) }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to load products') }
    finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [])

  function openCreate() {
    setModalMode('create'); setEditingProduct(null)
    setMName(''); setMSlug(''); setMDescription('')
    setModalOpen(true)
  }

  function openEdit(p: Product) {
    setModalMode('edit'); setEditingProduct(p)
    setMName(p.name); setMSlug(p.slug ?? ''); setMDescription(p.description ?? '')
    setModalOpen(true)
  }

  function closeModal() { setModalOpen(false); setEditingProduct(null) }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      if (modalMode === 'create')
        await createProduct({ name: mName, slug: mSlug || undefined, description: mDescription || undefined })
      else if (editingProduct)
        await updateProduct(editingProduct.id, { name: mName, slug: mSlug || undefined, description: mDescription || undefined })
      closeModal()
      await refresh()
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to save product') }
  }

  async function onDelete(productId: number) {
    if (!window.confirm('Delete this product? This also removes related suites and tests.')) return
    try { await deleteProduct(productId); await refresh() }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to delete product') }
  }

  const visibleProducts = useMemo(() => {
    if (!search.trim()) return products
    const q = search.toLowerCase()
    return products.filter((p) => p.name.toLowerCase().includes(q) || (p.slug ?? '').toLowerCase().includes(q))
  }, [products, search])

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Products</h1>
          <p className="text-muted-foreground mt-2">Manage your product catalog.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={refresh} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Create Product
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Search</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              className={`${SELECT_CLS} pl-8 w-56`}
              placeholder="Name or slug…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <CardTitle className="text-base">
            {visibleProducts.length} product{visibleProducts.length !== 1 ? 's' : ''}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="border-t">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleProducts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      {loading ? 'Loading…' : 'No products found.'}
                    </TableCell>
                  </TableRow>
                )}
                {visibleProducts.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="text-muted-foreground">{product.id}</TableCell>
                    <TableCell>
                      <button
                        className="font-semibold text-primary hover:underline flex items-center gap-1 text-left"
                        onClick={() => navigate(`/suites?product_id=${product.id}`)}
                      >
                        {product.name}
                        <ChevronRight className="w-3.5 h-3.5 opacity-50" />
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{product.slug ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground max-w-[300px] truncate" title={product.description ?? ''}>
                      {product.description ?? '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(product)}>
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => onDelete(product.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative z-10 w-full max-w-md bg-background rounded-xl shadow-2xl border p-6 flex flex-col gap-5">
            <div>
              <h2 className="text-lg font-semibold">
                {modalMode === 'create' ? 'Create Product' : 'Edit Product'}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {modalMode === 'create' ? 'Add a new product to your catalog.' : 'Update the product details.'}
              </p>
            </div>
            <form className="flex flex-col gap-4" onSubmit={onSubmit}>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Name <span className="text-destructive">*</span></label>
                <Input placeholder="Product name" value={mName} onChange={(e) => setMName(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">
                  Slug <span className="text-muted-foreground text-xs font-normal">(optional)</span>
                </label>
                <Input placeholder="e.g. my-product" value={mSlug} onChange={(e) => setMSlug(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">
                  Description <span className="text-muted-foreground text-xs font-normal">(optional)</span>
                </label>
                <textarea
                  className={TEXTAREA_CLS}
                  placeholder="Short description"
                  rows={3}
                  value={mDescription}
                  onChange={(e) => setMDescription(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
                <Button type="submit">
                  <Plus className="w-4 h-4 mr-2" />
                  {modalMode === 'create' ? 'Create Product' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
