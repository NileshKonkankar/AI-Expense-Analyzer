import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, updateDoc, doc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db, auth, loginWithGoogle, logout } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { format } from 'date-fns';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Plus, Trash2, LogOut, Loader2, Sparkles, TrendingUp, DollarSign, PieChart as PieChartIcon, Activity, Sun, Moon, Repeat } from 'lucide-react';
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

    return () => {
      unsubscribe();
      unsubscribeRecurring();
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
            <ExpenseForm userId={user.uid} />
            <ExpenseList expenses={expenses} />
            <RecurringExpenseList recurringExpenses={recurringExpenses} />
          </div>

          {/* Right Column: Dashboard & Insights */}
          <div className="lg:col-span-2 space-y-8">
            <Dashboard expenses={expenses} isDarkMode={isDarkMode} />
            <AIInsights expenses={expenses} />
          </div>
        </div>
      </main>
    </div>
  );
}

function ExpenseForm({ userId }: { userId: string }) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [frequency, setFrequency] = useState('none');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description || !amount || !date) return;

    setIsSubmitting(true);
    try {
      // Call AI to categorize
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Categorize the following expense: "${description}" for amount ₹${amount}. Return only a JSON object with a 'category' string field. Choose from: Food, Rent, Travel, Utilities, Entertainment, Shopping, Health, Other.`,
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
      const category = data.category || 'Other';

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

      setDescription('');
      setAmount('');
      setFrequency('none');
    } catch (error) {
      console.error("Error adding expense:", error);
      alert("Failed to add expense. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 transition-colors duration-200">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-900 dark:text-gray-50">
        <Plus className="w-5 h-5 text-blue-600 dark:text-blue-500" />
        Add Expense
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
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
            <><Loader2 className="w-4 h-4 animate-spin" /> Processing with AI...</>
          ) : (
            'Add Expense'
          )}
        </button>
      </form>
    </div>
  );
}

function ExpenseList({ expenses }: { expenses: Expense[] }) {
  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'expenses', id));
    } catch (error) {
      console.error("Error deleting expense:", error);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 transition-colors duration-200">
      <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-50">Recent Expenses</h2>
      {expenses.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm text-center py-8">No expenses yet. Add one above!</p>
      ) : (
        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
          {expenses.map((expense) => (
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
                  onClick={() => handleDelete(expense.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RecurringExpenseList({ recurringExpenses }: { recurringExpenses: RecurringExpense[] }) {
  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'recurringExpenses', id));
    } catch (error) {
      console.error("Error deleting recurring expense:", error);
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
                onClick={() => handleDelete(expense.id)}
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                title="Delete recurring expense"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Dashboard({ expenses, isDarkMode }: { expenses: Expense[], isDarkMode: boolean }) {
  const totalSpent = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  
  // Group by category
  const categoryData = expenses.reduce((acc, exp) => {
    acc[exp.category] = (acc[exp.category] || 0) + exp.amount;
    return acc;
  }, {} as Record<string, number>);

  const pieData = Object.entries(categoryData).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

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

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 transition-colors duration-200">
          <div className="flex items-center gap-3 mb-2 text-gray-500 dark:text-gray-400">
            <DollarSign className="w-5 h-5 text-blue-600 dark:text-blue-500" />
            <span className="font-medium text-sm">Total Spent</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-50">₹{totalSpent.toFixed(2)}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 transition-colors duration-200">
          <div className="flex items-center gap-3 mb-2 text-gray-500 dark:text-gray-400">
            <Activity className="w-5 h-5 text-green-600 dark:text-green-500" />
            <span className="font-medium text-sm">Transactions</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-50">{expenses.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 transition-colors duration-200">
          <div className="flex items-center gap-3 mb-2 text-gray-500 dark:text-gray-400">
            <PieChartIcon className="w-5 h-5 text-purple-600 dark:text-purple-500" />
            <span className="font-medium text-sm">Top Category</span>
          </div>
          <p className="text-xl font-bold text-gray-900 dark:text-gray-50 truncate">
            {pieData.length > 0 ? pieData[0].name : '-'}
          </p>
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
          <div className="bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm rounded-xl p-5 border border-indigo-100/50 dark:border-indigo-800/50">
            <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-100 mb-2">Spending Analysis</h3>
            <p className="text-sm text-indigo-800 dark:text-indigo-200 leading-relaxed">{insights.insights}</p>
          </div>
          
          {insights.recommendations && insights.recommendations.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-100 mb-3">Recommendations</h3>
              <ul className="space-y-2">
                {insights.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-indigo-800 dark:text-indigo-200">
                    <div className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold">
                      {i + 1}
                    </div>
                    <span className="leading-relaxed">{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
