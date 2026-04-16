/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie,
  Legend
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ParsedRecord } from '@/src/lib/parser';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, DollarSign, Globe, PieChart as PieChartIcon } from 'lucide-react';

interface AnalyticsDashboardProps {
  data: ParsedRecord[];
  accentColor: string;
}

export function AnalyticsDashboard({ data, accentColor }: AnalyticsDashboardProps) {
  // 1. Currency Distribution
  const currencyData = useMemo(() => {
    const counts: Record<string, number> = {};
    data.forEach(r => {
      const curr = String(r['Recon Currency Code (Label)'] || r['Reconciliation Currency Code (Label)'] || r['Transaction Currency Code (Label)'] || 'Unknown');
      counts[curr] = (counts[curr] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [data]);

  // 2. Transaction Amount vs Recon Amount (sample)
  // We'll look for amount fields
  const amountData = useMemo(() => {
    const result: { name: string; amount: number }[] = [];
    const files: Record<string, number> = {};
    
    data.forEach(r => {
      const file = String(r['Source File']);
      const amt = Number(r['Recon Amount'] || r['Reconciliation Amount'] || r['Transaction Amount'] || 0);
      files[file] = (files[file] || 0) + amt;
    });

    return Object.entries(files).map(([name, amount]) => ({ 
      name: name.length > 20 ? name.substring(0, 17) + '...' : name, 
      amount 
    }));
  }, [data]);

  // 3. IRD Distribution (Mastercard specific usually)
  const irdData = useMemo(() => {
    const counts: Record<string, number> = {};
    data.forEach(r => {
      const ird = String(r['IRD (Label)'] || 'Other');
      if (ird !== 'undefined' && ird !== 'null') {
        counts[ird] = (counts[ird] || 0) + 1;
      }
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [data]);

  const COLORS = [accentColor, '#FACC15', '#22C55E', '#3B82F6', '#A855F7', '#EC4899'];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="p-4 pb-0">
            <CardDescription className="text-[10px] uppercase font-bold tracking-wider">Total Records</CardDescription>
            <CardTitle className="text-2xl font-bold">{data.length}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <div className="flex items-center gap-1 text-green-600 text-xs font-medium">
              <TrendingUp className="w-3 h-3" />
              <span>Live Analysis</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-4 pb-0">
            <CardDescription className="text-[10px] uppercase font-bold tracking-wider">Source Files</CardDescription>
            <CardTitle className="text-2xl font-bold">{new Set(data.map(r => r['Source File'])).size}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2 text-xs text-gray-500">
            Across all uploaded batches
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-4 pb-0">
            <CardDescription className="text-[10px] uppercase font-bold tracking-wider">Primary Currency</CardDescription>
            <CardTitle className="text-2xl font-bold">{currencyData[0]?.name || 'N/A'}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2">
             <Badge variant="secondary" className="text-[9px]">{currencyData[0]?.value || 0} Records</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-4 pb-0">
            <CardDescription className="text-[10px] uppercase font-bold tracking-wider">Unique IRDs</CardDescription>
            <CardTitle className="text-2xl font-bold">{irdData.length}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2 text-xs text-gray-500">
            Interchange Classifications
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="shadow-sm border-gray-100">
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Globe className="w-4 h-4 text-gray-400" />
              Currency Volume Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={currencyData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {currencyData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-gray-100">
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-gray-400" />
              Financial Volume per File
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={amountData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#64748B' }}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#64748B' }}
                />
                <Tooltip 
                  cursor={{ fill: '#F8FAFC' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="amount" fill={accentColor} radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {irdData.length > 0 && (
          <Card className="shadow-sm border-gray-100 col-span-full">
            <CardHeader>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 text-gray-400" />
                Interchange Rate Designator (IRD) Top Categories
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={irdData} layout="vertical" margin={{ left: 40, right: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                  <XAxis type="number" hide />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#64748B' }}
                    width={150}
                  />
                  <Tooltip 
                    cursor={{ fill: '#F8FAFC' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="value" fill="#FACC15" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
