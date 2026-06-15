// ===== Toast =====
function showToast(msg, type) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.className = "toast show " + (type || "info");
    clearTimeout(t._hide);
    t._hide = setTimeout(() => t.classList.remove("show"), 2500);
}

// ===== API Helper =====
async function api(url, opts) {
    const res = await fetch(url, {
        headers: opts && opts.body instanceof FormData ? {} : { "Content-Type": "application/json" },
        ...opts
    });
    if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error || "请求失败"); }
    return res.json();
}

// ===== Auth =====
async function checkAuth() {
    try {
        const r = await api("/api/admin/check");
        if (r.logged_in) {
            document.getElementById("adminLoginForm").style.display = "none";
            document.getElementById("adminContent").style.display = "block";
            loadCategories();
            loadProducts();
            setupUpload();
            setupFilters();
        }
    } catch (e) {
        document.getElementById("adminLoginForm").style.display = "flex";
        document.getElementById("adminContent").style.display = "none";
    }
}

async function doAdminLogin() {
    const pw = document.getElementById("adminPassword").value;
    const err = document.getElementById("adminLoginError");
    if (!pw) { err.textContent = "请输入密码"; err.style.display = "block"; return; }
    try {
        const r = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: pw }) });
        if (r.ok) {
            document.getElementById("adminLoginForm").style.display = "none";
            document.getElementById("adminContent").style.display = "block";
            loadCategories();
            loadProducts();
            setupUpload();
            setupFilters();
        }
    } catch (e) {
        err.textContent = e.message || "密码错误";
        err.style.display = "block";
    }
}

// ===== File Upload =====
let selectedFile = null;

function setupUpload() {
    const zone = document.getElementById("uploadZone");
    const input = document.getElementById("fileInput");
    if (!zone || !input) return;
    zone.addEventListener("click", () => input.click());
    zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("dragover"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
    zone.addEventListener("drop", (e) => {
        e.preventDefault(); zone.classList.remove("dragover");
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });
    input.addEventListener("change", () => {
        if (input.files.length) handleFile(input.files[0]);
    });
}

function handleFile(file) {
    if (!file.name.toLowerCase().endsWith(".pptx")) {
        showToast("仅支持 .pptx 格式", "error");
        return;
    }
    selectedFile = file;
    document.getElementById("fileName").textContent = file.name;
    document.getElementById("fileSize").textContent = (file.size / 1024 / 1024).toFixed(2) + " MB";
    document.getElementById("fileStatus").classList.add("show");
    document.getElementById("progressBar").style.width = "0%";
    document.getElementById("uploadBtn").classList.add("show");
}

async function uploadFile() {
    if (!selectedFile) return;
    const btn = document.getElementById("uploadBtn");
    btn.textContent = "解析中...";
    btn.disabled = true;
    document.getElementById("progressBar").style.width = "50%";
    try {
        const form = new FormData();
        form.append("file", selectedFile);
        const result = await api("/api/admin/upload", { method: "POST", body: form });
        document.getElementById("progressBar").style.width = "100%";
        showToast("成功! 处理了 " + result.products_count + " 个幻灯片", "success");
        selectedFile = null;
        document.getElementById("uploadBtn").classList.remove("show");
        setTimeout(() => document.getElementById("fileStatus").classList.remove("show"), 2000);
        loadCategories();
        loadProducts();
    } catch (e) {
        document.getElementById("progressBar").style.width = "0%";
        showToast(e.message || "上传失败", "error");
    }
    btn.textContent = "开始上传并解析";
    btn.disabled = false;
}

// ===== Categories =====
async function loadCategories(targetSelect) {
    const cats = await api("/api/categories");
    const tbody = document.getElementById("categoryTableBody");
    if (tbody) {
        if (!cats.length) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#b2bec3;">暂无分类</td></tr>';
        } else {
            tbody.innerHTML = cats.map(c =>
                '<tr><td><strong>' + escapeHtml(c.name) + '</strong></td>'
                + '<td style="color:#636e72;">' + (c.description || "-") + '</td>'
                + '<td><button class="btn-sm danger" onclick="deleteCategory(\'' + c.id + '\')">删除</button></td></tr>'
            ).join("");
        }
    }
    // Populate the admin category filter dropdown
    const filterSel = document.getElementById("adminCategoryFilter");
    if (filterSel) {
        var currentVal = filterSel.value;
        filterSel.innerHTML = '<option value="">全部分类</option>'
            + cats.map(c => '<option value="' + escapeHtml(c.name) + '">' + escapeHtml(c.name) + '</option>').join("");
        filterSel.value = currentVal;
    }
    // Populate edit modal dropdown
    if (targetSelect) {
        targetSelect.innerHTML = '<option value="">选择分类</option>'
            + cats.map(c => '<option value="' + escapeHtml(c.name) + '">' + escapeHtml(c.name) + '</option>').join("");
    }
    return cats;
}

async function addCategory() {
    const name = document.getElementById("newCategoryName").value.trim();
    if (!name) { showToast("请输入分类名称", "error"); return; }
    const desc = document.getElementById("newCategoryDesc").value.trim();
    try {
        await api("/api/categories", { method: "POST", body: JSON.stringify({ name, description: desc }) });
        showToast("分类已添加", "success");
        document.getElementById("newCategoryName").value = "";
        document.getElementById("newCategoryDesc").value = "";
        loadCategories(document.getElementById("editCategory"));
    } catch (e) { showToast(e.message, "error"); }
}

async function deleteCategory(id) {
    if (!confirm("确定删除此分类？")) return;
    await api("/api/categories/" + id, { method: "DELETE" });
    showToast("分类已删除", "info");
    loadCategories(document.getElementById("editCategory"));
    // Re-filter products since categories changed
    renderProducts(adminAllProducts);
}

// ===== Admin Filters =====
var adminAllProducts = [];
var adminSearchTimer = null;

function setupFilters() {
    var searchInput = document.getElementById("adminSearchInput");
    var catFilter = document.getElementById("adminCategoryFilter");
    if (searchInput) {
        searchInput.addEventListener("input", function() {
            clearTimeout(adminSearchTimer);
            adminSearchTimer = setTimeout(filterProducts, 250);
        });
        searchInput.addEventListener("keydown", function(e) {
            if (e.key === "Escape") { searchInput.value = ""; filterProducts(); }
        });
    }
    if (catFilter) {
        catFilter.addEventListener("change", filterProducts);
    }
}

function filterProducts() {
    var q = (document.getElementById("adminSearchInput").value || "").toLowerCase();
    var cat = document.getElementById("adminCategoryFilter").value || "";
    var filtered = adminAllProducts;
    if (q) filtered = filtered.filter(function(p) { return (p.title || "").toLowerCase().indexOf(q) >= 0; });
    if (cat) filtered = filtered.filter(function(p) { return p.category === cat; });
    renderProducts(filtered);
    var totalEl = document.getElementById("totalCount");
    if (totalEl) totalEl.textContent = "(共 " + filtered.length + "/" + adminAllProducts.length + " 个)";
}

// ===== Edit Product =====
var editProductCache = null;

async function openEditModal(productId) {
    var prod = adminAllProducts.find(function(p) { return p.id === productId; });
    if (!prod) { showToast("未找到该产品", "error"); return; }
    editProductCache = prod;

    document.getElementById("editProductId").value = productId;
    document.getElementById("editTitle").value = prod.title;
    document.getElementById("editPrice").value = prod.price || "";

    var select = document.getElementById("editCategory");
    await loadCategories(select);
    if (prod.category) select.value = prod.category;

    document.getElementById("editModal").classList.add("open");
}

function closeEditModal() {
    document.getElementById("editModal").classList.remove("open");
    editProductCache = null;
}

async function saveEdit() {
    var id = document.getElementById("editProductId").value;
    var category = document.getElementById("editCategory").value;
    var price = parseFloat(document.getElementById("editPrice").value) || 0;
    try {
        await api("/api/products/" + id, {
            method: "PATCH",
            body: JSON.stringify({ category: category, price: price })
        });
        showToast("修改已保存", "success");
        closeEditModal();
        loadProducts();
    } catch (e) {
        showToast(e.message || "保存失败", "error");
    }
}

// ===== Products (Compact) =====
function renderProducts(prods) {
    var tbody = document.getElementById("productTableBody");
    if (!prods || !prods.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#b2bec3;padding:20px;">暂无匹配产品</td></tr>';
        return;
    }
    tbody.innerHTML = prods.map(function(p) {
        var price = p.price > 0 ? "¥" + parseFloat(p.price).toFixed(2) : "待询";
        return '<tr>'
            + '<td class="cell-title">' + escapeHtml(p.title) + '</td>'
            + '<td><span class="admin-badge">' + escapeHtml(p.category || "未分类") + '</span></td>'
            + '<td class="cell-price">' + price + '</td>'
            + '<td class="cell-source">' + (p.source_file || "-") + ' <small>#' + ((p.slide_index||0)+1) + '</small></td>'
            + '<td><div class="admin-actions" style="gap:4px;">'
            + '<button class="btn-sm primary" onclick="openEditModal(\'' + p.id + '\')" style="padding:3px 8px;font-size:11px;">编辑</button>'
            + '<button class="btn-sm danger" onclick="deleteProduct(\'' + p.id + '\')" style="padding:3px 8px;font-size:11px;">删除</button>'
            + '</div></td></tr>';
    }).join("");
}

async function loadProducts() {
    var data = await api("/api/admin/products");
    adminAllProducts = data.products || [];
    filterProducts();
}

function escapeHtml(t) {
    if (!t) return "";
    var d = document.createElement("div");
    d.textContent = t;
    return d.innerHTML;
}

async function deleteProduct(id) {
    if (!confirm("确定删除此产品？")) return;
    await api("/api/products/" + id, { method: "DELETE" });
    showToast("产品已删除", "info");
    loadProducts();
}

// ===== Init =====
document.addEventListener("DOMContentLoaded", function() {
    checkAuth();
});
