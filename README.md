# 💰 AI Expense Analyzer

![Hero Image](https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&q=80&w=1200&h=400)

**AI Expense Analyzer** is a full-stack, AI-powered financial tracking application. It transforms raw expense data into actionable insights using Large Language Models (LLMs). It allows users to track daily spending, automatically categorizes transactions using the Gemini API, sets up recurring expenses, and provides comprehensive financial dashboards—all with a beautiful Dark/Light mode UI.

## ✨ Features

- **🔐 Secure Authentication:** Google Sign-In powered by Firebase Authentication.
- **🤖 AI Categorization:** Automatically assigns a category (Food, Rent, Travel, etc.) to your expense using the Gemini 3 Flash model.
- **🧠 Intelligent Insights:** Analyzes your spending behavior and provides personalized saving recommendations using the Gemini 3.1 Pro model.
- **🔁 Recurring Expenses:** Set up fixed expenses to repeat automatically on a daily, weekly, monthly, or yearly basis.
- **📊 Interactive Dashboard:** Visualize your spending with interactive Pie and Bar charts (last 7 days trending).
- **🌓 Dark/Light Mode:** Seamlessly switch between themes based on your system preference or a manual toggle.
- **🇮🇳 Localized Currency:** Built for native users, displaying all numbers in Indian Rupees (₹).

## 🛠️ Tech Stack

- **Frontend:** React 19, Vite, Tailwind CSS v4, Lucide React
- **Data Visualization:** Recharts
- **Backend/AI:** `@google/genai` (Gemini API)
- **Database:** Firebase Firestore (NoSQL)
- **Authentication:** Firebase Auth
- **Routing/State:** React Hooks

## 🚀 Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

Ensure you have the following installed:
- [Node.js](https://nodejs.org/en/) (v18 or higher recommended)
- A [Firebase](https://console.firebase.google.com/) Project (for Auth & Firestore)
- A [Google Gemini API Key](https://aistudio.google.com/app/apikey)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/ai-expense-analyzer.git
   cd ai-expense-analyzer
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Environment Variables**
   Create a `.env` file in the root directory and add your Gemini API Key:
   ```env
   GEMINI_API_KEY="your_gemini_api_key_here"
   ```

4. **Set up Firebase Config**
   Since Firebase configuration contains sensitive keys, it is ignored by git. Create a `firebase-applet-config.json` file in the root directory with your Firebase configuration:
   ```json
   {
     "apiKey": "YOUR_API_KEY",
     "authDomain": "YOUR_AUTH_DOMAIN",
     "projectId": "YOUR_PROJECT_ID",
     "storageBucket": "YOUR_STORAGE_BUCKET",
     "messagingSenderId": "YOUR_MESSAGING_SENDER_ID",
     "appId": "YOUR_APP_ID",
     "firestoreDatabaseId": "(default)"
   }
   ```

5. **Start the Development Server**
   ```bash
   npm run dev
   ```

6. Open `http://localhost:3000` in your browser.

## 🔒 Security & Contribution

- **Secrets:** API keys and Firebase Configuration are strictly ignored via `.gitignore` and should never be committed.
- **Firestore Rules:** This application incorporates strict Firestore Security rules checking authentication (`request.auth.uid`), validation patterns, and schema limits.

## 📝 License

This project is open-source and free to use.

---

*Built with React, Firebase, and Google Gemini.*
