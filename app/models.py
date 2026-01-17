from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class Order(db.Model)
    __tablename__ = 'orders'
    
    id = db.Column(db.Integer, primary_key=True)
    user_email = db.Column(db.String(100), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    status = db.Column(db.String(20), nullable=False)  # Example: 'pending', 'paid', 'failed'
    reference = db.Column(db.String(100), nullable=True)
    
    def __repr__(self):
        return f"<Order {self.id}>"

    def __init__(self, user_email, amount, status="pending"):
        self.user_email = user_email
        self.amount = amount
        self.status = status

