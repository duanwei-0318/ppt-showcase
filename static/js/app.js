// ===== State =====
let currentProducts = [];
let favorites = [];
let currentCategory = "";

// ===== Toast =====
function showToast(msg, type) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.className = "toast show " + (type || "info");
    clearTimeout(t._hide);
    t._hide = setTimeout(() => t.classList.remove("show"), 2500);
}

// ===== API Helpers =====
async function api(url, opts) {
    const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
    if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error || "请求失败"); }
    return res.json();
}

// ===== Admin Login =====
function showAdminLogin() {
    document.getElementById("adminLoginModal").classList.add("open");
    document.getElementById("adminPassword").value = "";
    document.getElementById("adminLoginError").style.display = "none";
    setTimeout(() => document.getElementById("adminPassword").focus(), 100);
}

function hideAdminLogin() {
    document.getElementById("adminLoginModal").classList.remove("open");
}

async function doAdminLogin() {
    const pw = document.getElementById("adminPassword").value;
    const err = document.getElementById("adminLoginError");
    if (!pw) { err.textContent = "请输入密码"; err.style.display = "block"; return; }
    try {
        const r = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: pw }) });
        if (r.ok) {
            hideAdminLogin();
            showToast("登录成功，即将跳转", "success");
            setTimeout(() => window.location.href = "/admin", 600);
        }
    } catch (e) {
        err.textContent = e.message || "密码错误";
        err.style.display = "block";
    }
}

// ===== Search =====
function toggleClearButton() {
    const input = document.getElementById("searchInput");
    const clear = document.getElementById("searchClear");
    if (clear) clear.classList.toggle("show", input.value.length > 0);
}

function toggleFilterDrawer() {
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('show');
    document.body.classList.toggle('no-scroll');
}

function clearSearch() {
    const input = document.getElementById("searchInput");
    input.value = "";
    toggleClearButton();
    loadProducts();
    input.focus();
}

// ===== Load Products =====
async function loadProducts() {
    const params = new URLSearchParams();
    if (currentCategory) params.set("category", currentCategory);
    const search = document.getElementById("searchInput").value.trim();
    if (search) params.set("search", search);
    const priceMin = document.getElementById("priceMin").value;
    if (priceMin) params.set("price_min", priceMin);
    const priceMax = document.getElementById("priceMax").value;
    if (priceMax) params.set("price_max", priceMax);

    const products = await api("/api/products?" + params.toString());
    currentProducts = products;
    renderProducts(products);
    document.getElementById("productCount").textContent = "共 " + products.length + " 个产品";
}

// ===== Render Products =====
function renderProducts(products) {
    const grid = document.getElementById("productGrid");
    if (!products.length) {
        grid.innerHTML = `<div class="empty-state"><div class="icon">📦</div><p>暂无匹配产品</p></div>`;
        return;
    }
    grid.innerHTML = products.map(p => {
        const isFav = favorites.includes(p.id);
        const priceDisplay = p.price > 0 ? "¥" + parseFloat(p.price).toFixed(2) : "价格待询";
        const priceClass = p.price > 0 ? "" : "free";
        const imgHtml = p.images && p.images.length
            ? `<img src="/${p.images[0]}" alt="${p.title}" loading="lazy" onerror="this.parentElement.innerHTML='<span class=\\'no-image\\'>📄</span>'">`
            : `<span class="no-image">📄</span>`;
        return `<div class="product-card" onclick="openProductDetail('${p.id}')">
            <div class="product-card-image">${imgHtml}</div>
            <div class="product-card-body">
                <div class="product-card-title">${escapeHtml(p.title)}</div>
                <div class="product-card-price ${priceClass}">${priceDisplay}</div>
                
                <div class="product-card-footer">
                    <span></span>
                    <button class="btn-fav ${isFav ? "active" : ""}" onclick="event.stopPropagation(); toggleFav('${p.id}')">
                        ${isFav ? "♥" : "♡"} ${isFav ? "已收藏" : "收藏"}
                    </button>
                </div>
            </div>
        </div>`;
    }).join("");
}

function escapeHtml(t) {
    const d = document.createElement("div");
    d.textContent = t;
    return d.innerHTML;
}

// ===== Categories =====
async function loadCategories() {
    const cats = await api("/api/categories");
    const list = document.getElementById("categoryList");
    let html = `<li class="${!currentCategory ? "active" : ""}" data-category="" onclick="selectCategory('')">全部</li>`;
    cats.forEach(c => {
        html += `<li class="${currentCategory === c.name ? "active" : ""}" data-category="${c.name}" onclick="selectCategory('${c.name}')">${c.name}</li>`;
    });
    list.innerHTML = html;
}

function selectCategory(cat) {
    currentCategory = cat;
    document.querySelectorAll("#categoryList li").forEach(li => {
        li.classList.toggle("active", li.dataset.category === cat);
    });
    loadProducts();
}

// ===== Search Input =====
document.addEventListener("DOMContentLoaded", () => {
    let searchTimer;
    const searchInput = document.getElementById("searchInput");
    if (searchInput) {
        searchInput.addEventListener("input", () => {
            toggleClearButton();
            clearTimeout(searchTimer);
            searchTimer = setTimeout(loadProducts, 300);
        });
        searchInput.addEventListener("keydown", (e) => {
            if (e.key === "Escape") clearSearch();
        });
    }
    const priceMin = document.getElementById("priceMin");
    const priceMax = document.getElementById("priceMax");
    if (priceMin) priceMin.addEventListener("change", loadProducts);
    if (priceMax) priceMax.addEventListener("change", loadProducts);
});

function applyFilters() { loadProducts(); }

// ===== Favorites =====
async function loadFavorites() {
    const prods = await api("/api/favorites");
    favorites = prods.map(p => p.id);
    document.getElementById("favBadge").textContent = favorites.length;
    const favList = document.getElementById("favList");
    const exportBtn = document.getElementById("exportBtn");
    if (!prods.length) {
        favList.innerHTML = `<div class="empty-state" style="padding:30px 20px;"><p>暂无收藏产品</p></div>`;
        exportBtn.disabled = true;
        return;
    }
    exportBtn.disabled = false; document.getElementById("clearFavBtn").disabled = false;
    favList.innerHTML = prods.map(p => {
        const imgHtml = p.images && p.images.length
            ? `<img src="/${p.images[0]}" alt="" onerror="this.parentElement.innerHTML='📄'">`
            : "📄";
        const price = p.price > 0 ? "¥" + parseFloat(p.price).toFixed(2) : "待询";
        return `<div class="fav-item">
            <div class="fav-item-img">${imgHtml}</div>
            <div class="fav-item-info">
                <div class="fav-item-title">${escapeHtml(p.title)}</div>
                <div class="fav-item-price">${price}</div>
            </div>
            <button class="fav-item-remove" onclick="removeFav('${p.id}')">×</button>
        </div>`;
    }).join("");
    renderProducts(currentProducts);
}

async function toggleFav(productId) {
    if (favorites.includes(productId)) {
        await api("/api/favorites/" + productId, { method: "DELETE" });
        showToast("已移除收藏", "info");
    } else {
        await api("/api/favorites", { method: "POST", body: JSON.stringify({ product_id: productId }) });
        showToast("已添加收藏", "success");
    }
    await loadFavorites();
}

async function removeFav(productId) {
    await api("/api/favorites/" + productId, { method: "DELETE" });
    showToast("已移除收藏", "info");
    await loadFavorites();
}

async function clearAllFavorites() {
    if (!confirm("确定清空所有收藏？")) return;
    try {
        await api("/api/favorites", { method: "DELETE" });
        showToast("已清空全部收藏", "info");
        await loadFavorites();
    } catch (e) {
        showToast(e.message || "清空失败", "error");
    }
}

function toggleFavPanel() {
    document.getElementById("favPanel").classList.toggle("open");
}

async function exportFavorites() {
    const btn = document.getElementById("exportBtn");
    btn.textContent = "生成中...";
    btn.disabled = true;
    try {
        const res = await fetch("/api/favorites/export", { method: "POST" });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "产品收藏夹.pdf";
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("PDF 导出成功", "success");
    } catch (e) {
        showToast(e.message, "error");
    }
    btn.textContent = "导出为 PDF";
    btn.disabled = false;
}

// ===== Product Detail Modal =====
async function openProductDetail(productId) {
    const prod = currentProducts.find(p => p.id === productId);
    if (!prod) return;
    const body = document.getElementById("modalBody");
    const priceDisplay = prod.price > 0 ? "¥" + parseFloat(prod.price).toFixed(2) : "价格待询";
    const imgHtml = prod.images && prod.images.length
        ? `<img src="/${prod.images[0]}" alt="${prod.title}" onerror="this.style.display='none'">`
        : "";
    const isFav = favorites.includes(prod.id);
    body.innerHTML = `
        ${imgHtml}
        <h2>${escapeHtml(prod.title)}</h2>
        <div class="meta">
            <span class="admin-badge">${prod.category || "未分类"}</span>
            <span style="margin-left:12px;color:#e17055;font-weight:700;">${priceDisplay}</span>
        </div>
        <div class="desc">${escapeHtml(prod.description || "暂无描述")}</div>
        <div style="margin-top:16px;">
            <button class="btn-fav ${isFav ? "active" : ""}" onclick="toggleFav('${prod.id}')" style="font-size:13px;padding:6px 16px;">
                ${isFav ? "♥ 已收藏" : "♡ 收藏"}
            </button>
        </div>
    `;
    document.getElementById("productModal").classList.add("open");
}

function closeProductModal() {
    document.getElementById("productModal").classList.remove("open");
}
document.getElementById("productModal").addEventListener("click", function(e) {
    if (e.target === this) closeProductModal();
});

// ===== Init =====
document.addEventListener("DOMContentLoaded", async () => {
    await loadCategories();
    await loadProducts();
    await loadFavorites();
    toggleClearButton();
});
