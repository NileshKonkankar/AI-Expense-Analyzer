import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, updateDoc, doc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db, auth, loginWithGoogle, logout } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { format, addMonths, subMonths, parse, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameDay, isSameMonth, addYears, subYears } from 'date-fns';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area, Legend } from 'recharts';
import { Plus, Trash2, LogOut, Loader2, Sparkles, TrendingUp, DollarSign, PieChart as PieChartIcon, Activity, Sun, Moon, Repeat, Lightbulb, Target, Filter, ChevronDown, ChevronUp, X, Search, ChevronLeft, ChevronRight, Calendar, Bell, ChevronFirst, ChevronLast, Printer } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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

interface Income {
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

const INCOME_CATEGORY_COLORS: Record<string, string> = {
  Salary: '#10B981',
  Freelance: '#06B6D4',
  Investments: '#3B82F6',
  Refunds: '#F59E0B',
  Grants: '#8B5CF6',
  Other: '#6B7280',
};

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Helper Hook ---
function useClickOutside(ref: React.RefObject<HTMLDivElement | null>, handler: () => void) {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) return;
      handler();
    };
    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler]);
}

// --- Components ---

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
}

function DatePicker({ value, onChange, label, className }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(value ? parse(value, 'yyyy-MM-dd', new Date()) : new Date());
  const containerRef = React.useRef<HTMLDivElement>(null);

  useClickOutside(containerRef, () => setIsOpen(false));

  const selectedDate = value ? parse(value, 'yyyy-MM-dd', new Date()) : null;

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(viewDate)),
    end: endOfWeek(endOfMonth(viewDate))
  });

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.preventDefault();
    setViewDate(subMonths(viewDate, 1));
  };
  
  const handleNextMonth = (e: React.MouseEvent) => {
    e.preventDefault();
    setViewDate(addMonths(viewDate, 1));
  };

  const handlePrevYear = (e: React.MouseEvent) => {
    e.preventDefault();
    setViewDate(subYears(viewDate, 1));
  };

  const handleNextYear = (e: React.MouseEvent) => {
    e.preventDefault();
    setViewDate(addYears(viewDate, 1));
  };

  const handleDateSelect = (date: Date) => {
    onChange(format(date, 'yyyy-MM-dd'));
    setIsOpen(false);
  };

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      {label && <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-2 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-gray-900 dark:text-gray-50 text-left"
      >
        <span className={cn(!value && "text-gray-400 dark:text-gray-500")}>
          {value ? format(parse(value, 'yyyy-MM-dd', new Date()), 'MMM dd, yyyy') : 'Select date'}
        </span>
        <Calendar className="w-4 h-4 text-gray-400" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute z-50 mt-2 p-4 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-xl w-72"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-1">
                <button onClick={handlePrevYear} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 transition-colors">
                  <ChevronFirst className="w-4 h-4" />
                </button>
                <button onClick={handlePrevMonth} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
              <span className="text-sm font-bold text-gray-900 dark:text-gray-50">
                {format(viewDate, 'MMMM yyyy')}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={handleNextMonth} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button onClick={handleNextYear} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 transition-colors">
                  <ChevronLast className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                <div key={day} className="text-center text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-tighter">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {days.map((day, i) => {
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                const isCurrentMonth = isSameMonth(day, viewDate);
                const isToday = isSameDay(day, new Date());

                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleDateSelect(day)}
                    className={cn(
                      "aspect-square flex items-center justify-center text-xs rounded-lg transition-all",
                      !isCurrentMonth && "text-gray-300 dark:text-gray-600",
                      isCurrentMonth && "text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30",
                      isSelected ? "bg-blue-600 text-white hover:bg-blue-700 shadow-md scale-105" : 
                      isToday ? "border border-blue-200 dark:border-blue-800 font-bold" : ""
                    )}
                  >
                    {format(day, 'd')}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-between">
               <button 
                type="button"
                onClick={() => handleDateSelect(new Date())}
                className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
               >
                TODAY
               </button>
               <button 
                type="button"
                onClick={() => { onChange(''); setIsOpen(false); }}
                className="text-[10px] font-bold text-gray-400 hover:underline"
               >
                CLEAR
               </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- App Component ---
export default function App() {
  const [user, setUser] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
  const [categoryRules, setCategoryRules] = useState<CategoryRule[]>([]);
  const [budgetGoals, setBudgetGoals] = useState<BudgetGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeLeftTab, setActiveLeftTab] = useState<'expenses' | 'incomes'>('expenses');

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
      setIncomes([]);
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
      handleFirestoreError(error, OperationType.LIST, 'expenses');
      setLoading(false);
    });

    const qIncomes = query(
      collection(db, 'incomes'),
      where('userId', '==', user.uid),
      orderBy('date', 'desc')
    );

    const unsubscribeIncomes = onSnapshot(qIncomes, (snapshot) => {
      const incomesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Income[];
      setIncomes(incomesData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'incomes');
    });

    const qRecurring = query(
      collection(db, 'recurringExpenses'),
      where('userId', '==', user.uid)
    );

    const unsubscribeRecurring = onSnapshot(qRecurring, (snapshot) => {
      const recurringData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as RecurringExpense[];
      setRecurringExpenses(recurringData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'recurringExpenses');
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
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'categoryRules');
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
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'categoryBudgets');
    });

    return () => {
      unsubscribe();
      unsubscribeIncomes();
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
    <div id="app-container" className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-50 font-sans transition-colors duration-200 print:hidden">
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
          {/* Left Column: Switcher & List */}
          <div className="lg:col-span-1 space-y-6">
            <div className="flex bg-gray-100 dark:bg-gray-800/60 p-1.5 rounded-2xl border border-gray-200/50 dark:border-gray-800/80 gap-2 shadow-inner">
              <button
                onClick={() => setActiveLeftTab('expenses')}
                className={cn(
                  "flex-1 py-2 text-xs font-bold rounded-xl transition-all uppercase tracking-wider flex items-center justify-center gap-1.5",
                  activeLeftTab === 'expenses'
                    ? "bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm border border-gray-100 dark:border-gray-800"
                    : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
                )}
              >
                <DollarSign className="w-4 h-4" />
                Expenses
              </button>
              <button
                onClick={() => setActiveLeftTab('incomes')}
                className={cn(
                  "flex-1 py-2 text-xs font-bold rounded-xl transition-all uppercase tracking-wider flex items-center justify-center gap-1.5",
                  activeLeftTab === 'incomes'
                    ? "bg-white dark:bg-gray-900 text-emerald-600 dark:text-emerald-400 shadow-sm border border-gray-100 dark:border-gray-800"
                    : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
                )}
              >
                <TrendingUp className="w-4 h-4" />
                Incomes
              </button>
            </div>

            {activeLeftTab === 'expenses' ? (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <ExpenseForm userId={user.uid} expenses={expenses} categoryRules={categoryRules} />
                <ExpenseList expenses={expenses} />
                <CategoryRulesList categoryRules={categoryRules} userId={user.uid} />
                <RecurringExpenseList recurringExpenses={recurringExpenses} />
              </div>
            ) : (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <IncomeForm userId={user.uid} />
                <IncomeList incomes={incomes} />
              </div>
            )}
          </div>

          {/* Right Column: Dashboard & Insights */}
          <div className="lg:col-span-2 space-y-8">
            <Dashboard 
              expenses={expenses} 
              incomes={incomes}
              recurringExpenses={recurringExpenses} 
              isDarkMode={isDarkMode} 
              budgetGoals={budgetGoals} 
              userId={user.uid} 
              user={user} 
            />
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
          <DatePicker
            label={frequency === 'none' ? 'Date' : 'Start Date'}
            value={date}
            onChange={(val) => setDate(val)}
            className="w-full"
          />
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
            <DatePicker
              label="Start Date"
              value={startDate}
              onChange={(val) => setStartDate(val)}
              className="w-full"
            />
            <DatePicker
              label="End Date"
              value={endDate}
              onChange={(val) => setEndDate(val)}
              className="w-full"
            />
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

function IncomeForm({ userId }: { userId: string }) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [category, setCategory] = useState('Salary');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description || !amount || !date || !category) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'incomes'), {
        userId,
        description,
        amount: parseFloat(amount),
        category,
        date,
        createdAt: serverTimestamp()
      });

      setDescription('');
      setAmount('');
      setCategory('Salary');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'incomes');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 transition-colors duration-200">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-900 dark:text-gray-50">
        <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-500" />
        Add Income
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4 font-sans">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Source / Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g., Monthly Salary, Consulting fee"
            className="w-full px-4 py-2 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-900 dark:text-gray-50 placeholder-gray-400 dark:placeholder-gray-500"
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
              className="w-full px-4 py-2 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-900 dark:text-gray-50 placeholder-gray-400 dark:placeholder-gray-500"
              required
            />
          </div>
          <DatePicker
            label="Received Date"
            value={date}
            onChange={(val) => setDate(val)}
            className="w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-4 py-2 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all text-gray-900 dark:text-gray-50 font-medium md:text-sm"
          >
            {Object.keys(INCOME_CATEGORY_COLORS).map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-70 shadow-lg shadow-emerald-200 dark:shadow-none"
        >
          {isSubmitting ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Adding Income...</>
          ) : (
            <><Plus className="w-4 h-4" /> Add Income Entry</>
          )}
        </button>
      </form>
    </div>
  );
}

function IncomeList({ incomes }: { incomes: Income[] }) {
  const [showFilters, setShowFilters] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [incomeToDelete, setIncomeToDelete] = useState<string | null>(null);

  const confirmDelete = async () => {
    if (!incomeToDelete) return;
    try {
      await deleteDoc(doc(db, 'incomes', incomeToDelete));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `incomes/${incomeToDelete}`);
    } finally {
      setIncomeToDelete(null);
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setCategoryFilter('All');
    setStartDate('');
    setEndDate('');
  };

  const filteredIncomes = incomes.filter(income => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!income.description.toLowerCase().includes(q) && !income.category.toLowerCase().includes(q)) {
        return false;
      }
    }
    if (categoryFilter !== 'All' && income.category !== categoryFilter) return false;
    if (startDate && income.date < startDate) return false;
    if (endDate && income.date > endDate) return false;
    return true;
  });

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 transition-colors duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50 whitespace-nowrap">Income Entries</h2>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-48">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search income..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-gray-900 dark:text-gray-50 transition-colors"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="p-1.5 sm:p-2 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors flex items-center gap-1 text-sm font-medium border border-transparent hover:border-emerald-100 dark:hover:border-emerald-800/50 flex-shrink-0"
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
                {Object.keys(INCOME_CATEGORY_COLORS).map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">From</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-gray-900 dark:text-gray-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">To</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-gray-900 dark:text-gray-50"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-h-96 overflow-y-auto space-y-2 pr-1">
        {filteredIncomes.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <DollarSign className="w-8 h-8 text-gray-300 dark:text-gray-700 mx-auto mb-2" />
            <p className="text-sm">No incomes matched your filters.</p>
          </div>
        ) : (
          filteredIncomes.map((income) => (
            <div
              key={income.id}
              className="flex items-center justify-between p-3.5 bg-gray-50 dark:bg-gray-800/20 hover:bg-gray-100/50 dark:hover:bg-gray-800/40 rounded-xl transition-all border border-gray-100/50 dark:border-gray-800/50 group"
            >
              <div className="min-w-0 pr-3">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-50 truncate">
                  {income.description}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: INCOME_CATEGORY_COLORS[income.category] || INCOME_CATEGORY_COLORS.Other }}
                  />
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {income.category}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-600">•</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {format(parse(income.date, 'yyyy-MM-dd', new Date()), 'MMM dd, yyyy')}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                  +₹{income.amount.toFixed(2)}
                </span>
                <button
                  type="button"
                  onClick={() => setIncomeToDelete(income.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg hover:opacity-100 focus:opacity-100 transition-all opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                  title="Delete income"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {incomeToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-sm w-full p-6 shadow-xl border border-gray-100 dark:border-gray-800">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-50 mb-2">Delete Income?</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
              Are you sure you want to delete this income entry? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setIncomeToDelete(null)}
                className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 rounded-xl font-semibold text-gray-700 dark:text-gray-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold"
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
  const [ruleToDelete, setRuleToDelete] = useState<string | null>(null);

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

  const confirmDeleteRule = async () => {
    if (!ruleToDelete) return;
    try {
      await deleteDoc(doc(db, 'categoryRules', ruleToDelete));
    } catch (error) {
      console.error("Error deleting rule:", error);
    } finally {
      setRuleToDelete(null);
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
                onClick={() => setRuleToDelete(rule.id)}
                className="p-1.5 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                title="Remove rule"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {ruleToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100 dark:border-gray-700">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-2">Delete AI Rule</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Are you sure you want to delete this rule? The AI will no longer use it for automatic categorization.
              </p>
            </div>
            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 flex justify-end gap-3 rounded-b-2xl border-t border-gray-100 dark:border-gray-700/50">
              <button
                onClick={() => setRuleToDelete(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteRule}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-sm"
              >
                Delete Rule
              </button>
            </div>
          </div>
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

function Dashboard({ expenses, incomes = [], recurringExpenses, isDarkMode, budgetGoals, userId, user }: { expenses: Expense[], incomes: Income[], recurringExpenses: RecurringExpense[], isDarkMode: boolean, budgetGoals: BudgetGoal[], userId: string, user: any }) {
  const [selectedDashboardMonth, setSelectedDashboardMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [compareRange, setCompareRange] = useState<number>(6);
  const [compareChartType, setCompareChartType] = useState<'total' | 'categories'>('total');
  
  // Custom interactive options for printable statement report
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [includeTransactions, setIncludeTransactions] = useState(true);
  const [includeSignature, setIncludeSignature] = useState(true);
  const [customMemo, setCustomMemo] = useState('');
  const [statementTitle, setStatementTitle] = useState('Monthly Financial Statement');
  const currentMonthStr = format(new Date(), 'yyyy-MM');
  
  const totalSpent = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  const totalIncomes = incomes.reduce((sum, inc) => sum + inc.amount, 0);
  const netBalance = totalIncomes - totalSpent;

  // Monthly stats
  const monthIncomes = incomes.filter(inc => inc.date.startsWith(selectedDashboardMonth));
  const totalMonthIncomes = monthIncomes.reduce((sum, inc) => sum + inc.amount, 0);
  const monthExpenses = expenses.filter(exp => exp.date.startsWith(selectedDashboardMonth));
  const totalMonthSpent = monthExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  const monthNetBalance = totalMonthIncomes - totalMonthSpent;
  const monthCategoryData = monthExpenses.reduce((acc, exp) => {
    acc[exp.category] = (acc[exp.category] || 0) + exp.amount;
    return acc;
  }, {} as Record<string, number>);

  // State for setting budgets
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [budgetCategory, setBudgetCategory] = useState('Food');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [isSubmittingBudget, setIsSubmittingBudget] = useState(false);
  const [budgetToDelete, setBudgetToDelete] = useState<string | null>(null);

  const monthBudgets = budgetGoals.filter(b => b.month === selectedDashboardMonth);
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

  const confirmDeleteBudget = async () => {
    if (!budgetToDelete) return;
    try {
      await deleteDoc(doc(db, 'categoryBudgets', budgetToDelete));
    } catch (error) {
      console.error("Error deleting budget:", error);
    } finally {
      setBudgetToDelete(null);
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

  // --- Multi-month comparison calculations ---
  const comparisonMonths = React.useMemo(() => {
    const monthsList = [];
    for (let i = 0; i < compareRange; i++) {
      monthsList.push(format(subMonths(new Date(), i), 'yyyy-MM'));
    }
    return monthsList.reverse(); // chronological order
  }, [compareRange]);

  const multiMonthData = React.useMemo(() => {
    return comparisonMonths.map(month => {
      const monthExp = expenses.filter(e => e.date.startsWith(month));
      const totalSpent = monthExp.reduce((sum, e) => sum + e.amount, 0);
      const monthBudg = budgetGoals.filter(b => b.month === month);
      const totalBudget = monthBudg.reduce((sum, b) => sum + b.amount, 0);

      const categoriesSum: Record<string, number> = {};
      Object.keys(CATEGORY_COLORS).forEach(cat => {
        categoriesSum[cat] = 0;
      });
      monthExp.forEach(e => {
        const cat = e.category || 'Other';
        categoriesSum[cat] = (categoriesSum[cat] || 0) + e.amount;
      });

      const parsedDate = parse(month, 'yyyy-MM', new Date());
      const label = format(parsedDate, 'MMM yy');

      // Find top category
      let topCatName = '-';
      let topCatAmt = 0;
      Object.entries(categoriesSum).forEach(([cat, val]) => {
        if (val > topCatAmt) {
          topCatAmt = val;
          topCatName = cat;
        }
      });

      return {
        monthKey: month,
        label,
        spent: parseFloat(totalSpent.toFixed(2)),
        budget: parseFloat(totalBudget.toFixed(2)),
        numTransactions: monthExp.length,
        topCategory: topCatAmt > 0 ? `${topCatName} (₹${topCatAmt.toFixed(0)})` : '-',
        ...categoriesSum
      };
    });
  }, [comparisonMonths, expenses, budgetGoals]);

  const tableDataWithMom = React.useMemo(() => {
    return multiMonthData.map((data, idx) => {
      let momChange = null;
      if (idx > 0) {
        const prevSpent = multiMonthData[idx - 1].spent;
        if (prevSpent > 0) {
          momChange = ((data.spent - prevSpent) / prevSpent) * 100;
        }
      }
      return {
        ...data,
        momChange
      };
    }).reverse(); // Display latest month first in the table
  }, [multiMonthData]);

  // Budget alerts
  const budgetAlerts = monthBudgets.map(budget => {
    const spent = monthCategoryData[budget.category] || 0;
    const percent = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
    return { ...budget, spent, percent };
  }).filter(b => b.percent >= 80)
    .sort((a, b) => b.percent - a.percent);

  return (
    <div className="space-y-6">
      {/* Alerts & Notifications */}
      {(upcomingExpenses.length > 0 || budgetAlerts.length > 0) && (
        <div className="space-y-3">
          {upcomingExpenses.length > 0 && selectedDashboardMonth === currentMonthStr && (
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

          {budgetAlerts.length > 0 && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-2xl p-4 flex items-start gap-4 transition-colors">
              <div className="p-2 bg-red-100 dark:bg-red-900/40 rounded-xl">
                <Target className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-red-900 dark:text-red-100 text-sm">Budget Alerts for {format(selectedDate, 'MMMM')}</h3>
                <div className="mt-2 space-y-2">
                  {budgetAlerts.map(alert => (
                    <div key={alert.id} className="flex items-center justify-between text-xs text-red-800 dark:text-red-200">
                      <span>
                        <span className="font-medium mr-1 text-red-900 dark:text-red-50">{alert.category}</span>
                        {alert.percent >= 100 ? 'budget exceeded!' : 'nearing budget limit (80%+)'}
                      </span>
                      <span className="font-bold">₹{alert.spent.toFixed(2)} / ₹{alert.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
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
          
          <div className="h-6 w-px bg-gray-200 dark:bg-gray-800 mx-1 hidden sm:block" />

          <button 
            type="button"
            onClick={() => setIsPrintModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all shadow-md shadow-emerald-100 dark:shadow-none"
            title="Generate A4 Printable Monthly Statement"
          >
            <Printer className="w-4 h-4" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Wallet Balance (All-Time) */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 transition-colors duration-200">
          <div className="flex items-center gap-3 mb-2 text-gray-500 dark:text-gray-400">
            <DollarSign className="w-5 h-5 text-emerald-600 dark:text-emerald-500" />
            <span className="font-medium text-sm">Wallet Balance</span>
          </div>
          <p className={cn("text-3xl font-bold transition-all", netBalance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
            ₹{netBalance.toFixed(2)}
          </p>
          <div className="flex items-center gap-1 mt-1 text-xs">
            <span className={cn("font-semibold", netBalance >= 0 ? "text-emerald-600 dark:text-emerald-500" : "text-red-600 dark:text-red-500")}>
              {netBalance >= 0 ? "Surplus Position" : "Deficit Position"}
            </span>
            <span className="text-gray-400">• All-time</span>
          </div>
        </div>

        {/* Monthly Income */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 transition-colors duration-200">
          <div className="flex items-center gap-3 mb-2 text-gray-500 dark:text-gray-400">
            <TrendingUp className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
            <span className="font-medium text-sm">Monthly Income</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-50">₹{totalMonthIncomes.toFixed(2)}</p>
          <p className="text-xs text-gray-500 mt-1">{format(parse(selectedDashboardMonth, 'yyyy-MM', new Date()), 'MMMM yyyy')}</p>
        </div>

        {/* Monthly Spent with Integrated Budget Progress */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 transition-colors duration-200">
          <div className="flex items-center gap-3 mb-2 text-gray-500 dark:text-gray-400">
            <Activity className="w-5 h-5 text-red-500 dark:text-red-400" />
            <span className="font-medium text-sm">Monthly Spent</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-50">₹{totalMonthSpent.toFixed(2)}</p>
          
          {totalMonthBudgetLimit > 0 ? (
            <div className="mt-1">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Budget Limit: ₹{totalMonthBudgetLimit.toFixed(0)}</span>
                <span className={cn("font-medium", totalBudgetPercent > 90 ? "text-red-500" : "text-indigo-500")}>
                  {totalBudgetPercent.toFixed(0)}%
                </span>
              </div>
              <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1 mt-1 overflow-hidden">
                <div 
                  className={cn("h-full transition-all duration-1000", totalBudgetPercent > 90 ? "bg-red-500" : "bg-indigo-500")}
                  style={{ width: `${totalBudgetPercent}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400 mt-1">No budget limit set</p>
          )}
        </div>

        {/* Net Cashflow (Surplus/Deficit for selected month) */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 transition-colors duration-200">
          <div className="flex items-center gap-3 mb-2 text-gray-500 dark:text-gray-400">
            <Target className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
            <span className="font-medium text-sm">Monthly Net Trend</span>
          </div>
          <p className={cn("text-3xl font-bold", monthNetBalance >= 0 ? "text-emerald-600 dark:text-emerald-500" : "text-red-600 dark:text-red-500")}>
            {monthNetBalance >= 0 ? '+' : ''}₹{monthNetBalance.toFixed(2)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {monthNetBalance >= 0 ? "Net saving surplus" : "Net spending deficit"}
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
          <div key={selectedDashboardMonth} className="h-64">
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
                    isAnimationActive={true}
                    animationDuration={800}
                    animationEasing="ease-out"
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
          <div key={expenses.length} className="h-64">
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
                <Bar 
                  dataKey="amount" 
                  fill="#3B82F6" 
                  radius={[4, 4, 0, 0]} 
                  maxBarSize={40}
                  isAnimationActive={true}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
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
        <div key={selectedDashboardMonth} className="h-64 w-full">
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
                isAnimationActive={true}
                animationDuration={800}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Multi-Month Comparison Section */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 transition-colors duration-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-900/40 rounded-xl">
              <TrendingUp className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50 uppercase tracking-wider text-[10px] text-indigo-600 dark:text-indigo-400">Analysis Engine</h3>
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-50 leading-tight border-none">Multi-Month Comparison & Trends</h2>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Range Selector */}
            <div className="flex bg-gray-50 dark:bg-gray-800 p-1 rounded-xl border border-gray-100 dark:border-gray-700">
              {[3, 6, 12].map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setCompareRange(range)}
                  className={cn(
                    "px-3 py-1 text-xs font-bold rounded-lg transition-all",
                    compareRange === range
                      ? "bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
                      : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-200"
                  )}
                >
                  {range}M
                </button>
              ))}
            </div>

            {/* Chart Type Selector */}
            <div className="flex bg-gray-50 dark:bg-gray-800 p-1 rounded-xl border border-gray-100 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setCompareChartType('total')}
                className={cn(
                  "px-3 py-1 text-xs font-bold rounded-lg transition-all",
                  compareChartType === 'total'
                    ? "bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
                    : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-200"
                )}
              >
                Spent vs Budget
              </button>
              <button
                type="button"
                onClick={() => setCompareChartType('categories')}
                className={cn(
                  "px-3 py-1 text-xs font-bold rounded-lg transition-all",
                  compareChartType === 'categories'
                    ? "bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
                    : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-200"
                )}
              >
                Category Stack
              </button>
            </div>
          </div>
        </div>

        {/* Comparison Chart */}
        <div key={`${compareRange}-${compareChartType}`} className="h-72 w-full mb-6">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={multiMonthData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#374151' : '#E5E7EB'} />
              <XAxis 
                dataKey="label" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 11, fill: isDarkMode ? '#9CA3AF' : '#6B7280' }} 
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 11, fill: isDarkMode ? '#9CA3AF' : '#6B7280' }} 
                tickFormatter={(val) => `₹${val}`} 
              />
              <RechartsTooltip 
                formatter={(value: number) => `₹${value.toFixed(2)}`}
                contentStyle={tooltipStyle}
                itemStyle={{ color: isDarkMode ? '#F9FAFB' : '#111827' }}
              />
              <Legend 
                verticalAlign="top" 
                height={36} 
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 11, color: isDarkMode ? '#F9FAFB' : '#111827' }} 
              />
              {compareChartType === 'total' ? (
                <>
                  <Bar 
                    dataKey="spent" 
                    name="Spent" 
                    fill="#4f46e5" 
                    radius={[4, 4, 0, 0]} 
                    maxBarSize={30}
                    isAnimationActive={true}
                    animationDuration={800}
                    animationEasing="ease-out"
                  />
                  <Bar 
                    dataKey="budget" 
                    name="Budget Limit" 
                    fill="#10b981" 
                    radius={[4, 4, 0, 0]} 
                    maxBarSize={30}
                    isAnimationActive={true}
                    animationDuration={800}
                    animationEasing="ease-out"
                  />
                </>
              ) : (
                Object.keys(CATEGORY_COLORS).map((category) => (
                  <Bar 
                    key={category} 
                    dataKey={category} 
                    name={category} 
                    stackId="a" 
                    fill={CATEGORY_COLORS[category]} 
                    maxBarSize={40}
                    isAnimationActive={true}
                    animationDuration={800}
                    animationEasing="ease-out"
                  />
                ))
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Detailed Table Comparison */}
        <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-800">
          <table className="w-full text-left text-xs text-gray-500 dark:text-gray-400 border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 font-semibold border-b border-gray-100 dark:border-gray-800">
              <tr>
                <th className="px-4 py-3">Month</th>
                <th className="px-4 py-3">Total Spent</th>
                <th className="px-4 py-3">Total Budget</th>
                <th className="px-4 py-3">Utilization</th>
                <th className="px-4 py-3">MoM Change</th>
                <th className="px-4 py-3">Top Sector</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50">
              {tableDataWithMom.map((row) => {
                const utilPercent = row.budget > 0 ? (row.spent / row.budget) * 100 : 0;
                const isOverBudget = row.budget > 0 && row.spent > row.budget;
                
                return (
                  <tr key={row.monthKey} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20 text-gray-900 dark:text-gray-100 transition-colors">
                    <td className="px-4 py-3.5 font-bold text-gray-900 dark:text-gray-50">{row.label}</td>
                    <td className="px-4 py-3.5 font-mono font-semibold">₹{row.spent.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-3.5 font-mono text-gray-500 dark:text-gray-400">
                      {row.budget > 0 ? `₹${row.budget.toLocaleString('en-IN', { minimumFractionDigits: 0 })}` : 'Not Set'}
                    </td>
                    <td className="px-4 py-3.5">
                      {row.budget > 0 ? (
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 overflow-hidden">
                            <div 
                              className={cn("h-full", isOverBudget ? "bg-red-500" : "bg-indigo-500")} 
                              style={{ width: `${Math.min(100, utilPercent)}%` }} 
                            />
                          </div>
                          <span className={cn("font-semibold text-[10px]", isOverBudget ? "text-red-500" : "text-gray-600 dark:text-gray-300")}>
                            {utilPercent.toFixed(0)}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-600">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 font-semibold">
                      {row.momChange !== null ? (
                        row.momChange > 0 ? (
                          <span className="text-red-500 dark:text-red-400 flex items-center gap-0.5 font-bold">
                            <ChevronUp className="w-3.5 h-3.5" />
                            {row.momChange.toFixed(1)}%
                          </span>
                        ) : row.momChange < 0 ? (
                          <span className="text-emerald-500 dark:text-emerald-400 flex items-center gap-0.5 font-bold">
                            <ChevronDown className="w-3.5 h-3.5" />
                            {Math.abs(row.momChange).toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-gray-500">0.0%</span>
                        )
                      ) : (
                        <span className="text-gray-400 dark:text-gray-600 font-medium">Initial Mo.</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-gray-500 dark:text-gray-400 truncate max-w-[140px]" title={row.topCategory}>
                      {row.topCategory}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
                        onClick={() => setBudgetToDelete(budget.id)}
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

        {budgetToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100 dark:border-gray-700">
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-2">Delete Budget Goal</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Are you sure you want to delete this budget goal? You will no longer see progress for this category on the dashboard.
                </p>
              </div>
              <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 flex justify-end gap-3 rounded-b-2xl border-t border-gray-100 dark:border-gray-700/50">
                <button
                  onClick={() => setBudgetToDelete(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteBudget}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-sm"
                >
                  Delete Budget
                </button>
              </div>
            </div>
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

      {/* Printable Statement elements via React Portal */}
      {isPrintModalOpen && createPortal(
        <div className="fixed inset-0 z-[999] flex flex-col md:flex-row bg-slate-900/95 backdrop-blur-md overflow-hidden text-slate-100 select-none no-print">
          {/* Sidebar controls */}
          <div className="w-full md:w-80 bg-slate-950 p-6 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-800 overflow-y-auto shrink-0 select-none">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-950 text-emerald-400 rounded-xl">
                  <Printer className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="font-bold text-base leading-tight">Print Config</h3>
                  <p className="text-xs text-slate-400">Statement Layout Settings</p>
                </div>
              </div>

              {/* Title setting */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Statement Title</label>
                <input
                  type="text"
                  value={statementTitle}
                  onChange={(e) => setStatementTitle(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm bg-slate-900 border border-slate-800 rounded-xl focus:ring-1 focus:ring-emerald-500 hover:border-slate-700 outline-none transition-all text-white font-medium"
                  placeholder="e.g. Monthly Statement"
                />
              </div>

              {/* Toggles */}
              <div className="space-y-3">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Layout Options</label>
                
                <label className="flex items-center gap-3 p-3 bg-slate-900/60 hover:bg-slate-900 rounded-xl cursor-pointer transition-all border border-slate-800/50 hover:border-slate-800">
                  <input
                    type="checkbox"
                    checked={includeTransactions}
                    onChange={(e) => setIncludeTransactions(e.target.checked)}
                    className="rounded border-slate-800 text-emerald-600 focus:ring-emerald-500 bg-slate-950 w-4 h-4"
                  />
                  <div>
                    <p className="text-xs font-bold">Transaction Ledger</p>
                    <p className="text-[10px] text-slate-400">List all expense items</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 bg-slate-900/60 hover:bg-slate-900 rounded-xl cursor-pointer transition-all border border-slate-800/50 hover:border-slate-800">
                  <input
                    type="checkbox"
                    checked={includeSignature}
                    onChange={(e) => setIncludeSignature(e.target.checked)}
                    className="rounded border-slate-800 text-emerald-600 focus:ring-emerald-500 bg-slate-950 w-4 h-4"
                  />
                  <div>
                    <p className="text-xs font-bold">Signature Area</p>
                    <p className="text-[10px] text-slate-400">Include auth approval block</p>
                  </div>
                </label>
              </div>

              {/* Custom Memo/Remarks */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Statement Memo / Remarks</label>
                <textarea
                  value={customMemo}
                  onChange={(e) => setCustomMemo(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2.5 text-sm bg-slate-900 border border-slate-800 rounded-xl focus:ring-1 focus:ring-emerald-500 hover:border-slate-700 outline-none transition-all text-white leading-relaxed resize-none font-sans"
                  placeholder="Type any remarks or comments to include at the bottom..."
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="mt-8 space-y-3">
              <button
                type="button"
                onClick={() => window.print()}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-950"
              >
                <Printer className="w-4 h-4" />
                Print Statement (A4)
              </button>
              
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(false)}
                className="w-full py-3 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded-xl font-semibold transition-colors border border-slate-700/50"
              >
                Close Preview
              </button>
            </div>
          </div>

          {/* Interactive Document Preview Area */}
          <div className="flex-1 overflow-y-auto p-4 md:p-12 flex justify-center bg-slate-900 scrollbar-thin select-text">
            {/* Virtual white paper preview box resembling the final printed statement perfectly */}
            <div className="w-[210mm] min-h-[297mm] p-16 bg-white text-slate-900 shadow-2xl relative border border-slate-200 pointer-events-auto flex flex-col justify-between rounded-sm">
              <div>
                {/* Statement header */}
                <div className="flex justify-between items-start border-b-2 border-slate-200 pb-8 mb-8">
                  <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 uppercase font-serif">
                      {statementTitle}
                    </h1>
                    <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest font-sans font-bold">
                      Expense Analyzer Secure Financial Document
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-emerald-600 font-sans">
                      {format(parse(selectedDashboardMonth, 'yyyy-MM', new Date()), 'MMMM yyyy')}
                    </p>
                    <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mt-1 font-sans">
                      STATUS: {totalMonthSpent <= totalMonthBudgetLimit || totalMonthBudgetLimit === 0 ? "WITHIN LIMIT" : "LIMIT EXCEEDED"}
                    </p>
                  </div>
                </div>

                {/* Meta details grid */}
                <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-xs mb-8 p-5 bg-slate-50 rounded-xl border border-slate-100 font-sans">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Statement Subject</p>
                    <p className="font-bold text-slate-800 mt-0.5 text-sm">{user?.displayName || "Account Holder"}</p>
                    <p className="text-slate-500">{user?.email || "n/a"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Document Issued On</p>
                    <p className="font-bold text-slate-800 mt-0.5 text-sm">{format(new Date(), 'MMMM dd, yyyy')}</p>
                    <p className="text-slate-500">{format(new Date(), 'hh:mm a (O)')}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Period Interval</p>
                    <p className="font-bold text-slate-800 mt-0.5 text-sm">
                      {format(startOfMonth(parse(selectedDashboardMonth, 'yyyy-MM', new Date())), 'MMM dd, yyyy')} - {format(endOfMonth(parse(selectedDashboardMonth, 'yyyy-MM', new Date())), 'MMM dd, yyyy')}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Client Reference ID</p>
                    <p className="font-mono text-slate-600 mt-0.5 font-bold">REF-{userId.slice(0, 12).toUpperCase()}</p>
                  </div>
                </div>

                {/* Overview boxes */}
                <div className="grid grid-cols-3 gap-4 mb-8 text-left font-sans">
                  <div className="p-4 rounded-xl border border-slate-200">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Total Spent For Month</p>
                    <p className="text-xl font-bold text-slate-950 mt-1">₹{totalMonthSpent.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="p-4 rounded-xl border border-slate-200">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Total Monthly Budget</p>
                    <p className="text-xl font-bold text-slate-950 mt-1">
                      {totalMonthBudgetLimit > 0 ? `₹${totalMonthBudgetLimit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : "No Limit Set"}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl border border-slate-200">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Net Surplus Position</p>
                    {totalMonthBudgetLimit > 0 ? (
                      <p className={cn("text-xl font-bold mt-1", totalMonthBudgetLimit - totalMonthSpent >= 0 ? "text-emerald-600" : "text-rose-600")}>
                        {totalMonthBudgetLimit - totalMonthSpent >= 0 ? "+" : ""}
                        ₹{(totalMonthBudgetLimit - totalMonthSpent).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </p>
                    ) : (
                      <p className="text-xl font-bold text-slate-400 mt-1">Unlimited</p>
                    )}
                  </div>
                </div>

                {/* Categories Table */}
                <div className="mb-8 avoid-break">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 font-sans">Category Performance & Limits</h3>
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-300 text-slate-500 bg-slate-50 font-bold">
                        <th className="px-3 py-2 rounded-l-lg">Sector Category</th>
                        <th className="px-3 py-2 text-right">Allocated Budget</th>
                        <th className="px-3 py-2 text-right">Actual Spendings</th>
                        <th className="px-3 py-2 text-right">Utilization Rate (%)</th>
                        <th className="px-3 py-2 text-right rounded-r-lg">Limit Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {Object.keys(CATEGORY_COLORS).map(cat => {
                        const spent = monthCategoryData[cat] || 0;
                        const specBudget = monthBudgets.find(b => b.category === cat);
                        const budgetLim = specBudget ? specBudget.amount : 0;
                        
                        // If no spending and no budget, skip rendering in formal clean table
                        if (spent === 0 && budgetLim === 0) return null;
                        
                        const percentRatio = budgetLim > 0 ? (spent / budgetLim) * 100 : 0;
                        const isOver = budgetLim > 0 && spent > budgetLim;

                        return (
                          <tr key={cat} className="hover:bg-slate-50 text-slate-800">
                            <td className="px-3 py-3 font-semibold flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: CATEGORY_COLORS[cat] }} />
                              {cat}
                            </td>
                            <td className="px-3 py-3 text-right font-mono text-slate-500">
                              {budgetLim > 0 ? `₹${budgetLim.toLocaleString('en-IN', { minimumFractionDigits: 0 })}` : "Flexible"}
                            </td>
                            <td className="px-3 py-3 text-right font-mono font-medium">
                              ₹{spent.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-3 py-3 text-right font-mono text-slate-600">
                              {budgetLim > 0 ? `${percentRatio.toFixed(0)}%` : "-"}
                            </td>
                            <td className={cn("px-3 py-3 text-right font-semibold", isOver ? "text-rose-600" : spent > 0 ? "text-emerald-600" : "text-slate-400")}>
                              {budgetLim > 0 ? (isOver ? `Over by ₹${(spent - budgetLim).toFixed(0)}` : "Within Limit") : "Flexible Allowed"}
                            </td>
                          </tr>
                        );
                      })}
                      {Object.keys(monthCategoryData).length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-slate-400 italic">
                            No recorded transaction records found in categorization fields for this month.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Transaction Ledger list */}
                {includeTransactions && (
                  <div className="mb-8">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 font-sans">Statement Ledger Account History</h3>
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-300 text-slate-500 bg-slate-50 font-bold">
                          <th className="px-3 py-2 rounded-l-lg">Date</th>
                          <th className="px-3 py-2">Transaction Details / Vendor</th>
                          <th className="px-3 py-2 text-right">Category</th>
                          <th className="px-3 py-2 text-right rounded-r-lg">Value (INR)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {monthExpenses.map((exp) => (
                          <tr key={exp.id} className="hover:bg-slate-50 border-b border-slate-100">
                            <td className="px-3 py-2.5 font-mono text-slate-500">
                              {format(parse(exp.date, 'yyyy-MM-dd', new Date()), 'dd MMM yyyy')}
                            </td>
                            <td className="px-3 py-2.5 font-medium text-slate-900">
                              {exp.description}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-tight uppercase" style={{ backgroundColor: `${CATEGORY_COLORS[exp.category] || CATEGORY_COLORS.Other}15`, color: CATEGORY_COLORS[exp.category] || CATEGORY_COLORS.Other }}>
                                {exp.category}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900">
                              ₹{exp.amount.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                        {monthExpenses.length === 0 && (
                          <tr>
                            <td colSpan={4} className="py-8 text-center text-slate-400 italic">
                              No matching transaction records found in the intervals of the selected month statement.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Custom Memo/Remarks panel */}
                {customMemo.trim() !== '' && (
                  <div className="mb-8 p-5 bg-slate-50 rounded-xl border border-slate-200 avoid-break font-sans">
                    <h4 className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1.5 font-sans">Report Analyst Remarks / Memo</h4>
                    <p className="text-xs text-slate-700 leading-relaxed italic whitespace-pre-wrap">
                      "{customMemo}"
                    </p>
                  </div>
                )}
              </div>

              {/* Signature Section / Bottom footer */}
              <div className="mt-8 border-t border-slate-200 pt-8 avoid-break font-sans">
                {includeSignature && (
                  <div className="grid grid-cols-2 gap-12 text-xs mb-8">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">PREPARED & CERTIFIED BY</p>
                      <div className="h-10 border-b border-slate-300 mt-2 flex items-end pb-1 font-serif text-slate-600 italic font-bold">
                        {user?.displayName || "Account HolderSignature"}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 font-sans">E-Authenticated Representative Signature</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">AUDITOR APPROVAL BLOCK</p>
                      <div className="h-10 border-b border-slate-300 mt-2"></div>
                      <p className="text-[10px] text-slate-400 mt-1 font-sans">Date: ________________________</p>
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center text-[10px] text-slate-400">
                  <p>System Generated Secure Document – End of Report – Record ID: {user?.uid.slice(0, 12).toUpperCase()}</p>
                  <p className="font-mono">Page 1 of 1</p>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Persistence printable statement TARGET for browsers to print */}
      {isPrintModalOpen && createPortal(
        <div id="printable-statement-target" className="hidden print:block font-sans text-black bg-white select-text">
          <div className="print-page p-12 bg-white text-black flex flex-col justify-between" style={{ minHeight: '297mm' }}>
            <div>
              {/* Statement header */}
              <div className="flex justify-between items-start border-b-2 border-slate-300 pb-6 mb-6">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-black font-serif">
                    {statementTitle}
                  </h1>
                  <p className="text-xs text-slate-600 mt-1 uppercase tracking-widest font-semibold font-sans">
                    Secure Monthly Financial Statement
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-slate-900">
                    {format(parse(selectedDashboardMonth, 'yyyy-MM', new Date()), 'MMMM yyyy')}
                  </p>
                  <p className="text-[10px] uppercase font-bold tracking-wider text-slate-600 mt-1">STATUS: {totalMonthSpent <= totalMonthBudgetLimit || totalMonthBudgetLimit === 0 ? "WITHIN BUDGET LIMIT" : "BUDGET OVERDRAWN"}</p>
                </div>
              </div>

              {/* Meta details grid */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-xs mb-6 p-4 bg-slate-50 border border-slate-200">
                <div>
                  <p className="text-[9px] uppercase tracking-wider font-bold text-slate-500">Statement Owner</p>
                  <p className="font-bold text-slate-900 mt-0.5">{user?.displayName}</p>
                  <p className="text-slate-600">{user?.email}</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-wider font-bold text-slate-500">Document Issued On</p>
                  <p className="font-bold text-slate-900 mt-0.5">{format(new Date(), 'MMMM dd, yyyy')}</p>
                  <p className="text-slate-600">{format(new Date(), 'hh:mm a (O)')}</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-wider font-bold text-slate-500">Statement Period</p>
                  <p className="font-bold text-slate-900 mt-0.5">
                    {format(startOfMonth(parse(selectedDashboardMonth, 'yyyy-MM', new Date())), 'MMM dd, yyyy')} - {format(endOfMonth(parse(selectedDashboardMonth, 'yyyy-MM', new Date())), 'MMM dd, yyyy')}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-wider font-bold text-slate-500">Accounts Reference</p>
                  <p className="font-mono text-slate-700 mt-0.5">ID-{userId.toUpperCase()}</p>
                </div>
              </div>

              {/* Overview boxes */}
              <div className="grid grid-cols-3 gap-4 mb-6 text-center sm:text-left">
                <div className="p-4 border border-slate-300">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Total Monthly Income</p>
                  <p className="text-lg font-bold text-emerald-700 mt-1">₹{totalMonthIncomes.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="p-4 border border-slate-300">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Total Monthly Spent</p>
                  <p className="text-lg font-bold text-slate-950 mt-1">₹{totalMonthSpent.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="p-4 border border-slate-300">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Net Cashflow Trend</p>
                  <p className={cn("text-lg font-bold mt-1", monthNetBalance >= 0 ? "text-emerald-700 font-bold" : "text-red-700 font-bold")}>
                    {monthNetBalance >= 0 ? "+" : ""}
                    ₹{monthNetBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              {/* Categories Table */}
              <div className="mb-6 avoid-break">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2 font-serif">Category Performance Ledger</h3>
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-400 text-slate-700 bg-slate-100 font-bold">
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2 text-right">Allocated Budget</th>
                      <th className="px-3 py-2 text-right">Actual Spendings</th>
                      <th className="px-3 py-2 text-right">Utilization (%)</th>
                      <th className="px-3 py-2 text-right">Alert Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {Object.keys(CATEGORY_COLORS).map(cat => {
                      const spent = monthCategoryData[cat] || 0;
                      const specBudget = monthBudgets.find(b => b.category === cat);
                      const budgetLim = specBudget ? specBudget.amount : 0;
                      
                      if (spent === 0 && budgetLim === 0) return null;
                      
                      const percentRatio = budgetLim > 0 ? (spent / budgetLim) * 100 : 0;
                      const isOver = budgetLim > 0 && spent > budgetLim;

                      return (
                        <tr key={cat} className="text-slate-900">
                          <td className="px-3 py-1.5 font-bold">
                            {cat}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-slate-600">
                            {budgetLim > 0 ? `₹${budgetLim.toLocaleString('en-IN', { minimumFractionDigits: 0 })}` : "Flexible"}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono font-bold">
                            ₹{spent.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-slate-600">
                            {budgetLim > 0 ? `${percentRatio.toFixed(0)}%` : "-"}
                          </td>
                          <td className={cn("px-3 py-1.5 text-right font-semibold", isOver ? "text-red-700" : "text-slate-850")}>
                            {budgetLim > 0 ? (isOver ? `Over budget by ₹${(spent - budgetLim).toFixed(0)}` : "Authorized") : "Authorized"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Print customized Transaction list */}
              {includeTransactions && (
                <div className="mb-6">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2 font-serif font-bold">Comprehensive Ledger Details</h3>
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead>
                      <tr className="border-b border-slate-400 text-slate-700 bg-slate-100 font-bold">
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Vendor & Description</th>
                        <th className="px-3 py-2 text-right">Category</th>
                        <th className="px-3 py-2 text-right">Sum Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-slate-800">
                      {monthExpenses.map((exp) => (
                        <tr key={exp.id} className="border-b border-slate-100" style={{ pageBreakInside: 'avoid' }}>
                          <td className="px-3 py-1 border-slate-100 font-mono text-slate-600 text-[10px]">
                            {format(parse(exp.date, 'yyyy-MM-dd', new Date()), 'dd MMM yyyy')}
                          </td>
                          <td className="px-3 py-1 border-slate-100 font-sans text-slate-900 leading-snug">
                            {exp.description}
                          </td>
                          <td className="px-3 py-1 border-slate-100 text-right uppercase tracking-tight text-[9px] text-slate-600 font-bold">
                            {exp.category}
                          </td>
                          <td className="px-3 py-1 border-slate-100 text-right font-mono font-bold text-black font-semibold">
                            ₹{exp.amount.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Memo printed remarks */}
              {customMemo.trim() !== '' && (
                <div className="mb-6 p-4 bg-slate-50 border border-slate-300 avoid-break leading-relaxed font-serif text-xs italic">
                  <strong>Notes:</strong> {customMemo}
                </div>
              )}
            </div>

            {/* Print Signature lines & Statement Footnote */}
            <div className="avoid-break pt-6 border-t border-slate-300 mt-6">
              {includeSignature && (
                <div className="grid grid-cols-2 gap-12 text-xs mb-6">
                  <div>
                    <p className="text-[9px] uppercase tracking-wider font-bold text-slate-600 font-bold">PREPARED BY NAME</p>
                    <div className="h-8 border-b border-slate-400 mt-2 flex items-end pb-1 font-serif italic text-black font-bold">
                      {user?.displayName}
                    </div>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider font-bold text-slate-600 font-bold font-bold">APPROVED WITH SIGNATURE</p>
                    <div className="h-8 border-b border-slate-400 mt-2"></div>
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center text-[9px] text-slate-600 font-sans font-bold">
                <p>Expense Analyzer Official Record. ID: {user?.uid.toUpperCase()}</p>
                <p>Printed: {format(new Date(), 'yyyy-MM-dd HH:mm_UTC')}</p>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function AIInsights({ expenses }: { expenses: Expense[] }) {
  const [insights, setInsights] = useState<{ 
    insights: string, 
    recommendations: string[],
    topMerchants: { category: string, merchant: string, amount: number }[],
    trends: string,
    yoyStatus?: string
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const generateInsights = async () => {
    if (expenses.length === 0) return;
    
    setLoading(true);
    try {
      // 1. Group by Month for Trend Analysis
      const monthlyData = expenses.reduce((acc, exp) => {
        const month = exp.date.substring(0, 7); // yyyy-MM
        acc[month] = (acc[month] || 0) + exp.amount;
        return acc;
      }, {} as Record<string, number>);

      // 2. Group by Category and Merchant (Description)
      const categoryMerchantData = expenses.reduce((acc, exp) => {
        if (!acc[exp.category]) acc[exp.category] = {};
        acc[exp.category][exp.description] = (acc[exp.category][exp.description] || 0) + exp.amount;
        return acc;
      }, {} as Record<string, Record<string, number>>);

      // 3. Find Top Merchants globally or per category
      const merchantsList: { category: string, merchant: string, amount: number }[] = [];
      Object.entries(categoryMerchantData).forEach(([category, merchants]) => {
        Object.entries(merchants).forEach(([merchant, amount]) => {
          merchantsList.push({ category, merchant, amount });
        });
      });
      const topMerchants = merchantsList.sort((a, b) => b.amount - a.amount).slice(0, 10);

      // 4. YoY Comparison if possible
      const currentMonth = format(new Date(), 'yyyy-MM');
      const lastYearMonth = format(subMonths(new Date(), 12), 'yyyy-MM');
      const currentMonthTotal = monthlyData[currentMonth] || 0;
      const lastYearMonthTotal = monthlyData[lastYearMonth] || 0;

      let yoyContext = "";
      if (lastYearMonthTotal > 0) {
        const diff = ((currentMonthTotal - lastYearMonthTotal) / lastYearMonthTotal) * 100;
        yoyContext = `Year-over-Year Comparison: This month (₹${currentMonthTotal.toFixed(0)}) vs same month last year (₹${lastYearMonthTotal.toFixed(0)}). Change: ${diff.toFixed(1)}%.`;
      }

      // Prepare summary for AI
      const topMerchantsSummary = topMerchants.map(m => `- ${m.merchant} in ${m.category}: ₹${m.amount.toFixed(0)}`).join('\n');
      const trendSummary = Object.entries(monthlyData).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6).map(([m, a]) => `${m}: ₹${a.toFixed(0)}`).join(', ');

      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: `Analyze these financial metrics and provide deep insights:
        
Top Merchants & Categories:
${topMerchantsSummary}

Recent Monthly Totals:
${trendSummary}

${yoyContext}

Please provide:
1. A detailed analysis of spending patterns, specifically highlighting any problematic merchants or sub-categories.
2. Trend analysis (how spending is changing month-to-month).
3. If YoY data is available, comment on long-term progress.
4. 4-6 specific, actionable saving recommendations.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              insights: {
                type: Type.STRING,
                description: "Deep summary of spending habits."
              },
              trends: {
                type: Type.STRING,
                description: "Analysis of month-to-month and yearly trends."
              },
              recommendations: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Actionable tips."
              },
              yoyStatus: {
                type: Type.STRING,
                description: "Short status of YoY progress if applicable."
              }
            },
            required: ["insights", "trends", "recommendations"]
          }
        }
      });
      
      const data = JSON.parse(response.text || '{"insights": "Unable to analyze.", "trends": "", "recommendations": []}');
      setInsights({
        ...data,
        topMerchants
      });
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
          AI Financial Intelligence
        </h2>
        <button
          onClick={generateInsights}
          disabled={loading || expenses.length === 0}
          className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-indigo-200 dark:shadow-none disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Deep Analysis...</> : 'Generate Intelligence'}
        </button>
      </div>

      {!insights && !loading && (
        <div className="text-center py-12 px-4 bg-white/40 dark:bg-gray-900/40 rounded-2xl border border-dashed border-indigo-200 dark:border-indigo-800">
          <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h3 className="text-indigo-900 dark:text-indigo-100 font-semibold mb-2">Ready for Analysis</h3>
          <p className="text-indigo-800/70 dark:text-indigo-200/70 text-sm max-w-sm mx-auto">Get granular merchant-level suggestions and long-term trend analysis powered by AI.</p>
        </div>
      )}

      {insights && (
        <div className="space-y-6 animate-in modal-enter">
          {/* Main Insights & Trends */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-indigo-100 dark:border-indigo-800/50 shadow-sm transition-all hover:shadow-md">
              <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-100 mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-500" />
                Behavioral Analysis
              </h3>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-sm">
                {insights.insights}
              </p>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-blue-100 dark:border-blue-800/50 shadow-sm transition-all hover:shadow-md">
              <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-500" />
                Trend Intelligence
              </h3>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-sm mb-3">
                {insights.trends}
              </p>
              {insights.yoyStatus && (
                <div className="mt-4 pt-4 border-t border-blue-50 dark:border-blue-900/30 flex items-center gap-3">
                  <div className="p-2 bg-blue-50 dark:bg-blue-900/40 rounded-lg">
                    <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <p className="text-xs font-medium text-blue-800 dark:text-blue-200">
                    {insights.yoyStatus}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Merchant Breakdown */}
          {insights.topMerchants && insights.topMerchants.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50 mb-4 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-gray-500" />
                Top Expenditure Breakdown
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {insights.topMerchants.slice(0, 6).map((m, i) => (
                  <div key={i} className="flex justify-between items-center p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 text-xs transition-transform hover:scale-[1.02]">
                    <div className="overflow-hidden">
                      <p className="font-bold text-gray-900 dark:text-gray-100 truncate">{m.merchant}</p>
                      <p className="text-[10px] text-gray-500 uppercase tracking-tighter">{m.category}</p>
                    </div>
                    <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">₹{m.amount.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Recommendations */}
          {insights.recommendations && insights.recommendations.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-100 mb-4 px-1 flex items-center gap-2">
                <Target className="w-4 h-4 text-indigo-500" />
                Strategic Recommendations
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {insights.recommendations.map((rec, i) => (
                  <div key={i} className="bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm rounded-2xl p-5 border border-indigo-50 dark:border-indigo-800/30 hover:border-indigo-200 dark:hover:border-indigo-700/80 hover:shadow-md transition-all group relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500/50 group-hover:bg-indigo-500 transition-colors" />
                    <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed font-medium">
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
