# Architecture Decision Records (ADR) - MediTrack+

This document outlines the architectural decisions, design rationale, and technology stack selections for the **MediTrack+: Smart Medication Management & Adherence Platform**.

---

## 1. Frontend Mobile Framework: React Native with Expo SDK 52

### Decision
Adopt **React Native** managed through **Expo** (current stable SDK 52) with native component compilation.

### Rationale
- **Cross-Platform & Android Performance**: Delivers native 60fps Android UI performance with native thread scheduling rather than webview emulation.
- **Expo Ecosystem**: Standardizes device native access (e.g. `expo-notifications`, `expo-secure-store`, `expo-device`) without fragile manual Gradle linking.
- **EAS Cloud Build Compatibility**: Enables streamlined generation of production Android `.apk` and `.aab` packages for real-device distribution.
- **Developer Velocity**: Expo Go enables rapid on-device testing and hot module replacement.

---

## 2. Type System: TypeScript

### Decision
Use **TypeScript** strictly across all mobile screens, navigators, services, and API models (`strict: true`).

### Rationale
- **End-to-End Type Safety**: Shared domain models between backend Pydantic schemas and frontend interfaces (`User`, `Medicine`, `MedicationSchedule`, `MedicationActivity`) reduce contract drift.
- **Compile-Time Defect Prevention**: Catches null pointer exceptions, undefined navigation parameters, and malformed request payloads before runtime.
- **Refactoring Resilience**: Enables safe multi-file refactoring across complex multi-tab navigation and storage routines.

---

## 3. Backend API Framework: FastAPI & Python 3.13

### Decision
Use **FastAPI** with **Python 3.13** running on the asynchronous **Uvicorn** ASGI server.

### Rationale
- **Asynchronous Throughput**: Built on Starlette and `asyncio`, FastAPI handles high-concurrency mobile API requests with non-blocking I/O.
- **Automated OpenAPI & Swagger Documentation**: Auto-generates interactive documentation at `/docs` and `/redoc`, accelerating API verification and Postman testing.
- **High Developer Ergonomics**: Type-hint-driven route definitions and dependency injection provide modularity and clean separation of concerns.

---

## 4. Cloud Database: MongoDB Atlas

### Decision
Use **MongoDB Atlas** as the primary cloud database with localized developer fallback support.

### Rationale
- **Flexible Clinical Document Model**: Healthcare entities (medications with varying dosage units, schedules with diverse frequencies, flexible skip reasons) naturally map to JSON-like documents.
- **Cloud Scalability & Availability**: MongoDB Atlas delivers high availability, automated replicas, automated backups, and encrypted transit.
- **Isolation & Indexing**: Supports compound indexes for user data isolation (`userId + name`, `userId + scheduledDate`), ensuring fast queries and strict ownership enforcement.

---

## 5. Database Driver: Official PyMongo Async API (`AsyncMongoClient`)

### Decision
Migrated from Motor to the official **PyMongo Async API** (`AsyncMongoClient`) introduced in PyMongo 4.9+.

### Rationale
- **Direct Official Support**: PyMongo is MongoDB's official driver. Its native async engine removes third-party wrapper lag (previously incurred by Motor).
- **Python 3.13 Compatibility**: Modern PyMongo async cleanly integrates with Python 3.13's updated asyncio loop without legacy socket/event loop incompatibilities.
- **Native Async/Await Syntax**: Clean, idiomatic asynchronous programming for commands, queries, aggregations, and index definitions.

---

## 6. Schema Validation: Pydantic v2

### Decision
Adopt **Pydantic v2** for all request parsing, response formatting, and configuration settings (`pydantic-settings`).

### Rationale
- **Rust-Powered Performance**: Pydantic v2 provides up to 5x faster data parsing and validation over v1.
- **Strict Boundary Guardrails**: Enforces input validation (24-hour time format regex, email formatting, date chronological ordering, and mandatory skip reasons on skipped doses).
- **Embedded Medical Safety Disclaimers**: Schema mixins automatically inject safety notices into all clinical API responses.

---

## 7. Authentication & Token Security: JWT & Bcrypt

### Decision
Stateless **JSON Web Token (JWT)** access tokens signed with HMAC-SHA256, paired with **Bcrypt** password hashing.

### Rationale
- **Stateless Scalability**: Mobile clients authenticate via `Authorization: Bearer <token>`, avoiding server-side session memory consumption.
- **Bcrypt Work Factor**: One-way salt-hashed passwords with configurable computational cost prevent rainbow table and brute-force vulnerabilities.
- **Python 3.13 Resilience**: Standardized Bcrypt avoids deprecated Python standard library modules (`crypt`).

---

## 8. Mobile Sensitive Storage: Hardware-Backed `expo-secure-store`

### Decision
Store JWT access tokens and sensitive session tokens exclusively in **Expo SecureStore**, while restricting `AsyncStorage` to non-sensitive UI preferences.

### Rationale
- **Hardware Security**: `expo-secure-store` utilizes the **Android Keystore** (and iOS Keychain), encrypting tokens in dedicated hardware keystores inaccessible to rooted file browsers.
- **Clear Separation of Concerns**: Sensitive authentication data is kept separate from plain-text device cache.

---

## 9. HTTP Client & Interceptors: Axios

### Decision
Utilize **Axios** with global request and response interceptors.

### Rationale
- **Automated Bearer Attachment**: Request interceptor retrieves JWT from `expo-secure-store` and injects it into the HTTP headers.
- **Graceful Session Expiration**: Response interceptor intercepts `401 Unauthorized` responses and triggers secure session cleanup and redirect to login.
- **Timeout & Error Normalization**: Enforces strict connection timeouts and standardizes network error handling for mobile devices.

---

## 10. Medication Reminders: Expo Local Notifications

### Decision
Rely on **Expo Local Notifications** for medication alarm scheduling.

### Rationale
- **Offline Reliability**: Local alarms are registered directly with the Android OS alarm manager (`SCHEDULE_EXACT_ALARM`, `RECEIVE_BOOT_COMPLETED`), ensuring dose reminders trigger even without internet connectivity.
- **Transparent Boundaries**: Distinguishes between local offline alarms and cloud backend synchronization, ensuring users are not misled about cloud push notification limitations.

---

## 11. Version Control: Git & GitHub

### Decision
Structured Git version control with clean commit histories demarcated by phase.

### Rationale
- **Traceability**: Every architectural phase and test verification is committed atomically.
- **Safety**: Robust `.gitignore` prevents leaks of environment files, virtual environments, native binaries, and node modules.

---

## 12. Android Deployment Strategy: EAS Build & Production HTTPS

### Decision
Target Android distribution via **Expo Application Services (EAS)** connected to a production HTTPS FastAPI backend.

### Rationale
- **Device Portability**: EAS generates standalone release APKs for side-loading onto physical test devices and `.aab` bundles for Google Play distribution.
- **Security Compliance**: Enforces HTTPS transport security, secure Android permissions, and environment-aware API URL resolution.
