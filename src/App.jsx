import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";

const ukSizes = ["2.5", "3", "3.5", "4", "4.5", "5", "5.5", "6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11", "11.5", "12", "12.5", "13"];

const makeSizeStock = (overrides = {}) =>
  ukSizes.reduce((acc, size) => {
    acc[size] = overrides[size] ?? 0;
    return acc;
  }, {});

const totalFromSizes = (sizes) => Object.values(sizes || {}).reduce((sum, qty) => sum + Number(qty || 0), 0);

const initialProducts = [
  {
    id: "ART-001",
    articleCode: "NK-AIR-001",
    name: "Sneaker Running Pro",
    category: "Running",
    supplier: "Sport Step",
    minStock: 1,
    price: 89.9,
    stores: {
      centrale: makeSizeStock({ "6": 1, "6.5": 2, "7": 2, "7.5": 2, "8": 3, "8.5": 1 }),
      outlet: makeSizeStock({ "5.5": 1, "6": 1, "7": 1, "8": 2, "9": 1 }),
    },
  },
  {
    id: "ART-002",
    articleCode: "AD-URB-210",
    name: "Scarpa Urban Street",
    category: "Lifestyle",
    supplier: "Urban Feet",
    minStock: 1,
    price: 74.9,
    stores: {
      centrale: makeSizeStock({ "7": 2, "7.5": 2, "8": 2, "8.5": 1, "9": 1 }),
      outlet: makeSizeStock({ "6": 1, "6.5": 1, "7": 1, "9": 2, "9.5": 1 }),
    },
  },
  {
    id: "ART-003",
    articleCode: "NB-TRK-330",
    name: "Scarpa Trekking Trail",
    category: "Outdoor",
    supplier: "Mountain Walk",
    minStock: 1,
    price: 109.9,
    stores: {
      centrale: makeSizeStock({ "8": 1, "8.5": 1, "9": 2, "9.5": 1, "10": 1 }),
      outlet: makeSizeStock({ "7": 1, "8": 1, "10": 1, "10.5": 1, "11": 1 }),
    },
  },
];

const initialMovements = [
  { id: "mov-1", date: "2026-04-21 09:10", type: "Carico", product: "Sneaker Running Pro", articleCode: "NK-AIR-001", size: "8", qty: 3, store: "Negozio San Rocco", note: "Nuovo arrivo fornitore" },
  { id: "mov-2", date: "2026-04-21 10:25", type: "Vendita", product: "Scarpa Urban Street", articleCode: "AD-URB-210", size: "9", qty: 1, store: "Negozio Verona", note: "Vendita in negozio" },
  { id: "mov-3", date: "2026-04-21 11:40", type: "Trasferimento", product: "Scarpa Trekking Trail", articleCode: "NB-TRK-330", size: "10", qty: 1, store: "San Rocco → Verona", note: "Ribilanciamento stock" },
  { id: "mov-4", date: "2026-04-20 16:20", type: "Vendita", product: "Sneaker Running Pro", articleCode: "NK-AIR-001", size: "7", qty: 2, store: "Negozio San Rocco", note: "Vendita in negozio" },
  { id: "mov-5", date: "2026-04-18 17:05", type: "Vendita online", product: "Scarpa Trekking Trail", articleCode: "NB-TRK-330", size: "10.5", qty: 1, store: "E-commerce", note: "Ordine online" },
];

const storeMeta = {
  centrale: { label: "Negozio San Rocco", short: "San Rocco" },
  outlet: { label: "Negozio Verona", short: "Verona" },
};

function formatDate(date = new Date()) {
  return new Intl.DateTimeFormat("it-IT", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const parseMovementDate = (value) => {
  if (!value) return null;

  // formato ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const normalized = value.replace(" ", "T");
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // formato italiano
  const cleaned = value.replace(",", "");
  const match = cleaned.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (match) {
    const [, day, month, year, hour = "0", minute = "0", second = "0"] = match;
    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
};

function buildRowsForPrint(products) {
  return products.flatMap((product) => [
    {
      code: product.articleCode,
      name: product.name,
      store: "Negozio San Rocco",
      sizes: ukSizes.map((size) => product.stores?.centrale?.[size] ?? 0),
      total: totalFromSizes(product.stores?.centrale),
    },
    {
      code: product.articleCode,
      name: product.name,
      store: "Negozio Verona",
      sizes: ukSizes.map((size) => product.stores?.outlet?.[size] ?? 0),
      total: totalFromSizes(product.stores?.outlet),
    },
  ]);
}

function StatCard({ title, value, subtitle }) {
  return (
    <div className="stat-card">
      <div className="stat-title">{title}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-subtitle">{subtitle}</div>
    </div>
  );
}

function SizeGrid({ title, sizes, minStock = 1 }) {
  return (
    <div className="size-grid-card">
      <div className="size-grid-header">
        <strong>{title}</strong>
        <span>Taglie UK 2.5–13</span>
      </div>
      <div className="size-grid">
        {ukSizes.map((size) => {
          const qty = sizes?.[size] ?? 0;
          const low = qty < minStock;
          return (
            <div key={size} className={`size-cell ${low ? "low" : ""}`}>
              <div className="size-label">UK {size}</div>
              <div className="size-qty">{qty}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function App() {
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [queryText, setQueryText] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedArticleIds, setSelectedArticleIds] = useState([]);
  const [salesPeriod, setSalesPeriod] = useState("today");
  const [customDateFrom, setCustomDateFrom] = useState("2026-04-01");
  const [customDateTo, setCustomDateTo] = useState("2026-04-21");
  const [currentPage, setCurrentPage] = useState("home");
  const [workspaceTab, setWorkspaceTab] = useState("inventario");
  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [articleDialogOpen, setArticleDialogOpen] = useState(false);
  const [articleToDelete, setArticleToDelete] = useState(null);
  const [syncStatus, setSyncStatus] = useState("Connessione al database...");

  const [newArticle, setNewArticle] = useState({
    id: "",
    articleCode: "",
    name: "",
    category: "",
    supplier: "",
    price: "",
  });

  const [newMovement, setNewMovement] = useState({
    productId: "",
    action: "carico",
    qty: 1,
    size: "8",
    store: "centrale",
    fromStore: "centrale",
    toStore: "outlet",
    note: "",
  });

  useEffect(() => {
    const unsubProducts = onSnapshot(collection(db, "products"), (snapshot) => {
      const list = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      setProducts(list);
      if (list.length && !newMovement.productId) {
        setNewMovement((prev) => ({ ...prev, productId: list[0].id }));
      }
      setSyncStatus("Sincronizzazione attiva");
    }, () => {
      setSyncStatus("Errore di sincronizzazione");
    });

    const unsubMovements = onSnapshot(query(collection(db, "movements"), orderBy("createdAt", "desc")), (snapshot) => {
      const list = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      setMovements(list);
    });

    return () => {
      unsubProducts();
      unsubMovements();
    };
  }, []);

  const seedDatabase = async () => {
    setSyncStatus("Caricamento dati demo...");
    for (const product of initialProducts) {
      await setDoc(doc(db, "products", product.id), product);
    }
    for (const movement of initialMovements) {
      const { id, ...data } = movement;
      await setDoc(doc(db, "movements", id), {
        ...data,
        createdAt: new Date(),
      });
    }
    setSyncStatus("Dati demo caricati");
  };

  const createArticle = async () => {
    if (!newArticle.articleCode || !newArticle.name) return; 
    const codeExists = products.some(
    (p) =>
      p.articleCode?.toLowerCase() ===
      newArticle.articleCode.trim().toLowerCase()
  );

  if (codeExists) {
    alert("Esiste già un articolo con questo codice articolo.");
    return;
  }
  const normalizedId =
  newArticle.id?.trim() || `ART-${Date.now()}`;
    const article = {
      id: normalizedId,
      articleCode: newArticle.articleCode,
      name: newArticle.name,
      category: newArticle.category || "Calzature",
      supplier: newArticle.supplier || "",
      minStock: 1,
      price: Number(newArticle.price || 0),
      stores: { centrale: makeSizeStock(), outlet: makeSizeStock() },
    };
    await setDoc(doc(db, "products", article.id), article);
    setNewArticle({ id: "", articleCode: "", name: "", category: "", supplier: "", price: "" });
    setArticleDialogOpen(false);
  };

  const requestDeleteArticle = (id) => setArticleToDelete(id);
  const cancelDeleteArticle = () => setArticleToDelete(null);

  const confirmDeleteArticle = async () => {
    if (!articleToDelete) return;
    const productToDelete = products.find((p) => p.id === articleToDelete);
    await deleteDoc(doc(db, "products", articleToDelete));
    if (productToDelete) {
      const snap = await getDocs(collection(db, "movements"));
      const deletions = snap.docs
        .filter((item) => item.data().articleCode === productToDelete.articleCode)
        .map((item) => deleteDoc(doc(db, "movements", item.id)));
      await Promise.all(deletions);
    }
    setSelectedArticleIds((prev) => prev.filter((item) => item !== articleToDelete));
    setArticleToDelete(null);
  };

  const openMovementForArticle = (productId, action) => {
    const product = products.find((p) => p.id === productId);
    const preferredSize = ukSizes.find(
      (size) => (product?.stores?.centrale?.[size] ?? 0) > 0 || (product?.stores?.outlet?.[size] ?? 0) > 0
    ) || "8";
    setNewMovement({
      productId,
      action,
      qty: 1,
      size: preferredSize,
      store: "centrale",
      fromStore: "centrale",
      toStore: "outlet",
      note: "",
    });
    setMovementDialogOpen(true);
  };

  const addMovement = async () => {
    const qty = Number(newMovement.qty);
    if (!qty || qty <= 0) return;
    const product = products.find((p) => p.id === newMovement.productId);
    if (!product) return;
    if (newMovement.action === "trasferimento" && newMovement.fromStore === newMovement.toStore) return;

    const updated = {
      ...product,
      stores: {
        centrale: { ...product.stores.centrale },
        outlet: { ...product.stores.outlet },
      },
    };

    let movementLabel = "";
    let movementStore = "";
    let appliedQty = qty;

    if (newMovement.action === "carico") {
      updated.stores[newMovement.store][newMovement.size] += qty;
      movementLabel = "Carico";
      movementStore = storeMeta[newMovement.store].label;
    }
    if (newMovement.action === "scarico") {
      const available = updated.stores[newMovement.store][newMovement.size];
      appliedQty = Math.min(available, qty);
      if (appliedQty <= 0) return;
      updated.stores[newMovement.store][newMovement.size] = Math.max(0, available - appliedQty);
      movementLabel = "Scarico";
      movementStore = storeMeta[newMovement.store].label;
    }
    if (newMovement.action === "vendita") {
      const available = updated.stores[newMovement.store][newMovement.size];
      appliedQty = Math.min(available, qty);
      if (appliedQty <= 0) return;
      updated.stores[newMovement.store][newMovement.size] = Math.max(0, available - appliedQty);
      movementLabel = "Vendita";
      movementStore = storeMeta[newMovement.store].label;
    }
    if (newMovement.action === "vendita_online") {
      const available = updated.stores[newMovement.store][newMovement.size];
      appliedQty = Math.min(available, qty);
      if (appliedQty <= 0) return;
      updated.stores[newMovement.store][newMovement.size] = Math.max(0, available - appliedQty);
      movementLabel = "Vendita online";
      movementStore = "E-commerce";
    }
    if (newMovement.action === "trasferimento") {
      const available = updated.stores[newMovement.fromStore][newMovement.size];
      appliedQty = Math.min(available, qty);
      if (appliedQty <= 0) return;
      updated.stores[newMovement.fromStore][newMovement.size] -= appliedQty;
      updated.stores[newMovement.toStore][newMovement.size] += appliedQty;
      movementLabel = "Trasferimento";
      movementStore = `${storeMeta[newMovement.fromStore].short} → ${storeMeta[newMovement.toStore].short}`;
    }

    await setDoc(doc(db, "products", updated.id), updated);
    await addDoc(collection(db, "movements"), {
      date: formatDate(new Date()),
      type: movementLabel,
      product: updated.name,
      articleCode: updated.articleCode,
      size: newMovement.size,
      qty: appliedQty,
      store: movementStore,
      note: newMovement.note || "Operazione manuale",
      createdAt: new Date(),
    });

    setNewMovement((prev) => ({ ...prev, qty: 1, note: "" }));
    setMovementDialogOpen(false);
  };

  const toggleArticleSelection = (id) => {
    setSelectedArticleIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const exportInventoryPdf = (mode = "all") => {
    const rowsSource = mode === "selected" ? products.filter((p) => selectedArticleIds.includes(p.id)) : products;
    if (mode === "selected" && selectedArticleIds.length === 0) {
      window.alert("Seleziona almeno un articolo prima di generare il PDF degli articoli selezionati.");
      return;
    }
    if (!rowsSource.length) {
      window.alert("Non ci sono articoli da esportare.");
      return;
    }
    const rows = buildRowsForPrint(rowsSource);
    const title = mode === "selected" ? "Inventario articoli selezionati" : "Inventario completo";
    const printWindow = window.open("", "_blank", "width=1400,height=900");
    if (!printWindow) {
      window.alert("Il browser sta bloccando il popup di stampa.");
      return;
    }
    const tableHead = `
      <tr>
        <th>Codice</th>
        <th>Articolo</th>
        <th>Negozio</th>
        ${ukSizes.map((size) => `<th>UK ${size}</th>`).join("")}
        <th>Totale</th>
      </tr>`;
    const tableBody = rows.map((row) => `
      <tr>
        <td>${row.code}</td>
        <td>${row.name}</td>
        <td>${row.store}</td>
        ${row.sizes.map((qty) => `<td>${qty}</td>`).join("")}
        <td><strong>${row.total}</strong></td>
      </tr>`).join("");

    printWindow.document.write(`
      <html><head><title>${title}</title>
      <style>
      @page {
  size: A4 landscape;
  margin: 10mm;
}
      body { font-family: Arial, sans-serif; margin: 20px; }
      table {
  width: 100%;
  border-collapse: collapse;
  table-layout: auto;
}

th, td {
  border: 1px solid #cbd5e1;
  padding: 5px 6px;
  font-size: 9px;
  text-align: center;
  white-space: nowrap;
}

th:nth-child(1), td:nth-child(1) {
  min-width: 70px;
}

th:nth-child(2), td:nth-child(2) {
  min-width: 140px;
  text-align: left;
}

th:nth-child(3), td:nth-child(3) {
  min-width: 80px;
  text-align: left;
}

th:nth-child(4), td:nth-child(4) {
  min-width: 110px;
  text-align: left;
}

th:last-child, td:last-child {
  min-width: 55px;
  font-weight: bold;
}
      th { background: #166534; color: white; }
      td:nth-child(2), td:nth-child(3), td:nth-child(4) { text-align: left; }
      </style></head><body>
      <h1>${title}</h1>
      <p>Data export: ${formatDate(new Date())} · Articoli inclusi: ${rowsSource.length}</p>
      <table><thead>${tableHead}</thead><tbody>${tableBody}</tbody></table>
      <script>window.onload = function(){ window.print(); }</script>
      </body></html>
    `);
    printWindow.document.close();
  };

  const categories = useMemo(() => ["all", ...Array.from(new Set(products.map((p) => p.category)))], [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesQuery = [p.name, p.id, p.articleCode, p.category, p.supplier].join(" ").toLowerCase().includes(queryText.toLowerCase());
      const matchesCategory = categoryFilter === "all" || p.category === categoryFilter;
      return matchesQuery && matchesCategory;
    });
  }, [products, queryText, categoryFilter]);

  const totals = useMemo(() => {
    const centrale = products.reduce((sum, p) => sum + totalFromSizes(p.stores?.centrale), 0);
    const outlet = products.reduce((sum, p) => sum + totalFromSizes(p.stores?.outlet), 0);
    const lowStock = products.filter((p) => ukSizes.some((size) => (p.stores?.centrale?.[size] ?? 0) < p.minStock) || ukSizes.some((size) => (p.stores?.outlet?.[size] ?? 0) < p.minStock)).length;
    const totalValue = products.reduce((sum, p) => sum + (totalFromSizes(p.stores?.centrale) + totalFromSizes(p.stores?.outlet)) * Number(p.price || 0), 0);
    return { centrale, outlet, lowStock, totalValue };
  }, [products]);

  const salesMovements = useMemo(() => movements.filter((m) => m.type === "Vendita" || m.type === "Vendita online"), [movements]);

   const filteredSales = useMemo(() => {
  return salesMovements.filter((sale) => {
    if (!sale.createdAt) return false;

    const saleDate = sale.createdAt.toDate
      ? sale.createdAt.toDate()
      : new Date(sale.createdAt);

    const now = new Date();

    if (salesPeriod === "today") {
      return saleDate.toDateString() === now.toDateString();
    }

    if (salesPeriod === "7days") {
      const last7 = new Date();
      last7.setDate(now.getDate() - 7);
      return saleDate >= last7;
    }

    if (salesPeriod === "30days") {
      const last30 = new Date();
      last30.setDate(now.getDate() - 30);
      return saleDate >= last30;
    }

    if (salesPeriod === "custom") {
      const start = customDateFrom
        ? new Date(`${customDateFrom}T00:00:00`)
        : null;
      const end = customDateTo
        ? new Date(`${customDateTo}T23:59:59`)
        : null;

      if (start && saleDate < start) return false;
      if (end && saleDate > end) return false;
    }

    return true;
  });
}, [salesMovements, salesPeriod, customDateFrom, customDateTo]);

  const salesSummary = useMemo(() => {
    const totalPairs = filteredSales.reduce((sum, sale) => sum + Number(sale.qty || 0), 0);
    const totalRevenue = filteredSales.reduce((sum, sale) => {
      const product = products.find((p) => p.articleCode === sale.articleCode);
      return sum + Number(sale.qty || 0) * Number(product?.price || 0);
    }, 0);
    const uniqueArticles = new Set(filteredSales.map((sale) => sale.articleCode)).size;
    const storeSales = filteredSales.filter((sale) => sale.type === "Vendita").reduce((sum, sale) => sum + Number(sale.qty || 0), 0);
    const onlineSales = filteredSales.filter((sale) => sale.type === "Vendita online").reduce((sum, sale) => sum + Number(sale.qty || 0), 0);
    return { totalPairs, totalRevenue, uniqueArticles, storeSales, onlineSales };
  }, [filteredSales, products]);

  const salesByArticle = useMemo(() => {
    const map = new Map();
    filteredSales.forEach((sale) => {
      const current = map.get(sale.articleCode) || { articleCode: sale.articleCode, product: sale.product, qty: 0, revenue: 0 };
      const product = products.find((p) => p.articleCode === sale.articleCode);
      current.qty += Number(sale.qty || 0);
      current.revenue += Number(sale.qty || 0) * Number(product?.price || 0);
      map.set(sale.articleCode, current);
    });
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty);
  }, [filteredSales, products]);

  return (
    <div className="app-shell">
      <div className="container">
        {currentPage === "home" ? (
          <div className="hero">
            <div className="hero-overlay"></div>
            <div className="hero-content">
              <img src="https://www.gronell.it/image/catalog/logo-Gronell.png" alt="Gronell" className="hero-logo" />
              <h1>Portale operativo Gronell</h1>
              <p>Accesso rapido alla gestione del magazzino e alla consultazione di movimenti e vendite.</p>
              <div className="status-row">
                <span className="status-pill">{syncStatus}</span>
                
              </div>
              <div className="home-grid">
                <button className="home-card" onClick={() => { setWorkspaceTab("inventario"); setCurrentPage("app"); }}>
                  <h2>Gestione magazzino</h2>
                  <p>Consulta inventario, articoli, taglie e trasferimenti.</p>
                </button>
                <button className="home-card" onClick={() => { setWorkspaceTab("movimenti"); setCurrentPage("app"); }}>
                  <h2>Consulta movimenti e vendite</h2>
                  <p>Visualizza lo storico e monitora vendite negozio e online.</p>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="topbar">
              <div>
                <div className="topbar-actions">
                  <button className="btn btn-outline" onClick={() => setCurrentPage("home")}>Home</button>
                  <span className="status-pill">{syncStatus}</span>
                </div>
                <h1>Gestione Magazzino Calzature</h1>
                <p>Controllo scorte per codice articolo, taglie UK, movimenti, vendite e trasferimenti tra due negozi.</p>
              </div>
              <div className="toolbar">
                <button className="btn btn-outline" onClick={() => exportInventoryPdf("all")}>PDF inventario completo</button>
                <button className="btn btn-outline" onClick={() => exportInventoryPdf("selected")}>PDF articoli selezionati</button>
                <button className="btn btn-outline" onClick={() => setArticleDialogOpen(true)}>Nuovo articolo</button>
                <button className="btn" onClick={() => setMovementDialogOpen(true)}>Nuovo movimento</button>
              </div>
            </div>

            <div className="stats-grid">
              <StatCard title="Stock totale San Rocco" value={totals.centrale} subtitle="Paia disponibili" />
              <StatCard title="Stock totale Verona" value={totals.outlet} subtitle="Paia disponibili" />
              <StatCard title="Articoli sotto scorta" value={totals.lowStock} subtitle="Almeno una taglia da rivedere" />
              <StatCard title="Valore inventario" value={`€ ${totals.totalValue.toFixed(2)}`} subtitle="Stima totale a prezzo di vendita" />
            </div>

            <div className="tabs">
              {[
                ["inventario", "Inventario"],
                ["movimenti", "Movimenti"],
                ["vendite", "Vendite"],
                ["alert", "Alert scorte"],
              ].map(([key, label]) => (
                <button key={key} className={`tab ${workspaceTab === key ? "active" : ""}`} onClick={() => setWorkspaceTab(key)}>{label}</button>
              ))}
            </div>

            {workspaceTab === "inventario" && (
              <div className="panel-stack">
                <div className="panel filters">
                  <input className="input" value={queryText} onChange={(e) => setQueryText(e.target.value)} placeholder="Cerca per nome, codice articolo, ID, categoria, fornitore" />
                  <select className="input" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                    {categories.map((category) => <option key={category} value={category}>{category === "all" ? "Tutte le categorie" : category}</option>)}
                  </select>
                </div>
                {filteredProducts.map((product) => {
                  const total = totalFromSizes(product.stores?.centrale) + totalFromSizes(product.stores?.outlet);
                  return (
                    <div key={product.id} className="panel product-card">
                      <div className="product-meta">
                        <label className="check-row"><input type="checkbox" checked={selectedArticleIds.includes(product.id)} onChange={() => toggleArticleSelection(product.id)} /> Seleziona per PDF</label>
                        <h3>{product.name}</h3>
                        <div className="muted">Codice articolo: {product.articleCode}</div>
                        <div className="muted">Categoria: {product.category}</div>
                        <div className="muted">Fornitore: {product.supplier || "—"}</div>
                        <div className="muted">Prezzo: € {Number(product.price || 0).toFixed(2)} · Totale paia: {total}</div>
                      </div>
                      <div className="product-stock">
                        <SizeGrid title="Negozio San Rocco" sizes={product.stores?.centrale} minStock={product.minStock} />
                        <SizeGrid title="Negozio Verona" sizes={product.stores?.outlet} minStock={product.minStock} />
                      </div>
                      <div className="product-actions">
                        <button className="btn btn-outline" onClick={() => openMovementForArticle(product.id, "carico")}>Carico</button>
                        <button className="btn btn-outline" onClick={() => openMovementForArticle(product.id, "scarico")}>Scarico</button>
                        <button className="btn" onClick={() => openMovementForArticle(product.id, "vendita")}>Vendita</button>
                        <button className="btn" onClick={() => openMovementForArticle(product.id, "vendita_online")}>Vendita online</button>
                        <button className="btn" onClick={() => openMovementForArticle(product.id, "trasferimento")}>Trasferisci</button>
                        <button className="btn btn-danger" onClick={() => requestDeleteArticle(product.id)}>Cancella</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {workspaceTab === "movimenti" && (
              <div className="panel">
                <h2>Storico movimenti</h2>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Data</th><th>Tipo</th><th>Prodotto</th><th>Codice</th><th>Taglia</th><th>Q.tà</th><th>Negozio</th><th>Nota</th></tr>
                    </thead>
                    <tbody>
                      {movements.map((m) => (
                        <tr key={m.id}>
                          <td>{m.date}</td><td>{m.type}</td><td>{m.product}</td><td>{m.articleCode}</td><td>UK {m.size}</td><td>{m.qty}</td><td>{m.store}</td><td>{m.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {workspaceTab === "vendite" && (
              <div className="panel-stack">
                <div className="panel filters">
                  <select className="input" value={salesPeriod} onChange={(e) => setSalesPeriod(e.target.value)}>
                    <option value="today">Vendite del giorno</option>
                    <option value="7days">Ultimi 7 giorni</option>
                    <option value="30days">Ultimi 30 giorni</option>
                    <option value="custom">Periodo personalizzato</option>
                  </select>
                  {salesPeriod === "custom" && (
                    <>
                      <input className="input" type="date" value={customDateFrom} onChange={(e) => setCustomDateFrom(e.target.value)} />
                      <input className="input" type="date" value={customDateTo} onChange={(e) => setCustomDateTo(e.target.value)} />
                    </>
                  )}
                </div>
                <div className="stats-grid sales-grid">
                  <StatCard title="Paia vendute" value={salesSummary.totalPairs} subtitle="Nel periodo selezionato" />
                  <StatCard title="Ricavo stimato" value={`€ ${salesSummary.totalRevenue.toFixed(2)}`} subtitle="Calcolato sui prezzi articolo" />
                  <StatCard title="Articoli venduti" value={salesSummary.uniqueArticles} subtitle="Codici articolo distinti" />
                  <StatCard title="Vendite negozio" value={salesSummary.storeSales} subtitle="Paia vendute in store" />
                  <StatCard title="Vendite online" value={salesSummary.onlineSales} subtitle="Paia vendute e-commerce" />
                </div>
                <div className="panel">
                  <h2>Riepilogo vendite per articolo</h2>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Codice</th><th>Articolo</th><th>Paia vendute</th><th>Ricavo stimato</th></tr></thead>
                      <tbody>
                        {salesByArticle.map((item) => (
                          <tr key={item.articleCode}><td>{item.articleCode}</td><td>{item.product}</td><td>{item.qty}</td><td>€ {item.revenue.toFixed(2)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {workspaceTab === "alert" && (
              <div className="alert-grid">
                {products
                  .filter((p) => ukSizes.some((size) => (p.stores?.centrale?.[size] ?? 0) < p.minStock) || ukSizes.some((size) => (p.stores?.outlet?.[size] ?? 0) < p.minStock))
                  .map((item) => (
                    <div key={item.id} className="panel">
                      <h3>{item.name}</h3>
                      <div className="muted">Codice articolo: {item.articleCode}</div>
                      <SizeGrid title="Negozio San Rocco" sizes={item.stores?.centrale} minStock={item.minStock} />
                      <SizeGrid title="Negozio Verona" sizes={item.stores?.outlet} minStock={item.minStock} />
                    </div>
                  ))}
              </div>
            )}
          </>
        )}

        {articleDialogOpen && (
          <div className="modal-backdrop">
            <div className="modal">
              <h2>Aggiungi nuovo codice articolo</h2>
              <div className="form-grid">
                <input className="input" value={newArticle.id} onChange={(e) => setNewArticle((s) => ({ ...s, id: e.target.value }))} placeholder="ID interno (facoltativo)" />
                <input className="input" value={newArticle.articleCode} onChange={(e) => setNewArticle((s) => ({ ...s, articleCode: e.target.value }))} placeholder="Codice articolo" />
                <input className="input full" value={newArticle.name} onChange={(e) => setNewArticle((s) => ({ ...s, name: e.target.value }))} placeholder="Nome modello" />
                <input className="input" value={newArticle.category} onChange={(e) => setNewArticle((s) => ({ ...s, category: e.target.value }))} placeholder="Categoria" />
                <input className="input" value={newArticle.supplier} onChange={(e) => setNewArticle((s) => ({ ...s, supplier: e.target.value }))} placeholder="Fornitore" />
                <input className="input" type="number" value={newArticle.price} onChange={(e) => setNewArticle((s) => ({ ...s, price: e.target.value }))} placeholder="Prezzo" />
              </div>
              <div className="modal-actions">
                <button className="btn btn-outline" onClick={() => setArticleDialogOpen(false)}>Annulla</button>
                <button className="btn" onClick={createArticle}>Salva articolo</button>
              </div>
            </div>
          </div>
        )}

        {movementDialogOpen && (
          <div className="modal-backdrop">
            <div className="modal">
              <h2>Registra movimento di magazzino</h2>
              <div className="form-grid">
                <select className="input full" value={newMovement.productId} onChange={(e) => setNewMovement((s) => ({ ...s, productId: e.target.value }))}>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.articleCode} · {p.name}</option>)}
                </select>
                <select className="input" value={newMovement.action} onChange={(e) => setNewMovement((s) => ({ ...s, action: e.target.value }))}>
                  <option value="carico">Carico</option>
                  <option value="scarico">Scarico</option>
                  <option value="vendita">Vendita</option>
                  <option value="vendita_online">Vendita online</option>
                  <option value="trasferimento">Trasferimento</option>
                </select>
                <input className="input" type="number" min="1" value={newMovement.qty} onChange={(e) => setNewMovement((s) => ({ ...s, qty: e.target.value }))} />
                <select className="input" value={newMovement.size} onChange={(e) => setNewMovement((s) => ({ ...s, size: e.target.value }))}>
                  {ukSizes.map((size) => <option key={size} value={size}>UK {size}</option>)}
                </select>
                {newMovement.action !== "trasferimento" ? (
                  <select className="input" value={newMovement.store} onChange={(e) => setNewMovement((s) => ({ ...s, store: e.target.value }))}>
                    <option value="centrale">Negozio San Rocco</option>
                    <option value="outlet">Negozio Verona</option>
                  </select>
                ) : (
                  <>
                    <select className="input" value={newMovement.fromStore} onChange={(e) => setNewMovement((s) => ({ ...s, fromStore: e.target.value }))}>
                      <option value="centrale">Da San Rocco</option>
                      <option value="outlet">Da Verona</option>
                    </select>
                    <select className="input" value={newMovement.toStore} onChange={(e) => setNewMovement((s) => ({ ...s, toStore: e.target.value }))}>
                      <option value="centrale">A San Rocco</option>
                      <option value="outlet">A Verona</option>
                    </select>
                  </>
                )}
                <input className="input full" value={newMovement.note} onChange={(e) => setNewMovement((s) => ({ ...s, note: e.target.value }))} placeholder="Nota" />
              </div>
              <div className="modal-actions">
                <button className="btn btn-outline" onClick={() => setMovementDialogOpen(false)}>Annulla</button>
                <button className="btn" onClick={addMovement}>Salva movimento</button>
              </div>
            </div>
          </div>
        )}

        {articleToDelete && (
          <div className="modal-backdrop">
            <div className="modal small">
              <h2>Conferma cancellazione</h2>
              <p>Sei sicuro di voler cancellare questo articolo? L'operazione non è reversibile.</p>
              <div className="modal-actions">
                <button className="btn btn-outline" onClick={cancelDeleteArticle}>Annulla</button>
                <button className="btn btn-danger" onClick={confirmDeleteArticle}>Cancella articolo</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
