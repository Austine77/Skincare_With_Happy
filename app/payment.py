import requests
from config import PAYSTACK_SECRET_KEY

PAYSTACK_API_URL = "https://api.paystack.co/"

# Header with Paystack secret key for authorization
HEADERS = {
    "Authorization": f"Bearer {PAYSTACK_SECRET_KEY}",
    "Content-Type": "application/json"
}

def create_transaction(amount, email):
    """Create a transaction with Paystack for the user"""
    
    # Data to initiate a payment on Paystack
    data = {
        "email": email,
        "amount": amount * 100  # Paystack expects the amount in kobo (cents)
    }
    
    # Request to create a new transaction
    response = requests.post(f"{PAYSTACK_API_URL}transaction/initialize", headers=HEADERS, json=data)
    
    if response.status_code == 200:
        transaction_data = response.json()
        if transaction_data['status']:
            return transaction_data['data']
        else:
            return {"error": "Unable to initialize transaction"}
    else:
        return {"error": "Failed to connect to Paystack API"}

def verify_transaction(reference):
    """Verify a transaction after payment has been completed"""
    
    # Request to verify the transaction
    response = requests.get(f"{PAYSTACK_API_URL}transaction/verify/{reference}", headers=HEADERS)
    
    if response.status_code == 200:
        verification_data = response.json()
        if verification_data['status'] and verification_data['data']['status'] == 'success':
            return verification_data['data']
        else:
            return {"error": "Payment verification failed"}
    else:
        return {"error": "Failed to verify transaction"}
