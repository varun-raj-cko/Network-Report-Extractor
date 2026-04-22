import React, { useState } from 'react';
import { 
  LayoutDashboard,
  Settings,
  CheckCircle2,
  CreditCard,
  ArrowRight,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

import { REPORT_SCHEMAS } from '@/src/constants/schemas';
import { VISA_REPORT_SCHEMAS } from '@/src/constants/visa_schemas';
import { ReportExtractor } from '@/src/components/ReportExtractor';
import { AutomationManager } from '@/src/components/AutomationManager';

type ViewState = 'landing' | 'mastercard' | 'visa' | 'automation';

export default function App() {
  const [view, setView] = useState<ViewState>('landing');

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col font-sans text-[#1A1A1A]">
      {/* Header */}
      <header className="h-16 border-b border-[#E5E7EB] bg-white flex items-center px-8 justify-between sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('landing')}>
          <div className="w-10 h-10 bg-[#1A1A1A] rounded-lg flex items-center justify-center shadow-md">
            <LayoutDashboard className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-xl tracking-tight">Network Report Extractor</h1>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Enterprise Data Tool</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setView('automation')}
            className={`gap-2 ${view === 'automation' ? 'bg-gray-100 text-blue-600' : 'text-gray-500'}`}
          >
            <Zap className="w-4 h-4" />
            Automation
          </Button>
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 px-3 py-1">
            v1.8.2 - Precision Extraction
          </Badge>
          <Button variant="ghost" size="icon" className="rounded-full">
            <Settings className="w-5 h-5 text-gray-500" />
          </Button>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {view === 'landing' ? (
          <motion.main 
            key="landing"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            className="flex-1 flex items-center justify-center p-8"
          >
            <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="md:col-span-2 text-center mb-4">
                <div className="flex justify-center mb-4">
                  <Badge variant="outline" className="bg-white/50 backdrop-blur-sm border-gray-200 text-[10px] font-bold py-0 h-5 px-2">
                    BETA v1.5.0
                  </Badge>
                </div>
                <h2 className="text-4xl font-black tracking-tight text-gray-900 mb-2">Select Network</h2>
                <p className="text-gray-500 text-lg">Choose the payment network to begin report extraction and analysis.</p>
              </div>

              {/* Mastercard Card */}
              <motion.div 
                whileHover={{ y: -8 }}
                className="group relative bg-white rounded-3xl p-8 shadow-xl border border-gray-100 cursor-pointer overflow-hidden"
                onClick={() => setView('mastercard')}
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#FF5F00]/5 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-150 duration-500" />
                <div className="relative z-10">
                  <div className="w-16 h-16 bg-[#FF5F00] rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-orange-200">
                    <CreditCard className="text-white w-8 h-8" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">Mastercard</h3>
                  <p className="text-gray-500 text-sm mb-6 leading-relaxed">
                    Extract data from raw TN070 files including Clearing Cycle, IPM Messages, and Detail Reports.
                  </p>
                  <div className="flex items-center text-[#FF5F00] font-bold text-sm group-hover:gap-2 transition-all">
                    Enter Mastercard Portal <ArrowRight className="w-4 h-4 ml-1" />
                  </div>
                </div>
              </motion.div>

              {/* Visa Card */}
              <motion.div 
                whileHover={{ y: -8 }}
                className="group relative bg-white rounded-3xl p-8 shadow-xl border border-gray-100 cursor-pointer overflow-hidden"
                onClick={() => setView('visa')}
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#1A1F71]/5 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-150 duration-500" />
                <div className="relative z-10">
                  <div className="w-16 h-16 bg-[#1A1F71] rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-blue-200">
                    <CreditCard className="text-white w-8 h-8" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">Visa Incoming Clearing File</h3>
                  <p className="text-gray-500 text-sm mb-6 leading-relaxed">
                    Process Visa Incoming Clearing Files. Extract TC05, TC06, TC07, TC10, TC15, TC20, and TC33 records with full schema validation.
                  </p>
                  <div className="flex items-center text-[#1A1F71] font-bold text-sm group-hover:gap-2 transition-all">
                    Enter Visa Portal <ArrowRight className="w-4 h-4 ml-1" />
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.main>
        ) : view === 'mastercard' ? (
          <motion.div 
            key="mastercard"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 flex overflow-hidden"
          >
            <ReportExtractor 
              networkName="Mastercard" 
              schemas={REPORT_SCHEMAS} 
              accentColor="#FF5F00" 
              onBack={() => setView('landing')} 
            />
          </motion.div>
        ) : view === 'visa' ? (
          <motion.div 
            key="visa"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 flex overflow-hidden"
          >
            <ReportExtractor 
              networkName="Visa Incoming Clearing File" 
              schemas={VISA_REPORT_SCHEMAS} 
              accentColor="#1A1F71" 
              onBack={() => setView('landing')} 
            />
          </motion.div>
        ) : (
          <motion.div
            key="automation"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="flex-1 overflow-auto"
          >
            <AutomationManager />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="h-10 border-t border-[#E5E7EB] bg-white flex items-center px-8 justify-between text-[10px] text-gray-400 font-medium">
        <div className="flex items-center gap-4">
          <span>&copy; 2024 Financial Data Services</span>
          <Separator orientation="vertical" className="h-3" />
          <span className="flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-green-500" />
            System Secure
          </span>
        </div>
        <div className="flex items-center gap-4">
          <a href="#" className="hover:text-gray-600 transition-colors">Privacy Policy</a>
          <a href="#" className="hover:text-gray-600 transition-colors">Terms of Service</a>
          <a href="#" className="hover:text-gray-600 transition-colors">Support</a>
        </div>
      </footer>
    </div>
  );
}
