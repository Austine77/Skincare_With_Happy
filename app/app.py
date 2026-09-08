from flask import Flask, render_template, request, redirect, session, jsonify
import sqlite3
from config import PAYSTACK_PUBLIC_KEY, PAYSTACK_SECRET_KEY, DATABASE, SECRET_KEY
from datetime import datetime
from dotenv import load_dotenv
load_dotenv()

app = Flask(__name__)
app.secret_key = SECRET_KEY

# Database helper
def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

# Context processor for year
@app.context_processor
def inject_year():
    return {'current_year': datetime.now().year}

# ------------------ PUBLIC ROUTES ------------------

@app.route("/")
def index():
    return render_template("public/index.html")

@app.route("/products")
def products():
    skin_type = request.args.get("type")
    db = get_db()
    if skin_type:
        products = db.execute("SELECT * FROM products WHERE skin_type=?", (skin_type,)).fetchall()
    else:
        products = db.execute("SELECT * FROM products").fetchall()
    return render_template("public/products.html", products=products)

@app.route("/product/<int:product_id>")
def product_detail(product_id):
    db = get_db()
    product = db.execute("SELECT * FROM products WHERE id=?", (product_id,)).fetchone()
    return render_template("public/product_detail.html", product=product, PAYSTACK_PUBLIC_KEY=PAYSTACK_PUBLIC_KEY)

@app.route("/skin-quiz")
def skin_quiz():
    return render_template("public/skin_quiz.html")

@app.route("/cart")
def cart():
    return render_template("public/cart.html", cart=session.get("cart", []), PAYSTACK_PUBLIC_KEY=PAYSTACK_PUBLIC_KEY)

@app.route("/checkout", methods=["GET","POST"])
def checkout():
    if request.method == "GET":
        return render_template("public/checkout.html", cart=session.get("cart", []), PAYSTACK_PUBLIC_KEY=PAYSTACK_PUBLIC_KEY)
    data = request.get_json()
    cart = data.get("cart")
    total = data.get("total")
    reference = data.get("reference")
    name = data.get("name")
    email = data.get("email")
    phone = data.get("phone")

    db = get_db()
    cursor = db.cursor()
    cursor.execute("INSERT INTO orders (user_email, total, paystack_ref, name, phone) VALUES (?, ?, ?, ?, ?)",
                   (email, total, reference, name, phone))
    order_id = cursor.lastrowid

    for item in cart:
        cursor.execute("INSERT INTO order_items (order_id, product_id, quantity) VALUES (?, ?, ?)",
                       (order_id, item['product_id'], item['quantity']))
    db.commit()
    session['cart'] = []
    return jsonify({"status":"success"})

@app.route("/payment")
def payment_success():
    reference = request.args.get("ref")
    db = get_db()
    order = db.execute("SELECT * FROM orders WHERE paystack_ref=?", (reference,)).fetchone()
    if order:
        items = db.execute("SELECT p.name, o.quantity, p.price FROM order_items o JOIN products p ON o.product_id=p.id WHERE o.order_id=?", (order['id'],)).fetchall()
        order_dict = {'items': items, 'total': order['total']}
    else:
        order_dict = None
    return render_template("public/success.html", reference=reference, order=order_dict)

# ------------------ CART ROUTES ------------------

@app.route("/cart/add", methods=["POST"])
def add_to_cart():
    product_id = int(request.form['product_id'])
    quantity = int(request.form.get('quantity',1))
    cart = session.get("cart", [])
    found = False
    for item in cart:
        if item['product_id'] == product_id:
            item['quantity'] += quantity
            found = True
            break
    if not found:
        db = get_db()
        product = db.execute("SELECT * FROM products WHERE id=?", (product_id,)).fetchone()
        cart.append({'product_id': product['id'], 'name': product['name'], 'price': product['price'], 'quantity': quantity})
    session['cart'] = cart
    return redirect("/cart")

@app.route("/cart/update", methods=["POST"])
def update_cart():
    cart = session.get("cart", [])
    for item in cart:
        qty = int(request.form.get(f"quantity_{item['product_id']}", item['quantity']))
        item['quantity'] = qty
    session['cart'] = cart
    return redirect("/cart")

@app.route("/cart/remove/<int:product_id>")
def remove_from_cart(product_id):
    cart = session.get("cart", [])
    cart = [item for item in cart if item['product_id'] != product_id]
    session['cart'] = cart
    return redirect("/cart")

# ------------------ RUN APP ------------------

if __name__ == "__main__":
    app.run(debug=True)
