import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, updateDoc, doc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db, auth, loginWithGoogle, logout } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { format, addMonths, subMonths, parse, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area } from 'recharts';
import { Plus, Trash2, LogOut, Loader2, Sparkles, TrendingUp, DollarSign, PieChart as PieChartIcon, Activity, Sun, Moon, Repeat, Lightbulb, Target, Filter, ChevronDown, ChevronUp, X, Search, ChevronLeft, ChevronRight, Calendar, Bell } from 'lucide-react';
import { cn } from './lib/utils';

import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// --- Types ---
interface Expense {
  id: string;
  userId: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  createdAt: any;
}

interface RecurringExpense {
  id: string;
  userId: string;
  description: string;
  amount: number;
  category: string;
  frequency: string;
  nextDueDate: string;
  createdAt: any;
}

interface CategoryRule {
  id: string;
  userId: string;
  keyword: string;
  category: string;
  createdAt: any;
}

interface BudgetGoal {
  id: string;
  userId: string;
  category: string;
  amount: number;
  month: string;
  createdAt: any;
}

const CATEGORY_COLORS: Record<string, string> = {
  Food: '#F59E0B',
  Rent: '#3B82F6',
  Travel: '#10B981',
  Utilities: '#8B5CF6',
  Entertainment: '#EC4899',
  Shopping: '#F43F5E',
  Health: '#14B8A6',
  Other: '#6B7280',
};

// --- Components ---

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
  const [categoryRules, setCategoryRules] = useState<CategoryRule[]>([]);
  const [budgetGoals, setBudgetGoals] = useState<BudgetGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    } else {
      setIsDarkMode(false);
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    if (isDarkMode) {
      document.documentElement.classList.remove('dark');
      localStorage.theme = 'light';
      setIsDarkMode(false);
    } else {
      document.documentElement.classList.add('dark');
      localStorage.theme = 'dark';
      setIsDarkMode(true);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;
    
    if (!user) {
      setExpenses([]);
      setRecurringExpenses([]);
      setCategoryRules([]);
      setBudgetGoals([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'expenses'),
      where('userId', '==', user.uid),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const expensesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Expense[];
      setExpenses(expensesData);
      setLoading(false);
    }, (error) => {
      console.error("Firestore Error: ", error);
      setLoading(false);
    });

    const qRecurring = query(
      collection(db, 'recurringExpenses'),
      where('userId', '==', user.uid)
    );

    const unsubscribeRecurring = onSnapshot(qRecurring, async (snapshot) => {
      const recurringData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as RecurringExpense[];
      setRecurringExpenses(recurringData);

      const today = format(new Date(), 'yyyy-MM-dd');
      for (const recurring of recurringData) {
        if (recurring.nextDueDate <= today) {
          try {
            await addDoc(collection(db, 'expenses'), {
              userId: user.uid,
              description: recurring.description,
              amount: recurring.amount,
              category: recurring.category,
              date: recurring.nextDueDate,
              createdAt: serverTimestamp()
            });

            const nextDate = new Date(recurring.nextDueDate);
            if (recurring.frequency === 'daily') nextDate.setDate(nextDate.getDate() + 1);
            else if (recurring.frequency === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
            else if (recurring.frequency === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
            else if (recurring.frequency === 'yearly') nextDate.setFullYear(nextDate.getFullYear() + 1);

            await updateDoc(doc(db, 'recurringExpenses', recurring.id), {
              nextDueDate: format(nextDate, 'yyyy-MM-dd')
            });
          } catch (err) {
            console.error("Error processing recurring expense:", err);
          }
        }
      }
    });

    const qRules = query(
      collection(db, 'categoryRules'),
      where('userId', '==', user.uid)
    );

    const unsubscribeRules = onSnapshot(qRules, (snapshot) => {
      setCategoryRules(snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as CategoryRule[]);
    });

    const qBudgets = query(
      collection(db, 'categoryBudgets'),
      where('userId', '==', user.uid)
    );

    const unsubscribeBudgets = onSnapshot(qBudgets, (snapshot) => {
      setBudgetGoals(snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as BudgetGoal[]);
    });

    return () => {
      unsubscribe();
      unsubscribeRecurring();
      unsubscribeRules();
      unsubscribeBudgets();
    };
  }, [user, isAuthReady]);

  if (!isAuthReady || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 transition-colors">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-500" />
      </div>
    );
  }

  const handleLogin = async () => {
    try {
      await loginWithGoogle();
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user') {
        console.log('Sign-in popup closed by user.');
      } else {
        console.error('Login error:', error);
      }
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 p-4 transition-colors">
        <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-8 text-center border border-gray-100 dark:border-gray-800">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mx-auto mb-6">
            <Activity className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-50 mb-2">AI Expense Analyzer</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-8">Track, categorize, and gain intelligent insights into your spending habits.</p>
          <button
            onClick={handleLogin}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-50 font-sans transition-colors duration-200">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center">
              <Activity className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Expense Analyzer</h1>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={toggleTheme}
              className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
              title="Toggle theme"
            >
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 hidden sm:flex">
              <img src={user.photoURL} alt={user.displayName} className="w-8 h-8 rounded-full" />
              <span>{user.displayName}</span>
            </div>
            <button
              onClick={logout}
              className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
              title="Sign out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Form & List */}
          <div className="lg:col-span-1 space-y-8">
            <ExpenseForm userId={user.uid} expenses={expenses} categoryRules={categoryRules} />
            <ExpenseList expenses={expenses} />
            <CategoryRulesList categoryRules={categoryRules} userId={user.uid} />
            <RecurringExpenseList recurringExpenses={recurringExpenses} />
          </div>

          {/* Right Column: Dashboard & Insights */}
          <div className="lg:col-span-2 space-y-8">
            <Dashboard expenses={expenses} recurringExpenses={recurringExpenses} isDarkMode={isDarkMode} budgetGoals={budgetGoals} userId={user.uid} />
            <AIInsights expenses={expenses} />
          </div>
        </div>
      </main>
    </div>
  );
}

function ExpenseForm({ userId, expenses, categoryRules }: { userId: string, expenses: Expense[], categoryRules: CategoryRule[] }) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [frequency, setFrequency] = useState('none');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [suggestedCategory, setSuggestedCategory] = useState<string | null>(null);
  const [originalAiCategory, setOriginalAiCategory] = useState<string | null>(null);
  const [isAskingRuleConfirmation, setIsAskingRuleConfirmation] = useState(false);
  const [ruleKeyword, setRuleKeyword] = useState('');

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description || !amount || !date) return;

    setIsSubmitting(true);
    try {
      // 1. Check for hard matches in custom rules first
      const lowerDesc = description.toLowerCase();
      const matchedRule = categoryRules.find(rule => 
        lowerDesc.includes(rule.keyword.toLowerCase())
      );

      if (matchedRule) {
        setSuggestedCategory(matchedRule.category);
        setOriginalAiCategory(matchedRule.category);
        setIsSubmitting(false);
        return;
      }

      let contextStr = '';
      if (categoryRules.length > 0) {
        contextStr += `User's custom categorization rules:\n${categoryRules.map(r => `- If expense description involves "${r.keyword}", strictly categorize as -> ${r.category}`).join('\n')}\n\n`;
      }
      
      const recentExpenses = expenses.slice(0, 10);
      if (recentExpenses.length > 0) {
        contextStr += `Here are some of the user's past expenses and their corrected categories. Use them as reference for the user's categorization habits:\n${recentExpenses.map(e => `- "${e.description}" -> ${e.category}`).join('\n')}\n\n`;
      }

      // Call AI to categorize
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `${contextStr}Categorize the following expense: "${description}" for amount ₹${amount}. Return only a JSON object with a 'category' string field. Choose from: Food, Rent, Travel, Utilities, Entertainment, Shopping, Health, Other.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              category: {
                type: Type.STRING,
                description: "The category of the expense"
              }
            },
            required: ["category"]
          }
        }
      });
      
      const data = JSON.parse(response.text || '{"category": "Other"}');
      setSuggestedCategory(data.category || 'Other');
      setOriginalAiCategory(data.category || 'Other');
    } catch (error) {
      console.error("Error analyzing expense:", error);
      alert("Failed to analyze expense. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmNext = async () => {
    if (originalAiCategory && suggestedCategory !== originalAiCategory && !isAskingRuleConfirmation) {
      // Suggest a good keyword for the rule (simplistic: first two words or full description)
      const words = description.split(' ');
      const suggestedKeyword = words.length > 2 ? words.slice(0, 2).join(' ') : description;
      setRuleKeyword(suggestedKeyword);
      setIsAskingRuleConfirmation(true);
      return;
    }
    await executeSaveOperation(false);
  };

  const handleConfirmRule = async (saveRule: boolean) => {
    await executeSaveOperation(saveRule);
  };

  const executeSaveOperation = async (saveRule: boolean) => {
    setIsSubmitting(true);
    try {
      const category = suggestedCategory || 'Other';

      if (frequency === 'none') {
        await addDoc(collection(db, 'expenses'), {
          userId,
          description,
          amount: parseFloat(amount),
          category,
          date,
          createdAt: serverTimestamp()
        });
      } else {
        // Create recurring expense template
        await addDoc(collection(db, 'recurringExpenses'), {
          userId,
          description,
          amount: parseFloat(amount),
          category,
          frequency,
          nextDueDate: date,
          createdAt: serverTimestamp()
        });
      }

      if (saveRule) {
        await addDoc(collection(db, 'categoryRules'), {
          userId,
          keyword: ruleKeyword || description,
          category,
          createdAt: serverTimestamp()
        });
      }

      setDescription('');
      setAmount('');
      setFrequency('none');
      setSuggestedCategory(null);
      setOriginalAiCategory(null);
      setRuleKeyword('');
      setIsAskingRuleConfirmation(false);
    } catch (error) {
      console.error("Error adding expense:", error);
      alert("Failed to add expense. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isAskingRuleConfirmation && suggestedCategory) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 transition-colors duration-200 animate-in fade-in zoom-in-95">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl">
            <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h2 className="text-lg font-semibold text-indigo-900 dark:text-indigo-100">
            Train the AI
          </h2>
        </div>
        
        <div className="space-y-4">
          <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl space-y-3">
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              You corrected the category from <span className="text-gray-500 line-through">{originalAiCategory}</span> to <span className="font-semibold text-indigo-600 dark:text-indigo-400">{suggestedCategory}</span>.
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Create a rule so the AI automatically uses <span className="font-medium text-gray-900 dark:text-gray-100">{suggestedCategory}</span> for similar items.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Rule Keyword (e.g., "Uber" instead of "Uber Bangalore")</label>
            <input
              type="text"
              value={ruleKeyword}
              onChange={(e) => setRuleKeyword(e.target.value)}
              className="w-full px-4 py-2.5 bg-white dark:bg-gray-950 border border-indigo-100 dark:border-indigo-900/50 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-gray-900 dark:text-gray-50 font-medium"
              placeholder="Enter keyword or phrase"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => handleConfirmRule(false)}
              disabled={isSubmitting}
              className="flex-1 py-2.5 px-4 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-50 rounded-xl font-medium transition-colors disabled:opacity-70 text-sm"
            >
              Skip Rule
            </button>
            <button
              onClick={() => handleConfirmRule(true)}
              disabled={isSubmitting}
              className="flex-[1.5] py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-70 text-sm shadow-indigo-200 dark:shadow-none shadow-lg"
            >
              {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : 'Save Rule & Add'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (suggestedCategory !== null) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 transition-colors duration-200">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-900 dark:text-gray-50">
          <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-500" />
          Confirm Category
        </h2>
        <div className="space-y-4">
          <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl space-y-2">
            <p className="text-sm text-gray-600 dark:text-gray-400"><span className="font-medium text-gray-900 dark:text-gray-100">Description:</span> {description}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400"><span className="font-medium text-gray-900 dark:text-gray-100">Amount:</span> ₹{amount}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400"><span className="font-medium text-gray-900 dark:text-gray-100">{frequency === 'none' ? 'Date:' : 'Start Date:'}</span> {date}</p>
            {frequency !== 'none' && (
              <p className="text-sm text-gray-600 dark:text-gray-400"><span className="font-medium text-gray-900 dark:text-gray-100">Repeat:</span> <span className="capitalize">{frequency}</span></p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">AI Suggested Category (Edit to Correct)</label>
            <select
              value={suggestedCategory}
              onChange={(e) => setSuggestedCategory(e.target.value)}
              className="w-full px-4 py-2 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-gray-900 dark:text-gray-50"
            >
              {Object.keys(CATEGORY_COLORS).map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Correcting categories helps the AI learn your habits for future expenses!
            </p>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => { setSuggestedCategory(null); setOriginalAiCategory(null); }}
              disabled={isSubmitting}
              className="flex-[1] py-2.5 px-4 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-50 rounded-xl font-medium transition-colors disabled:opacity-70"
            >
              Back
            </button>
            <button
              onClick={handleConfirmNext}
              disabled={isSubmitting}
              className="flex-[2] py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Adding...</> : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 transition-colors duration-200">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-900 dark:text-gray-50">
        <Plus className="w-5 h-5 text-blue-600 dark:text-blue-500" />
        Add Expense
      </h2>
      <form onSubmit={handleAnalyze} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g., Uber to airport"
            className="w-full px-4 py-2 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-gray-900 dark:text-gray-50 placeholder-gray-400 dark:placeholder-gray-500"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Amount (₹)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-2 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-gray-900 dark:text-gray-50 placeholder-gray-400 dark:placeholder-gray-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{frequency === 'none' ? 'Date' : 'Start Date'}</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-2 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-gray-900 dark:text-gray-50"
              required
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Repeat</label>
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            className="w-full px-4 py-2 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-gray-900 dark:text-gray-50"
          >
            <option value="none">None (One-time)</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-2.5 px-4 bg-gray-900 dark:bg-blue-600 hover:bg-gray-800 dark:hover:bg-blue-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
        >
          {isSubmitting ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</>
          ) : (
            <><Sparkles className="w-4 h-4" /> Analyze & Review</>
          )}
        </button>
      </form>
    </div>
  );
}

function ExpenseList({ expenses }: { expenses: Expense[] }) {
  const [showFilters, setShowFilters] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);

  const confirmDelete = async () => {
    if (!expenseToDelete) return;
    try {
      await deleteDoc(doc(db, 'expenses', expenseToDelete));
    } catch (error) {
      console.error("Error deleting expense:", error);
    } finally {
      setExpenseToDelete(null);
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setCategoryFilter('All');
    setStartDate('');
    setEndDate('');
    setMinAmount('');
    setMaxAmount('');
  };

  const filteredExpenses = expenses.filter(expense => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!expense.description.toLowerCase().includes(q) && !expense.category.toLowerCase().includes(q)) {
        return false;
      }
    }
    if (categoryFilter !== 'All' && expense.category !== categoryFilter) return false;
    if (startDate && expense.date < startDate) return false;
    if (endDate && expense.date > endDate) return false;
    if (minAmount && expense.amount < parseFloat(minAmount)) return false;
    if (maxAmount && expense.amount > parseFloat(maxAmount)) return false;
    return true;
  });

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 transition-colors duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50 whitespace-nowrap">Recent Expenses</h2>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-48">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search expenses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-gray-900 dark:text-gray-50 transition-colors"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="p-1.5 sm:p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors flex items-center gap-1 text-sm font-medium border border-transparent hover:border-indigo-100 dark:hover:border-indigo-800/50 flex-shrink-0"
          >
            <Filter className="w-4 h-4" />
            <span className="hidden sm:inline">Filter</span>
            {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl space-y-4 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Filter Options</h3>
            <button onClick={clearFilters} className="text-xs text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 flex items-center gap-1">
              <X className="w-3 h-3" /> Clear All
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Category</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full px-3 py-1.5 text-sm bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-gray-900 dark:text-gray-50"
              >
                <option value="All">All Categories</option>
                {Object.keys(CATEGORY_COLORS).map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Min (₹)</label>
                <input
                  type="number"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-1.5 text-sm bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-gray-900 dark:text-gray-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Max (₹)</label>
                <input
                  type="number"
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                  placeholder="Any"
                  className="w-full px-3 py-1.5 text-sm bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-gray-900 dark:text-gray-50"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-1.5 text-sm bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-gray-900 dark:text-gray-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-1.5 text-sm bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-gray-900 dark:text-gray-50"
              />
            </div>
          </div>
        </div>
      )}

      {expenses.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm text-center py-8">No expenses yet. Add one above!</p>
      ) : filteredExpenses.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm text-center py-8">No expenses match your filters.</p>
      ) : (
        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
          {filteredExpenses.map((expense) => (
            <div key={expense.id} className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-xl transition-colors group">
              <div className="flex items-center gap-3">
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium text-xs shadow-sm"
                  style={{ backgroundColor: CATEGORY_COLORS[expense.category] || CATEGORY_COLORS.Other }}
                >
                  {expense.category.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">{expense.description}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{expense.date} • {expense.category}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-gray-900 dark:text-gray-100">₹{expense.amount.toFixed(2)}</span>
                <button
                  onClick={() => setExpenseToDelete(expense.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {expenseToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100 dark:border-gray-700">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-2">Delete Expense</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Are you sure you want to delete this expense? This action cannot be undone.
              </p>
            </div>
            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 flex justify-end gap-3 rounded-b-2xl border-t border-gray-100 dark:border-gray-700/50">
              <button
                onClick={() => setExpenseToDelete(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryRulesList({ categoryRules, userId }: { categoryRules: CategoryRule[], userId: string }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('Food');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword) return;
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'categoryRules'), {
        userId,
        keyword,
        category,
        createdAt: serverTimestamp()
      });
      setKeyword('');
      setShowAddForm(false);
    } catch (error) {
      console.error("Error adding rule:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm("Delete this rule? The AI will no longer use it for categorization.")) return;
    try {
      await deleteDoc(doc(db, 'categoryRules', id));
    } catch (error) {
      console.error("Error deleting rule:", error);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 transition-colors duration-200">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50 flex items-center gap-2">
          <Filter className="w-5 h-5 text-purple-600 dark:text-purple-500" />
          Categorization Rules
        </h2>
        <button 
          onClick={() => setShowAddForm(!showAddForm)}
          className="p-1.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
          title="Add custom rule"
        >
          {showAddForm ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleAddRule} className="mb-6 p-4 bg-purple-50/50 dark:bg-purple-950/20 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-2">
          <div>
            <label className="block text-xs font-medium text-purple-700 dark:text-purple-300 mb-1 uppercase tracking-wider">If description contains:</label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="e.g., Starbucks, Amazon"
              className="w-full px-3 py-1.5 text-sm bg-white dark:bg-gray-950 border border-purple-100 dark:border-purple-900/50 rounded-lg focus:ring-1 focus:ring-purple-500 outline-none text-gray-900 dark:text-gray-50"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-purple-700 dark:text-purple-300 mb-1 uppercase tracking-wider">Categorize as:</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-1.5 text-sm bg-white dark:bg-gray-950 border border-purple-100 dark:border-purple-900/50 rounded-lg focus:ring-1 focus:ring-purple-500 outline-none text-gray-900 dark:text-gray-50"
            >
              {Object.keys(CATEGORY_COLORS).map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
          >
            {isSubmitting ? 'Saving...' : 'Add AI Rule'}
          </button>
        </form>
      )}

      {categoryRules.length === 0 ? (
        <div className="text-center py-6 bg-gray-50 dark:bg-gray-800/30 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">No custom rules yet. Train the AI or add one above!</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2">
          {categoryRules.map((rule) => (
            <div key={rule.id} className="flex items-center justify-between p-2.5 bg-gray-50/50 dark:bg-gray-800/30 hover:bg-white dark:hover:bg-gray-800 rounded-xl border border-transparent hover:border-gray-100 dark:hover:border-gray-700 transition-all group">
              <div className="flex items-center gap-3">
                <div className="px-2 py-1 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded text-[10px] font-bold uppercase tracking-tight">
                  IF: "{rule.keyword}"
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[rule.category] || '#6B7280' }} />
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{rule.category}</span>
                </div>
              </div>
              <button
                onClick={() => handleDeleteRule(rule.id)}
                className="p-1.5 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                title="Remove rule"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RecurringExpenseList({ recurringExpenses }: { recurringExpenses: RecurringExpense[] }) {
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);

  const confirmDelete = async () => {
    if (!expenseToDelete) return;
    try {
      await deleteDoc(doc(db, 'recurringExpenses', expenseToDelete));
    } catch (error) {
      console.error("Error deleting recurring expense:", error);
    } finally {
      setExpenseToDelete(null);
    }
  };

  if (recurringExpenses.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 transition-colors duration-200">
      <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-50 flex items-center gap-2">
        <Repeat className="w-5 h-5 text-indigo-600 dark:text-indigo-500" />
        Recurring Expenses
      </h2>
      <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
        {recurringExpenses.map((expense) => (
          <div key={expense.id} className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-xl transition-colors group">
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium text-xs shadow-sm"
                style={{ backgroundColor: CATEGORY_COLORS[expense.category] || CATEGORY_COLORS.Other }}
              >
                {expense.category.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">{expense.description}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                  {expense.frequency} • Next: {expense.nextDueDate}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-semibold text-gray-900 dark:text-gray-100">₹{expense.amount.toFixed(2)}</span>
              <button
                onClick={() => setExpenseToDelete(expense.id)}
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                title="Delete recurring expense"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {expenseToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100 dark:border-gray-700">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-2">Delete Recurring Expense</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Are you sure you want to stop tracking this recurring expense? Future instances will not be logged.
              </p>
            </div>
            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 flex justify-end gap-3 rounded-b-2xl border-t border-gray-100 dark:border-gray-700/50">
              <button
                onClick={() => setExpenseToDelete(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Dashboard({ expenses, recurringExpenses, isDarkMode, budgetGoals, userId }: { expenses: Expense[], recurringExpenses: RecurringExpense[], isDarkMode: boolean, budgetGoals: BudgetGoal[], userId: string }) {
  const [selectedDashboardMonth, setSelectedDashboardMonth] = useState(format(new Date(), 'yyyy-MM'));
  const currentMonthStr = format(new Date(), 'yyyy-MM');
  
  const totalSpent = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  
  // Group by category for selected month
  const monthExpenses = expenses.filter(exp => exp.date.startsWith(selectedDashboardMonth));
  const monthCategoryData = monthExpenses.reduce((acc, exp) => {
    acc[exp.category] = (acc[exp.category] || 0) + exp.amount;
    return acc;
  }, {} as Record<string, number>);

  // State for setting budgets
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [budgetCategory, setBudgetCategory] = useState('Food');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [isSubmittingBudget, setIsSubmittingBudget] = useState(false);

  const monthBudgets = budgetGoals.filter(b => b.month === selectedDashboardMonth);
  const totalMonthSpent = monthExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  const totalMonthBudgetLimit = monthBudgets.reduce((sum, b) => sum + b.amount, 0);
  const totalBudgetPercent = totalMonthBudgetLimit > 0 ? Math.min(100, (totalMonthSpent / totalMonthBudgetLimit) * 100) : 0;

  // Upcoming recurring expenses alerts
  const today = new Date();
  const next7Days = new Date();
  next7Days.setDate(today.getDate() + 7);
  const todayStr = format(today, 'yyyy-MM-dd');
  const nextWeekStr = format(next7Days, 'yyyy-MM-dd');

  const upcomingExpenses = recurringExpenses.filter(re => re.nextDueDate >= todayStr && re.nextDueDate <= nextWeekStr)
    .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));

  const navigateMonth = (direction: number) => {
    const currentMonthDate = parse(selectedDashboardMonth, 'yyyy-MM', new Date());
    const nextMonthDate = direction > 0 ? addMonths(currentMonthDate, 1) : subMonths(currentMonthDate, 1);
    setSelectedDashboardMonth(format(nextMonthDate, 'yyyy-MM'));
  };

  const handleSetBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!budgetAmount) return;
    setIsSubmittingBudget(true);

    try {
      const existingBudget = monthBudgets.find(b => b.category === budgetCategory);
      if (existingBudget) {
        await updateDoc(doc(db, 'categoryBudgets', existingBudget.id), {
          amount: parseFloat(budgetAmount)
        });
      } else {
        await addDoc(collection(db, 'categoryBudgets'), {
          userId,
          category: budgetCategory,
          amount: parseFloat(budgetAmount),
          month: selectedDashboardMonth,
          createdAt: serverTimestamp()
        });
      }
      setBudgetAmount('');
      setShowBudgetModal(false);
    } catch (error) {
      console.error("Error setting budget:", error);
    } finally {
      setIsSubmittingBudget(false);
    }
  };

  const handleDeleteBudget = async (id: string) => {
    if (!confirm("Are you sure you want to delete this budget goal?")) return;
    try {
      await deleteDoc(doc(db, 'categoryBudgets', id));
    } catch (error) {
      console.error("Error deleting budget:", error);
    }
  };

  const pieData = Object.entries(monthCategoryData).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  // Group by date (last 7 days)
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return format(d, 'yyyy-MM-dd');
  }).reverse();

  const barData = last7Days.map(date => {
    const dayTotal = expenses.filter(e => e.date === date).reduce((sum, e) => sum + e.amount, 0);
    return { date: format(new Date(date), 'MMM dd'), amount: dayTotal };
  });

  const tooltipStyle = {
    backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF',
    borderColor: isDarkMode ? '#374151' : '#F3F4F6',
    color: isDarkMode ? '#F9FAFB' : '#111827',
    borderRadius: '12px',
    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
  };

  // Group by date for the selected month to show daily pattern
  const selectedDate = parse(selectedDashboardMonth, 'yyyy-MM', new Date());
  const daysInSelectedMonth = eachDayOfInterval({ 
    start: startOfMonth(selectedDate), 
    end: endOfMonth(selectedDate) 
  });

  const monthDailyAggregated = monthExpenses.reduce((acc, exp) => {
    acc[exp.date] = (acc[exp.date] || 0) + exp.amount;
    return acc;
  }, {} as Record<string, number>);

  const monthDailyData = daysInSelectedMonth.map(day => {
    const dateStr = format(day, 'yyyy-MM-dd');
    return {
      day: format(day, 'd'),
      date: format(day, 'MMM dd'),
      amount: monthDailyAggregated[dateStr] || 0
    };
  });

  return (
    <div className="space-y-6">
      {/* Upcoming Alerts */}
      {upcomingExpenses.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-2xl p-4 flex items-start gap-4 transition-colors">
          <div className="p-2 bg-amber-100 dark:bg-amber-900/40 rounded-xl">
            <Bell className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-amber-900 dark:text-amber-100 text-sm">Upcoming Recurring Expenses</h3>
            <div className="mt-2 space-y-2">
              {upcomingExpenses.map(expense => (
                <div key={expense.id} className="flex items-center justify-between text-xs text-amber-800 dark:text-amber-200">
                  <span>
                    <span className="font-medium mr-1 text-amber-900 dark:text-amber-50">{expense.description}</span>
                    due on {expense.nextDueDate}
                  </span>
                  <span className="font-bold">₹{expense.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Month Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-gray-900 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-50 dark:bg-indigo-900/40 rounded-xl">
            <Calendar className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-50 leading-tight">
              {format(parse(selectedDashboardMonth, 'yyyy-MM', new Date()), 'MMMM yyyy')}
            </h2>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Monthly Performance</p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button 
            onClick={() => navigateMonth(-1)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors text-gray-600 dark:text-gray-400 border border-gray-100 dark:border-gray-800"
            title="Previous Month"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setSelectedDashboardMonth(currentMonthStr)}
            className={cn(
              "px-4 py-2 text-xs font-bold rounded-xl transition-all border",
              selectedDashboardMonth === currentMonthStr 
                ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-200 dark:shadow-none"
                : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-100 dark:border-gray-800 hover:bg-gray-50"
            )}
          >
            Current Month
          </button>
          <button 
            onClick={() => navigateMonth(1)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors text-gray-600 dark:text-gray-400 border border-gray-100 dark:border-gray-800"
            title="Next Month"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 transition-colors duration-200">
          <div className="flex items-center gap-3 mb-2 text-gray-500 dark:text-gray-400">
            <DollarSign className="w-5 h-5 text-blue-600 dark:text-blue-500" />
            <span className="font-medium text-sm">Total Spent</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-50">₹{totalSpent.toFixed(2)}</p>
          <p className="text-xs text-gray-500 mt-1">All time</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 transition-colors duration-200">
          <div className="flex items-center gap-3 mb-2 text-gray-500 dark:text-gray-400">
            <Activity className="w-5 h-5 text-green-600 dark:text-green-500" />
            <span className="font-medium text-sm">Monthly Spent</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-50">₹{totalMonthSpent.toFixed(2)}</p>
          <p className="text-xs text-gray-500 mt-1">{format(parse(selectedDashboardMonth, 'yyyy-MM', new Date()), 'MMMM yyyy')}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 transition-colors duration-200">
          <div className="flex items-center gap-3 mb-2 text-gray-500 dark:text-gray-400">
            <Target className="w-5 h-5 text-indigo-600 dark:text-indigo-500" />
            <span className="font-medium text-sm">Budget Progress</span>
          </div>
          <div className="flex items-end gap-2">
            <p className="text-3xl font-bold text-gray-900 dark:text-gray-50">{totalBudgetPercent.toFixed(0)}%</p>
            <p className="text-xs text-gray-500 mb-1">of total budget</p>
          </div>
          <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 mt-3 overflow-hidden">
            <div 
              className={cn("h-full transition-all duration-1000", totalBudgetPercent > 90 ? "bg-red-500" : "bg-indigo-500")}
              style={{ width: `${totalBudgetPercent}%` }}
            />
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 transition-colors duration-200">
          <div className="flex items-center gap-3 mb-2 text-gray-500 dark:text-gray-400">
            <PieChartIcon className="w-5 h-5 text-purple-600 dark:text-purple-500" />
            <span className="font-medium text-sm">Top Category</span>
          </div>
          <p className="text-xl font-bold text-gray-900 dark:text-gray-50 truncate">
            {pieData.length > 0 ? pieData[0].name : '-'}
          </p>
          <p className="text-xs text-gray-500 mt-1">Highest spending</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 transition-colors duration-200">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50 mb-4 flex items-center gap-2">
            <PieChartIcon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            Spending by Category
          </h3>
          <div className="h-64">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    stroke={isDarkMode ? '#111827' : '#FFFFFF'}
                    strokeWidth={2}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.name] || CATEGORY_COLORS.Other} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    formatter={(value: number) => `₹${value.toFixed(2)}`}
                    contentStyle={tooltipStyle}
                    itemStyle={{ color: isDarkMode ? '#F9FAFB' : '#111827' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">No data to display</div>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 transition-colors duration-200">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            Last 7 Days
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#374151' : '#E5E7EB'} />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: isDarkMode ? '#9CA3AF' : '#6B7280' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: isDarkMode ? '#9CA3AF' : '#6B7280' }} tickFormatter={(val) => `₹${val}`} />
                <RechartsTooltip 
                  cursor={{ fill: isDarkMode ? '#374151' : '#F3F4F6' }}
                  formatter={(value: number) => [`₹${value.toFixed(2)}`, 'Spent']}
                  contentStyle={tooltipStyle}
                  itemStyle={{ color: isDarkMode ? '#F9FAFB' : '#111827' }}
                />
                <Bar dataKey="amount" fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Monthly Daily Pattern Chart */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 transition-colors duration-200">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50 mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          Monthly Spending Pattern ({format(selectedDate, 'MMMM')})
        </h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthDailyData}>
              <defs>
                <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#374151' : '#E5E7EB'} />
              <XAxis 
                dataKey="day" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fill: isDarkMode ? '#9CA3AF' : '#6B7280' }} 
                interval={2}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fill: isDarkMode ? '#9CA3AF' : '#6B7280' }} 
                tickFormatter={(val) => `₹${val}`} 
              />
              <RechartsTooltip 
                formatter={(value: number) => [`₹${value.toFixed(2)}`, 'Daily Spent']}
                labelFormatter={(label) => `Day ${label}`}
                contentStyle={tooltipStyle}
                itemStyle={{ color: isDarkMode ? '#F9FAFB' : '#111827' }}
              />
              <Area 
                type="monotone" 
                dataKey="amount" 
                stroke="#6366f1" 
                fillOpacity={1} 
                fill="url(#colorAmount)" 
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Budgets Row */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 transition-colors duration-200 relative">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50 flex items-center gap-2">
            <Target className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            Monthly Budgets ({format(parse(selectedDashboardMonth, 'yyyy-MM', new Date()), 'MMMM')})
          </h3>
          <button
            onClick={() => setShowBudgetModal(true)}
            className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
          >
            Set Budget
          </button>
        </div>

        {monthBudgets.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">No budgets set for {format(parse(selectedDashboardMonth, 'yyyy-MM', new Date()), 'MMMM')}.</p>
            <button
              onClick={() => setShowBudgetModal(true)}
              className="text-xs font-semibold py-1.5 px-3 bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
            >
              Get Started
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
            {monthBudgets
              .map(budget => {
                const spent = monthCategoryData[budget.category] || 0;
                const percent = Math.min(100, Math.round((spent / budget.amount) * 100));
                const usagePercent = (spent / budget.amount) * 100;
                return { ...budget, spent, percent, usagePercent, isOver: spent > budget.amount };
              })
              .sort((a, b) => b.usagePercent - a.usagePercent)
              .map(budget => (
                <div key={budget.id} className="space-y-2 group relative">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[budget.category] || '#6B7280' }} />
                      {budget.category}
                      {budget.isOver && (
                        <span className="flex h-2 w-2 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-500 dark:text-gray-400 text-xs">
                        <span className={budget.isOver ? "text-red-500 font-semibold" : "text-gray-900 dark:text-gray-100 font-medium"}>
                          ₹{budget.spent.toFixed(0)}
                        </span>
                        {" / "}
                        ₹{budget.amount.toFixed(0)}
                      </span>
                      <button 
                        onClick={() => handleDeleteBudget(budget.id)}
                        className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1"
                        title="Delete budget"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2 overflow-hidden shadow-inner">
                    <div 
                      className={cn(
                        "h-2 rounded-full transition-all duration-1000 ease-out",
                        budget.isOver ? 'bg-red-500 shadow-[0_0_8px_#ef4444]' : ''
                      )}
                      style={{ 
                        width: `${budget.percent}%`, 
                        backgroundColor: !budget.isOver ? (CATEGORY_COLORS[budget.category] || '#3B82F6') : undefined,
                        boxShadow: !budget.isOver ? `0 0 8px ${(CATEGORY_COLORS[budget.category] || '#3B82F6')}44` : undefined
                      }}
                    />
                  </div>
                  {budget.isOver && (
                    <p className="text-[10px] font-bold text-red-500 flex items-center gap-1 uppercase tracking-tight">
                      Alert: Budget exceeded by ₹{(budget.spent - budget.amount).toFixed(0)}
                    </p>
                  )}
                </div>
              ))}
          </div>
        )}

        {showBudgetModal && (
          <div className="absolute top-0 left-0 w-full h-full bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm rounded-2xl flex items-center justify-center p-6 z-10">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 w-full max-w-sm animate-in fade-in zoom-in-95">
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-50">Set Budget Goal</h4>
                <button onClick={() => setShowBudgetModal(false)} className="text-gray-500 hover:text-gray-900 dark:hover:text-gray-100">
                  <X className="w-5 h-5"/>
                </button>
              </div>
              <form onSubmit={handleSetBudget} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
                  <select
                    value={budgetCategory}
                    onChange={(e) => setBudgetCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-gray-50"
                  >
                    {Object.keys(CATEGORY_COLORS).map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Monthly Amount (₹)</label>
                  <input
                    type="number"
                    value={budgetAmount}
                    onChange={(e) => setBudgetAmount(e.target.value)}
                    placeholder="Enter budget limit"
                    required
                    min="1"
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-gray-50"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmittingBudget}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {isSubmittingBudget ? 'Saving...' : 'Save Budget'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AIInsights({ expenses }: { expenses: Expense[] }) {
  const [insights, setInsights] = useState<{ insights: string, recommendations: string[] } | null>(null);
  const [loading, setLoading] = useState(false);

  const generateInsights = async () => {
    if (expenses.length === 0) return;
    
    setLoading(true);
    try {
      // Get last 30 expenses to avoid token limits
      const recentExpenses = expenses.slice(0, 30);
      const expensesSummary = recentExpenses.map((e: any) => `${e.date}: ${e.description} - ₹${e.amount} (${e.category})`).join("\n");
      
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `Analyze these recent expenses and provide financial insights and saving recommendations:\n${expensesSummary}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              insights: {
                type: Type.STRING,
                description: "A short paragraph summarizing spending habits and trends."
              },
              recommendations: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Actionable tips to save money based on the expenses."
              }
            },
            required: ["insights", "recommendations"]
          }
        }
      });
      
      const data = JSON.parse(response.text || '{"insights": "Unable to analyze.", "recommendations": []}');
      setInsights(data);
    } catch (error) {
      console.error("Error generating insights:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/40 dark:to-blue-900/20 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-800/50 p-6 transition-colors duration-200">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-indigo-900 dark:text-indigo-100 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          AI Financial Insights
        </h2>
        <button
          onClick={generateInsights}
          disabled={loading || expenses.length === 0}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</> : 'Generate Insights'}
        </button>
      </div>

      {!insights && !loading && (
        <div className="text-center py-8">
          <p className="text-indigo-800/70 dark:text-indigo-200/70 text-sm">Click generate to let AI analyze your spending patterns and provide personalized recommendations.</p>
        </div>
      )}

      {insights && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-indigo-100 dark:border-indigo-800/50 shadow-sm relative overflow-hidden group hover:border-indigo-200 dark:hover:border-indigo-700/80 transition-colors">
            <div className="absolute -top-6 -right-6 p-4 opacity-5 dark:opacity-10 pointer-events-none group-hover:scale-110 transition-transform duration-500">
              <Lightbulb className="w-32 h-32 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="relative z-10">
              <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-100 mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-500" />
                Spending Analysis
              </h3>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-sm">
                {insights.insights}
              </p>
            </div>
          </div>
          
          {insights.recommendations && insights.recommendations.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-100 mb-4 flex items-center gap-2">
                <Target className="w-4 h-4 text-indigo-500" />
                Actionable Recommendations
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {insights.recommendations.map((rec, i) => (
                  <div key={i} className="bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm rounded-2xl p-5 border border-indigo-50 dark:border-indigo-800/30 hover:border-indigo-200 dark:hover:border-indigo-700/80 hover:shadow-md transition-all group flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                      <span className="text-sm font-bold">{i + 1}</span>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mt-1">
                      {rec}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
