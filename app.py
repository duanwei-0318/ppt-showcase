import os
import json
import uuid
import shutil
from datetime import datetime
from flask import Flask, request, jsonify, send_file, render_template, session
from werkzeug.utils import secure_filename
from ppt_processor import process_pptx
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

app = Flask(__name__)
app.secret_key = "ppt-showcase-secret-key-2024"
app.config["UPLOAD_FOLDER"] = "uploads"
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024
app.config["ADMIN_PASSWORD"] = os.environ.get("ADMIN_PASSWORD", "admin2024")

DATA_DIR = "data"
STATIC_IMAGES = "static/images"
EXPORTS_DIR = "exports"
ALLOWED_EXTENSIONS = {"pptx"}

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(STATIC_IMAGES, exist_ok=True)
os.makedirs(EXPORTS_DIR, exist_ok=True)


def load_json(filename):
    path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(path):
        return []
    for enc in ("utf-8-sig", "utf-8"):
        try:
            with open(path, "r", encoding=enc) as f:
                return json.load(f)
        except (json.JSONDecodeError, UnicodeDecodeError):
            continue
    return []


def save_json(filename, data):
    path = os.path.join(DATA_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def get_session_id():
    if "session_id" not in session:
        session["session_id"] = str(uuid.uuid4())
    return session["session_id"]


def require_admin():
    """Decorator to check admin authentication."""
    def decorator(f):
        def wrapper(*args, **kwargs):
            if not session.get("admin_logged_in"):
                return jsonify({"error": "未授权访问"}), 401
            return f(*args, **kwargs)
        wrapper.__name__ = f.__name__
        return wrapper
    return decorator


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/admin")
def admin():
    return render_template("admin.html")


# ---- Admin Auth ----

@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    data = request.get_json()
    password = data.get("password", "")
    if password == app.config["ADMIN_PASSWORD"]:
        session["admin_logged_in"] = True
        return jsonify({"ok": True})
    return jsonify({"error": "密码错误"}), 401


@app.route("/api/admin/logout", methods=["POST"])
def admin_logout():
    session.pop("admin_logged_in", None)
    return jsonify({"ok": True})


@app.route("/api/admin/check")
def admin_check():
    return jsonify({"logged_in": session.get("admin_logged_in", False)})


@app.route("/api/categories", methods=["GET"])
def get_categories():
    return jsonify(load_json("categories.json"))


@app.route("/api/categories", methods=["POST"])
def add_category():
    data = request.get_json()
    categories = load_json("categories.json")
    new_cat = {
        "id": str(uuid.uuid4()),
        "name": data["name"],
        "description": data.get("description", ""),
        "created_at": datetime.now().isoformat()
    }
    categories.append(new_cat)
    save_json("categories.json", categories)
    return jsonify(new_cat), 201


@app.route("/api/categories/<category_id>", methods=["DELETE"])
def delete_category(category_id):
    cats = [c for c in load_json("categories.json") if c["id"] != category_id]
    save_json("categories.json", cats)
    return jsonify({"ok": True})


@app.route("/api/products", methods=["GET"])
def get_products():
    products = load_json("products.json")
    category = request.args.get("category", "")
    search = request.args.get("search", "")
    price_min = request.args.get("price_min", type=float, default=0)
    price_max = request.args.get("price_max", type=float, default=9999999)

    if category and category != "全部":
        products = [p for p in products if p.get("category") == category]
    if search:
        q = search.lower()
        products = [p for p in products if q in p.get("title", "").lower() or q in p.get("all_text", "").lower()]
    if price_min > 0:
        products = [p for p in products if p.get("price", 0) >= price_min]
    if price_max < 9999999:
        products = [p for p in products if p.get("price", 0) <= price_max]

    return jsonify(products)


@app.route("/api/products/<product_id>", methods=["DELETE"])
def delete_product(product_id):
    products = [p for p in load_json("products.json") if p["id"] != product_id]
    save_json("products.json", products)
    return jsonify({"ok": True})


@app.route("/api/products/<product_id>", methods=["PATCH"])
def update_product(product_id):
    data = request.get_json()
    products = load_json("products.json")
    for p in products:
        if p["id"] == product_id:
            if "title" in data: p["title"] = data["title"]
            if "price" in data: p["price"] = float(data["price"])
            if "category" in data: p["category"] = data["category"]
            if "description" in data: p["description"] = data["description"]
            break
    save_json("products.json", products)
    return jsonify({"ok": True})


@app.route("/api/favorites", methods=["GET"])
def get_favorites():
    favorites = load_json("favorites.json")
    product_ids = favorites.get(get_session_id(), [])
    products = load_json("products.json")
    return jsonify([p for p in products if p["id"] in product_ids])


@app.route("/api/favorites", methods=["POST"])
def add_favorite():
    sid = get_session_id()
    data = request.get_json()
    product_id = data["product_id"]
    favorites = load_json("favorites.json")
    if sid not in favorites:
        favorites[sid] = []
    if product_id not in favorites[sid]:
        favorites[sid].append(product_id)
    save_json("favorites.json", favorites)
    return jsonify({"ok": True})


@app.route("/api/favorites", methods=["DELETE"])
def clear_favorites():
    sid = get_session_id()
    favorites = load_json("favorites.json")
    favorites[sid] = []
    save_json("favorites.json", favorites)
    return jsonify({"ok": True})


@app.route("/api/favorites/<product_id>", methods=["DELETE"])
def remove_favorite(product_id):
    sid = get_session_id()
    favorites = load_json("favorites.json")
    if sid in favorites:
        favorites[sid] = [pid for pid in favorites[sid] if pid != product_id]
        save_json("favorites.json", favorites)
    return jsonify({"ok": True})


@app.route("/api/favorites/export", methods=["POST"])
def export_favorites():
    favorites = load_json("favorites.json")
    product_ids = favorites.get(get_session_id(), [])
    fav_products = [p for p in load_json("products.json") if p["id"] in product_ids]

    if not fav_products:
        return jsonify({"error": "收藏夹为空"}), 400

    filename = f"favorites_{get_session_id()[:8]}.pdf"
    filepath = os.path.join(EXPORTS_DIR, filename)
    c = canvas.Canvas(filepath, pagesize=A4)
    width, height = A4
    margin = 20 * mm
    y = height - margin

    c.setFont("Helvetica-Bold", 20)
    c.drawString(margin, y, "产品收藏夹导出报告")
    y -= 15 * mm
    c.setFont("Helvetica", 10)
    c.drawString(margin, y, f"导出时间: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    y -= 10 * mm
    c.line(margin, y, width - margin, y)
    y -= 8 * mm

    for i, prod in enumerate(fav_products, 1):
        if y < 40 * mm:
            c.showPage()
            y = height - margin

        c.setFont("Helvetica-Bold", 14)
        c.drawString(margin, y, f"{i}. {prod.get('title', '未命名产品')}")
        y -= 8 * mm

        c.setFont("Helvetica", 10)
        cat = prod.get("category", "未分类")
        c.drawString(margin, y, f"分类: {cat}")
        y -= 6 * mm

        price = prod.get("price", 0)
        if price > 0:
            c.drawString(margin, y, f"价格: ¥{price:.2f}")
            y -= 6 * mm

        desc = prod.get("description", "")
        if desc:
            c.setFont("Helvetica", 9)
            for line in desc.split("\n")[:6]:
                if len(line) > 80:
                    line = line[:80] + "..."
                c.drawString(margin + 2 * mm, y, line)
                y -= 5 * mm
            y -= 3 * mm

        images = prod.get("images", [])
        if images:
            abs_img = os.path.join(os.getcwd(), images[0])
            if os.path.exists(abs_img):
                try:
                    img = ImageReader(abs_img)
                    c.drawImage(img, margin, y - 60 * mm, width=80 * mm, height=60 * mm, preserveAspectRatio=True)
                    y -= 65 * mm
                except Exception:
                    pass
        y -= 5 * mm

    c.save()
    return send_file(filepath, as_attachment=True, download_name="产品收藏夹.pdf")


@app.route("/api/admin/upload", methods=["POST"])
def upload_pptx():
    if not session.get("admin_logged_in"):
        return jsonify({"error": "未授权访问"}), 401
    if "file" not in request.files:
        return jsonify({"error": "没有上传文件"}), 400
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "未选择文件"}), 400
    if not allowed_file(file.filename):
        return jsonify({"error": "仅支持 .pptx 格式"}), 400

    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    file.save(filepath)

    existing_categories = load_json("categories.json")
    try:
        products = process_pptx(filepath, STATIC_IMAGES, existing_categories)
    except Exception as e:
        return jsonify({"error": f"PPT 处理失败: {str(e)}"}), 500

    existing_products = load_json("products.json")
    existing_products.extend(products)
    save_json("products.json", existing_products)

    existing_names = {c["name"] for c in existing_categories}
    new_cats = set()
    for p in products:
        if p["category"] not in existing_names and p["category"] not in new_cats:
            new_cats.add(p["category"])
    for cat_name in new_cats:
        existing_categories.append({
            "id": str(uuid.uuid4()),
            "name": cat_name,
            "description": f"从 {filename} 自动创建",
            "created_at": datetime.now().isoformat()
        })
    save_json("categories.json", existing_categories)

    return jsonify({
        "ok": True,
        "message": f"成功处理 {len(products)} 个幻灯片",
        "products_count": len(products),
        "new_categories": list(new_cats)
    })


@app.route("/api/admin/products", methods=["GET"])
def get_admin_products():
    if not session.get("admin_logged_in"):
        return jsonify({"error": "未授权访问"}), 401
    products = load_json("products.json")
    return jsonify({"total": len(products), "products": products})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"Server starting: http://127.0.0.1:{port}")
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_DEBUG", "0") == "1")
