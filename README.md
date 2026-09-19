<img width="1254" height="1254" alt="image" src="https://github.com/user-attachments/assets/dacbc7ac-c487-4920-8bfd-5674672bb9da" /># ShopRecs – AI Powered Price Prediction & Recommendation System

🚀 Predicts future product prices using XGBoost and recommends whether to BUY or WAIT based on market trends.

---

## 🌐 Live Demo

* 🔗 Frontend: https://shoprecs-4y87.onrender.com/
* 🤖 AI Backend (FastAPI): https://shoprecs-1.onrender.com/
* ⚙️ Backend (Node API): https://shoprecs.onrender.com/

---

## 🚀 Tech Stack

* Frontend: React (Vite)
* Backend: Node.js (Express)
* ML API: FastAPI (XGBoost)
* Scheduler: Node + Redis
* Database: MongoDB

---

## 🔥 Features

* 📊 Price Prediction using XGBoost
* 🤖 AI-based Buy/Wait Decision Engine
* 📦 Product Recommendation System
* ⏱ Scheduler for price tracking
* 📡 REST APIs (Node + FastAPI)

---

## 🧠 How It Works

1. User inputs a product (URL or search)
2. Backend extracts product details
3. FastAPI model predicts future price
4. Decision engine suggests:

   * 🟢 BUY → if price expected to rise
   * 🔴 WAIT → if price expected to drop
5. Scheduler tracks price changes over time

---

## 🛍️ Try With Real Products

* 💧 Water Purifier: https://www.amazon.in/dp/B0G4CHKBGP
* ❄️ Refrigerator: https://www.amazon.in/dp/B0BX4FBVQB
* 🌀 Ceiling Fan: https://www.amazon.in/dp/B0D17VTN8X
* 🧴 Skincare: https://www.amazon.in/dp/B0C3RBDLS1
* 💍 Jewelry: https://www.amazon.in/dp/B071CMQ6N2
* 🥕 Kitchen Tool: https://www.amazon.in/dp/B0G8KXSD9T
* 📱 Samsung Galaxy: https://www.amazon.in/dp/B0F43W6V6J
* 📱 iQOO Z10R: https://www.amazon.in/dp/B0FHB4F4TN
* 📱 Apple iPad: https://www.amazon.in/dp/B0DZ7C519W

---

## 📁 Project Structure

frontend/ – React UI
backend-node/ – Main API
backend-fastapi/ – ML model service
scheduler/ – Background jobs

---

## ⚙️ Setup

### Frontend

```bash
cd frontend
npm install
npm run dev
```
