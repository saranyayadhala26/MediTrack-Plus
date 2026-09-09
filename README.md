# MediTrack+: Smart Medication Management & Adherence Platform

> **Academic Project Notice**: MediTrack+ is a full-stack Android mobile application and cloud backend designed for reliable medication scheduling, adherence tracking, and caregiver oversight.

---

## ⚠️ Important Medical Safety Rule

MediTrack+ is strictly a **medication management and reminder application**.
- It does **NOT** diagnose diseases.
- It does **NOT** prescribe medicines.
- It does **NOT** recommend changing dosages.
- It does **NOT** recommend starting or stopping medication.
- It does **NOT** provide medical treatment decisions.
- All medication details must originate from the user's licensed healthcare professional or prescription.

---

## 🏛️ System Architecture

MediTrack+ adopts a clean **Three-Tier Client-Server Architecture**:

```
+-------------------------------------------------------------+
|               ANDROID MOBILE CLIENT (Expo / RN)             |
|  - React Navigation (Auth Stack + Main 5-Tab Navigation)    |
|  - Accessible Senior-Friendly UI Components                |
|  - Expo Local Notifications (Offline-capable device alarms)  |
|  - Centralized AuthContext & AsyncStorage JWT Store         |
+-------------------------------------------------------------+
                               |
                               | HTTPS / JSON REST API
                               | (Axios with Bearer Token)
                               v
+-------------------------------------------------------------+
|                   FASTAPI BACKEND (Python)                  |
|  - Pydantic Input Validation & Authorization Gateways       |
|  - Bcrypt Hashing & PyJWT Access Token Generator            |
|  - Medication Schedule & Adherence Analytics Engine         |
|  - Caregiver Repeated Missed Dose Alert Service             |
|  - OpenAPI Auto-Documentation (/docs & /redoc)             |
+-------------------------------------------------------------+
                               |
                               | Async Motor Driver
                               v
+-------------------------------------------------------------+
|                  MONGODB ATLAS DATABASE                     |
|  - Collections: users, medicines, schedules, activities,     |
|    caregivers, notifications                                |
|  - Indexed queries for performance and strict user isolation|
+-------------------------------------------------------------+
```

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Mobile Client** | React Native (Expo SDK 52) | Cross-platform Android mobile application |
| **Language** | TypeScript | Strong typing across mobile navigation, state, and API models |
| **Navigation** | React Navigation v7 | Stack & Bottom Tab navigation |
| **Notifications** | Expo Notifications | Local device scheduling for reliable dose alerts |
| **HTTP Client** | Axios | REST API communication with interceptors |
| **Backend API** | FastAPI (Python 3.13) | Asynchronous, high-performance REST API |
| **Validation** | Pydantic v2 & Pydantic-Settings | Request/response schema validation and settings |
| **Security** | Bcrypt & PyJWT | Robust password hashing and stateless token auth |
| **Database** | MongoDB Atlas / Motor | Asynchronous non-blocking document persistence |
| **Testing** | Pytest & Postman | Automated API unit testing & collection testing |

---

## 📂 Project Structure

```text
SampleMediTrack/
├── backend/                         # FastAPI Python Backend
│   ├── app/
│   │   ├── core/                    # Settings, security, config
│   │   ├── db/                      # MongoDB Atlas client & index manager
│   │   ├── models/                  # Database entity representations
│   │   ├── schemas/                 # Pydantic validation schemas
│   │   ├── routers/                 # Modular API endpoints
│   │   ├── services/                # Business logic & adherence calculation
│   │   ├── utils/                   # Helpers
│   │   └── main.py                  # FastAPI application entry point
│   ├── tests/                       # Pytest test suite
│   ├── requirements.txt             # Python dependencies
│   ├── .env.example                 # Backend environment variable template
│   └── .env                         # Local environment settings (git-ignored)
├── mobile/                          # Expo React Native Mobile Client
│   ├── src/
│   │   ├── api/                     # Axios client & API endpoints
│   │   ├── components/              # Reusable accessible UI components
│   │   ├── constants/               # Theme, design tokens, and config
│   │   ├── context/                 # Auth & state management
│   │   ├── navigation/              # React Navigation navigators
│   │   ├── screens/                 # Mobile application screens
│   │   ├── services/                # Local notification scheduler
│   │   ├── storage/                 # AsyncStorage wrapper
│   │   └── types/                   # TypeScript interfaces
│   ├── app.json                     # Expo configuration
│   ├── package.json                 # Node dependencies
│   ├── tsconfig.json                # TypeScript compiler configuration
│   └── .env.example                 # Mobile environment variable template
├── CHECKLIST.md                     # Phase progress & Use Case tracking
├── .gitignore                       # Git ignore configuration
└── README.md                        # Project documentation
```

---

## 🚀 Quick Start Guide

### 1. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv .venv

# Activate virtual environment
# Windows:
.\.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Update MONGODB_URI with your MongoDB Atlas connection string

# Run the development server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
- Interactive API Docs: `http://localhost:8000/docs`
- Health Check: `http://localhost:8000/health`

### 2. Mobile Setup

```bash
cd mobile

# Install dependencies
npm install

# Start Expo development server
npx expo start
```
- Press `a` in terminal to run on an attached Android device or emulator.
- Or scan QR code with the **Expo Go** app on your physical Android phone.

---

## 📋 Environment Variables

### Backend (`backend/.env`)

| Variable | Default Value | Description |
|---|---|---|
| `ENVIRONMENT` | `development` | Runtime mode (`development` / `production`) |
| `PORT` | `8000` | Port for FastAPI server |
| `MONGODB_URI` | `mongodb://localhost:27017` | MongoDB connection string (Atlas or local) |
| `DATABASE_NAME` | `meditrack_plus` | Database name |
| `JWT_SECRET_KEY` | *(secret)* | Secret key for signing JWT tokens |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `10080` | JWT token validity in minutes (7 days) |
| `CAREGIVER_MISSED_THRESHOLD`| `2` | Consecutive missed doses before caregiver alert |
| `CORS_ORIGINS` | `*` | Allowed CORS origins for API requests |

### Mobile (`mobile/.env.example`)

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | Base URL pointing to FastAPI (e.g. `http://10.0.2.2:8000/api/v1` for Android Emulator, or LAN IP for physical device, or HTTPS for production) |
