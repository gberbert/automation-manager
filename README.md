# Automation Manager

A scheduled workflow system to automate content creation with Gemini 1.5 Pro and publishing to LinkedIn.

## Setup

### 1. Firebase Setup
1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com).
2. Enable **Authentication** (Email/Password provider).
3. Enable **Firestore Database**.
4. Go to Project Settings -> General and copy the web app configuration.

### 2. Client Setup
1. Navigate to `client/`.
2. Copy `.env.example` to `.env` and fill in your Firebase config.
3. Run `npm install`.
4. Run `npm run dev` to start the frontend.

### 3. Server Setup
1. Navigate to `server/`.
2. Go to Firebase Console -> Project Settings -> Service Accounts.
3. Click "Generate new private key".
4. Save the file as `serviceAccountKey.json` in the `server/` directory.
5. Run `npm install`.
6. Run `node index.js` to start the scheduler.

## Usage
1. Open the web app (usually http://localhost:5173).
2. Sign up/Login (you might need to manually create a user in Firebase Console or add a signup form - currently only Login is implemented, so create a user in Firebase Console first!).
3. Go to **Settings** to configure:
   - Gemini API Key (Get from Google AI Studio).
   - LinkedIn Access Token & URN.
   - Schedule and Topics.
4. The server will run the scheduler every minute.
5. Check **Approvals** to review generated content.
6. Approved content will be published automatically based on the schedule.
