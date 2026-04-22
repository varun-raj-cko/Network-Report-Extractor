/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useCallback } from 'react';
import { 
  Upload, 
  FileText, 
  Download, 
  Filter, 
  Search, 
  ChevronRight, 
  Info,
  Table as TableIcon,
  X,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  LayoutDashboard,
  BrainCircuit,
  Loader2,
  ExternalLink,
  FileSearch,
  Zap,
  Mail
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

import { ReportSchema } from '@/src/constants/schemas';
import { parseTN070File, ParsedRecord, getTopValues, countMatchingRecords } from '@/src/lib/parser';
import { explainClearingRecord } from '@/src/services/geminiService';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import { cn } from '@/lib/utils';

interface ReportExtractorProps {
  schemas: ReportSchema[];
  networkName: string;
  accentColor: string;
  onBack: () => void;
}

interface UploadedFile {
  name: string;
  content: string;
  lines?: string[];
  totalLines: number;
}

export function ReportExtractor({ schemas, networkName, accentColor, onBack }: ReportExtractorProps) {
  const [selectedReportId, setSelectedReportId] = useState<string>(schemas[0].id);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [parsedData, setParsedData] = useState<ParsedRecord[]>([]);
  const [filters, setFilters] = useState<{ [key: string]: string }>({});
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState('table');
  const [discoveryResults, setDiscoveryResults] = useState<{ [schemaId: string]: number }>({});

  // AI Expert State
  const [isExplaining, setIsExplaining] = useState(false);
  const [selectedExplanation, setSelectedExplanation] = useState<string | null>(null);
  const [activeExplainRecord, setActiveExplainRecord] = useState<ParsedRecord | null>(null);

  const sortedSchemas = useMemo(() => {
    return [...schemas].sort((a, b) => a.name.localeCompare(b.name));
  }, [schemas]);

  const uniqueReports = useMemo(() => {
    const seen = new Set<string>();
    const unique: ReportSchema[] = [];
    
    sortedSchemas.forEach(s => {
      const key = s.group || s.id;
      if (!seen.has(key)) {
        seen.add(key);
        // If it's a group, we create a placeholder schema for display
        if (s.group) {
          unique.push({
            ...s,
            id: s.group,
            name: `${s.group} - Combined Records`,
            description: `Aggregated view for ${s.group} records.`
          });
        } else {
          unique.push(s);
        }
      }
    });
    return unique;
  }, [sortedSchemas]);

  const selectedReportGroup = useMemo(() => {
    const report = schemas.find(r => r.id === selectedReportId || (r.group && r.group === selectedReportId)) || schemas[0];
    return report.group || report.id;
  }, [selectedReportId, schemas]);

  const groupSchemas = useMemo(() => {
    return schemas.filter(s => (s.group || s.id) === selectedReportGroup);
  }, [selectedReportGroup, schemas]);

  const selectedReport = useMemo(() => 
    groupSchemas[0] || schemas[0],
    [groupSchemas, schemas]
  );

  const groupFields = useMemo(() => {
    const fieldMap = new Map<string, any>();
    // Always include Record Type Information as the first field for grouped reports
    if (groupSchemas.length > 1) {
      fieldMap.set('Record Type Info', { name: 'Record Type Info', type: 'Alphanumeric', length: 20 });
    }
    
    groupSchemas.forEach(schema => {
      schema.fields.forEach(field => {
        if (!fieldMap.has(field.name)) {
          fieldMap.set(field.name, field);
        }
      });
    });
    return Array.from(fieldMap.values());
  }, [groupSchemas]);

  const discoverySummary = useMemo(() => {
    const summary: { [key: string]: { name: string, count: number, id: string, schemaId: string } } = {};
    Object.entries(discoveryResults).forEach(([schemaId, count]) => {
      const c = count as number;
      const schema = schemas.find(s => s.id === schemaId);
      if (!schema) return;
      const key = schema.group || schema.id;
      if (!summary[key]) {
        summary[key] = { 
          name: schema.group ? `${schema.group} - Combined Records` : schema.name, 
          count: 0, 
          id: key,
          schemaId: schema.id
        };
      }
      summary[key].count += c;
    });
    return Object.values(summary).sort((a, b) => a.name.localeCompare(b.name));
  }, [discoveryResults, schemas]);

  const discoveryAll = useCallback((files: UploadedFile[]) => {
    const results: { [schemaId: string]: number } = {};
    let firstFoundId: string | null = null;

    const visaLookup: Record<string, string[]> = {};
    const mcSchemas = schemas.filter(s => s.id.startsWith('IP'));
    
    schemas.filter(s => !s.id.startsWith('IP')).forEach(s => {
      const key = `${s.recordTypeCode || ''}:${s.tcrCode || ''}:${s.tcrSubCode || ''}`;
      if (!visaLookup[key]) visaLookup[key] = [];
      visaLookup[key].push(s.id);
      results[s.id] = 0;
    });

    mcSchemas.forEach(s => results[s.id] = 0);

    files.forEach(file => {
      // 1. Mastercard Discovery
      mcSchemas.forEach(schema => {
        const mcCount = countMatchingRecords(file.content, schema, file.lines);
        if (mcCount > 0) {
          results[schema.id] = (results[schema.id] || 0) + mcCount;
        }
      });

      // 2. Visa Discovery (Hyper-optimized Scan)
      const content = file.content;
      const totalLen = content.length;
      
      const hasNewlines = content.includes('\n');
      
      if (hasNewlines) {
        // Optimized line scan without split()
        let pos = 0;
        while (pos < totalLen) {
          let lineEnd = content.indexOf('\n', pos);
          if (lineEnd === -1) lineEnd = totalLen;
          
          const lineLen = lineEnd - pos;
          if (lineLen >= 4) {
            const rt = content.substring(pos, pos + 2);
            const tc = content[pos + 3];
            const sub = lineLen >= 6 ? content.substring(pos + 4, pos + 6) : '';

            const k1 = `${rt}:${tc}:${sub}`;
            if (visaLookup[k1]) visaLookup[k1].forEach(sid => results[sid]++);
            
            const k2 = `${rt}:${tc}:`;
            if (visaLookup[k2]) visaLookup[k2].forEach(sid => results[sid]++);
            
            const k3 = `${rt}::`;
            if (visaLookup[k3]) visaLookup[k3].forEach(sid => results[sid]++);
          }
          pos = lineEnd + 1;
        }
      } else {
        // Fixed length 168
        for (let i = 0; i < totalLen; i += 168) {
          if (i + 4 > totalLen) break;
          const rt = content.substring(i, i + 2);
          const tc = content[i + 3];
          const sub = (i + 6 <= totalLen) ? content.substring(i + 4, i + 6) : '';
          
          const k1 = `${rt}:${tc}:${sub}`;
          if (visaLookup[k1]) visaLookup[k1].forEach(sid => results[sid]++);
          
          const k2 = `${rt}:${tc}:`;
          if (visaLookup[k2]) visaLookup[k2].forEach(sid => results[sid]++);
          
          const k3 = `${rt}::`;
          if (visaLookup[k3]) visaLookup[k3].forEach(sid => results[sid]++);
        }
      }
    });

    // Cleanup and Select
    Object.keys(results).forEach(sid => {
      if (results[sid] > 0) {
        if (!firstFoundId || (results[firstFoundId] === 0)) {
          firstFoundId = sid;
        }
      } else {
        delete results[sid];
      }
    });

    setDiscoveryResults(results);
    
    if (firstFoundId && (results[selectedReportId] === undefined || results[selectedReportId] === 0)) {
      setSelectedReportId(firstFoundId);
    }
  }, [schemas, selectedReportId]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportType, setExportType] = useState<'excel' | 'csv' | 'email'>('excel');
  const [selectedExportFields, setSelectedExportFields] = useState<string[]>([]);
  
  // Email state
  const [emailAddresses, setEmailAddresses] = useState<string>('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState(false);

  // Initialize export fields when report changes
  React.useEffect(() => {
    setSelectedExportFields(groupFields.map(f => f.name));
  }, [groupFields]);

  const processFiles = useCallback(async (files: FileList | File[]) => {
    setIsProcessing(true);
    const newFiles: UploadedFile[] = [];
    
    // Process files one by one to avoid memory spikes
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const content = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsText(file);
        });
        
        // We no longer split large files proactively to save memory
        // Only split if file is small (e.g. < 5MB)
        const isSmallFile = file.size < 5 * 1024 * 1024;
        const lines = isSmallFile && content.includes('\n') ? content.split(/\r?\n/) : undefined;
        const totalLines = lines ? lines.filter(l => l.trim().length > 0).length : Math.floor(content.length / 168);

        newFiles.push({ name: file.name, content, lines, totalLines });
      } catch (err) {
        console.error(`Error reading ${file.name}:`, err);
      }
    }

    const updatedFiles = [...uploadedFiles, ...newFiles];
    setUploadedFiles(updatedFiles);
    discoveryAll(updatedFiles);
    setFilters({});
    setIsProcessing(false);
  }, [uploadedFiles, discoveryAll]);

  // Reactive parsing when reports or files change
  React.useEffect(() => {
    if (uploadedFiles.length === 0) return;
    
    setIsProcessing(true);
    const timer = setTimeout(() => {
      let allParsedData: ParsedRecord[] = [];
      uploadedFiles.forEach(file => {
        groupSchemas.forEach(schema => {
          const data = parseTN070File(file.content, schema, file.lines);
          const dataWithSource = data.map(record => ({
            ...record,
            'Source File': file.name,
            'Record Type Info': schema.name
          }));
          
          // Use slice for display if data is massive
          if (allParsedData.length < 5000) {
             allParsedData = allParsedData.concat(dataWithSource);
          }
        });
      });
      setParsedData(allParsedData);
      setIsProcessing(false);
    }, 50);

    return () => clearTimeout(timer);
  }, [uploadedFiles, groupSchemas]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      processFiles(event.target.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFilterChange = (fieldName: string, value: string) => {
    setFilters(prev => ({
      ...prev,
      [fieldName]: value === 'all' ? '' : value
    }));
  };

  const handleExplain = async (record: ParsedRecord) => {
    setActiveExplainRecord(record);
    setIsExplaining(true);
    setSelectedExplanation(null);
    
    // Create a version of the record without internal labels for AI
    const rawRecord: Record<string, any> = {};
    Object.entries(record).forEach(([key, val]) => {
      if (!key.endsWith('(Label)') && key !== 'Source File') {
        rawRecord[key] = val;
      }
    });

    const explanation = await explainClearingRecord(rawRecord, selectedReport.name);
    setSelectedExplanation(explanation || null);
    setIsExplaining(false);
  };

  const filteredData = useMemo(() => {
    return parsedData.filter(record => {
      return Object.entries(filters).every(([field, value]) => {
        if (!value) return true;
        return String(record[field]) === value;
      });
    });
  }, [parsedData, filters]);

  const getReportDateSuffix = useCallback(() => {
    if (filteredData.length === 0) return '';
    
    // 1. Identify fields that likely contain dates from the actual data header
    const recordKeys = Object.keys(filteredData[0]);
    const potentialDateFields = recordKeys.filter(key => 
      key.toLowerCase().includes('date') || 
      key.toLowerCase().includes('run')
    );

    // 2. Comprehensive list of common network report date fields
    const commonDateFields = [
      'Run Date', 
      'Central Processing Date', 
      'Purchase Date', 
      'Transaction Date', 
      'Processing Date',
      'Central Site Business Date',
      'Central Site Processing Date of Original Message',
      'Date and Time, Local Transaction',
      'Proc Date'
    ];
    
    // Combine and prioritize
    const searchFields = Array.from(new Set([...potentialDateFields, ...commonDateFields]));
    
    // Scan records to find a valid date value
    for (const record of filteredData.slice(0, 20)) { 
      for (const field of searchFields) {
        if (record[field]) {
          const val = String(record[field]).replace(/[^0-9]/g, '');
          
          if (val.length === 6) {
            if (val.startsWith('26')) return `_2026${val.substring(2)}`; // YYMMDD
            if (val.endsWith('26')) return `_2026${val.substring(2, 4)}${val.substring(0, 2)}`; // DDMMYY
            return `_${val}`;
          }
          
          if (val.length === 8) {
            if (val.startsWith('2026')) return `_${val}`; // YYYYMMDD
            if (val.endsWith('2026')) return `_2026${val.substring(2, 4)}${val.substring(0, 2)}`; // DDMMYYYY
            return `_${val}`;
          }

          if (val.length === 12) {
            // Mastercard local time is MMDDHHMMSS, we assume 2026
            return `_2026${val.substring(0, 4)}`;
          }

          if (val.length > 0) {
            return `_${val.substring(0, 8)}`;
          }
        }
      }
    }
    
    // Fallback to current date if no data date is found
    return `_${new Date().toISOString().split('T')[0].replace(/-/g, '')}`;
  }, [filteredData]);

  const exportToExcel = () => {
    const dateSuffix = getReportDateSuffix();
    const dataToExport = selectedExportFields.length > 0 
      ? filteredData.map(record => {
          const filteredRow: any = {};
          selectedExportFields.forEach(field => {
            filteredRow[field] = record[field];
          });
          return filteredRow;
        })
      : filteredData;

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    
    // Force long numeric strings to be treated as text to prevent Excel from rounding or using scientific notation
    Object.keys(worksheet).forEach(cellKey => {
      if (cellKey.startsWith('!')) return;
      const cell = worksheet[cellKey];
      // If value is a string that looks like a long number (10+ digits), force it to Text type 's'
      if (cell.v && typeof cell.v === 'string' && /^\d+$/.test(cell.v) && cell.v.length >= 10) {
        cell.t = 's';
        cell.z = '@'; // Force text format
      }
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Extracted Records");
    XLSX.writeFile(workbook, `${selectedReport.id}${dateSuffix}_Extraction.xlsx`);
    setIsExportDialogOpen(false);
  };

  const exportToCSV = () => {
    const dateSuffix = getReportDateSuffix();
    const dataToExport = selectedExportFields.length > 0 
      ? filteredData.map(record => {
          const filteredRow: any = {};
          selectedExportFields.forEach(field => {
            filteredRow[field] = record[field];
          });
          return filteredRow;
        })
      : filteredData;

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    
    // Formulate CSV in a way that Excel respects long numeric strings if opened directly
    Object.keys(worksheet).forEach(cellKey => {
      if (cellKey.startsWith('!')) return;
      const cell = worksheet[cellKey];
      if (cell.v && typeof cell.v === 'string' && /^\d+$/.test(cell.v) && cell.v.length >= 10) {
        // Keeping them as pure strings in the worksheet before conversion helps.
        cell.t = 's';
      }
    });

    const csv = XLSX.utils.sheet_to_csv(worksheet);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${selectedReport.id}${dateSuffix}_Extraction.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsExportDialogOpen(false);
  };

  const sendEmail = async () => {
    setIsSendingEmail(true);
    setEmailError(null);
    setEmailSuccess(false);

    try {
      const dateSuffix = getReportDateSuffix();
      const fileName = `${selectedReport.id}${dateSuffix}_Extraction.xlsx`;
      
      const dataToExport = selectedExportFields.length > 0 
        ? filteredData.map(record => {
            const filteredRow: any = {};
            selectedExportFields.forEach(field => {
              filteredRow[field] = record[field];
            });
            return filteredRow;
          })
        : filteredData;

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);

      // Force long numeric strings to be treated as text to prevent Excel from rounding or using scientific notation
      Object.keys(worksheet).forEach(cellKey => {
        if (cellKey.startsWith('!')) return;
        const cell = worksheet[cellKey];
        // If value is a string that looks like a long number (10+ digits), force it to Text type 's'
        if (cell.v && typeof cell.v === 'string' && /^\d+$/.test(cell.v) && cell.v.length >= 10) {
          cell.t = 's';
          cell.z = '@'; // Force text format
        }
      });

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Extracted Records");
      
      // Generate base64
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
      const payloadSize = (excelBuffer.length * 0.75) / 1024 / 1024; // approx MB
      console.log(`[Export] Prepare to send email. Attachment size: ~${payloadSize.toFixed(2)} MB`);

      if (payloadSize > 20) {
        throw new Error(`Report is too large to email (~${payloadSize.toFixed(2)} MB). Please use the manual 'Download' button instead.`);
      }

      const response = await fetch('/api/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: emailAddresses.split(/[;,]/).map(e => e.trim()).filter(Boolean),
          subject: `${networkName} Extraction Report: ${selectedReport.id}${dateSuffix}`,
          body: `<p>Please find attached the extracted report for <b>${selectedReport.name}</b>.</p><p>Total Records: ${filteredData.length}</p>`,
          fileName,
          fileContent: excelBuffer,
          fileType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        })
      }).catch(err => {
        console.error("[Email] Fetch encountered error:", err);
        throw new Error("Network Error: The request could not reach the server. This usually happens if the report is too large or the server is temporarily unavailable.");
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to send email');

      setEmailSuccess(true);
      setTimeout(() => {
        setIsExportDialogOpen(false);
        setEmailSuccess(false);
      }, 2000);
    } catch (err: any) {
      setEmailError(err.message);
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleExportClick = (type: 'excel' | 'csv' | 'email') => {
    setExportType(type);
    setIsExportDialogOpen(true);
  };

  const toggleExportField = (fieldName: string) => {
    setSelectedExportFields(prev => 
      prev.includes(fieldName) 
        ? prev.filter(f => f !== fieldName)
        : [...prev, fieldName]
    );
  };

  const selectAllFields = () => {
    setSelectedExportFields(groupFields.map(f => f.name));
  };

  const deselectAllFields = () => {
    setSelectedExportFields([]);
  };

  const topValuesMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    groupFields.forEach(field => {
      map[field.name] = getTopValues(parsedData, field.name);
    });
    return map;
  }, [parsedData, groupFields]);

  return (
    <div className="flex-1 flex overflow-hidden relative">
      <AnimatePresence>
        {isProcessing && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center"
          >
            <div className="bg-white p-8 rounded-3xl shadow-2xl border border-gray-100 flex flex-col items-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-gray-100 rounded-full" />
                <div className="absolute inset-0 border-4 border-t-blue-600 rounded-full animate-spin" style={{ borderColor: `${accentColor} transparent transparent transparent` }} />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-bold text-gray-900">Processing Data</h3>
                <p className="text-sm text-gray-500">Extracting and validating clearing records...</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className="w-80 border-r border-[#E5E7EB] bg-white flex flex-col overflow-hidden">
        <div className="p-4 border-b">
          <Button variant="ghost" size="sm" onClick={onBack} className="text-gray-500 hover:text-gray-900 gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Network Selection
          </Button>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest">{networkName} Configuration</h2>
            <Badge variant="outline" className="text-[9px] font-bold py-0 h-4 px-1.5 text-gray-400">
              v1.8.5
            </Badge>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="report-select" className="text-xs font-bold text-gray-700">Select Report Type</Label>
              <Select value={selectedReportGroup} onValueChange={(val) => {
                setSelectedReportId(val);
                setFilters({});
              }}>
                <SelectTrigger id="report-select" className="w-full bg-gray-50 border-gray-200 focus:ring-offset-0">
                  <SelectValue placeholder="Choose a report..." />
                </SelectTrigger>
                <SelectContent>
                  {uniqueReports.map(report => (
                    <SelectItem key={report.id} value={report.id}>
                      {report.group ? report.group : report.id} - {report.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Card className="bg-gray-50 border-dashed border-gray-200">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Info className="w-4 h-4" style={{ color: accentColor }} />
                  Schema Preview
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <p className="text-xs text-gray-600 leading-relaxed mb-3">
                  {selectedReport.description}
                </p>
                <Separator className="my-2" />
                <ScrollArea className="h-48 pr-4">
                  <div className="space-y-2">
                    {groupFields.map((field, idx) => (
                      <div key={idx} className="flex justify-between items-center text-[10px]">
                        <span className="font-mono text-gray-500">{field.name}</span>
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 bg-white border-gray-200">
                          {field.type}, {field.length}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
        
        <div className="mt-auto p-6 border-t border-gray-100">
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-blue-500 shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-blue-900">Need Help?</h4>
                <p className="text-[10px] text-blue-700 mt-1">
                  Contact the Data Engineering team for custom report schemas or parsing issues.
                </p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        <ScrollArea className="flex-1">
          <div className="p-8 max-w-6xl mx-auto w-full space-y-8">
            {/* Upload Section */}
            <section>
              <div 
                className={cn(
                  "relative border-2 border-dashed rounded-2xl p-12 transition-all duration-300 flex flex-col items-center justify-center gap-4",
                  isDragging ? "bg-[#FFF5F0]" : "border-gray-200 bg-white hover:border-gray-300",
                  uploadedFiles.length > 0 ? "py-8" : "py-16"
                )}
                style={{ borderColor: isDragging ? accentColor : undefined }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input 
                  type="file" 
                  multiple
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  onChange={handleFileUpload}
                  accept=".txt,.dat,.raw,*"
                />
                <div className={cn(
                  "w-16 h-16 rounded-full flex items-center justify-center transition-colors",
                  uploadedFiles.length > 0 ? "bg-green-100" : "bg-gray-100"
                )}>
                  {uploadedFiles.length > 0 ? (
                    <CheckCircle2 className="w-8 h-8 text-green-600" />
                  ) : (
                    <Upload className="w-8 h-8 text-gray-400" />
                  )}
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-bold text-gray-900">
                    {uploadedFiles.length > 0 
                      ? `${uploadedFiles.length} File(s) Loaded` 
                      : `Upload Raw ${networkName} Files`}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {uploadedFiles.length > 0 
                      ? uploadedFiles.map(f => f.name).join(', ') 
                      : "Drag and drop your files here or click to browse"}
                  </p>
                </div>
                {uploadedFiles.length > 0 && (
                  <Button variant="outline" size="sm" className="mt-2" onClick={() => {
                    setUploadedFiles([]);
                    setParsedData([]);
                    setFilters({});
                  }}>
                    <X className="w-4 h-4 mr-2" />
                    Clear All Files
                  </Button>
                )}
              </div>
            </section>

            {/* Data Section */}
            <AnimatePresence>
              {uploadedFiles.length > 0 && (
                <motion.section
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="space-y-6"
                >
                  {/* Summary Section */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="bg-white border-gray-100 shadow-sm">
                      <CardHeader className="p-4 pb-2">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                          File Upload Stats
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 pt-0">
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="hover:bg-transparent border-b">
                                <TableHead className="h-8 text-[10px] font-bold uppercase text-gray-500">File Name</TableHead>
                                <TableHead className="h-8 text-[10px] font-bold uppercase text-gray-500 text-right">Total Lines</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {uploadedFiles.map(file => (
                                <TableRow key={file.name} className="hover:bg-gray-50/50">
                                  <TableCell className="py-2 text-xs font-medium text-gray-700">{file.name}</TableCell>
                                  <TableCell className="py-2 text-xs text-right font-mono text-gray-500">{file.totalLines}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-white border-gray-100 shadow-sm border-l-4" style={{ borderLeftColor: accentColor }}>
                      <CardHeader className="p-4 pb-2">
                        <CardTitle className="text-sm font-bold flex items-center justify-between">
                          <div className="flex items-center gap-2 text-gray-900">
                            <FileSearch className="w-4 h-4" style={{ color: accentColor }} />
                            Auto-Discovered Records
                          </div>
                          <Badge variant="outline" className="text-[10px] font-bold py-0 h-5">
                            {Object.keys(discoveryResults).length} Types Identified
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 pt-0">
                        <ScrollArea className="h-[120px] pr-4">
                          <div className="space-y-2 py-2">
                            {discoverySummary.map(({ id, name, count, schemaId }) => {
                              const isActive = selectedReportGroup === id;
                              return (
                                <button
                                  key={id}
                                  onClick={() => setSelectedReportId(id)}
                                  className={cn(
                                    "w-full flex items-center justify-between p-2 rounded-lg text-left transition-all border",
                                    isActive 
                                      ? "bg-gray-50 border-gray-200 ring-1 ring-inset" 
                                      : "hover:bg-gray-50 border-transparent"
                                  )}
                                  style={{ ringColor: isActive ? accentColor : undefined }}
                                >
                                  <div className="flex flex-col">
                                    <span className="text-[11px] font-bold text-gray-900 leading-tight">
                                      {name}
                                    </span>
                                    <span className="text-[9px] text-gray-500 uppercase font-mono">
                                      {id}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {count > 0 ? (
                                      <span className="text-xs font-mono font-bold text-gray-900">{count}</span>
                                    ) : (
                                      <Badge variant="outline" className="text-[8px] font-bold text-amber-600 border-amber-200 bg-amber-50">
                                        Header Found
                                      </Badge>
                                    )}
                                    {isActive && <Zap className="w-3 h-3" style={{ color: accentColor }} />}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  </div>

                  {parsedData.length > 0 ? (
                    <>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-6">
                          <div className="space-y-1">
                            <h2 className="text-2xl font-bold tracking-tight">Data Intelligence</h2>
                            <p className="text-xs text-gray-400">Analysis and extraction for {selectedReport.id}</p>
                          </div>
                          
                          <Tabs value={activeTab} onValueChange={setActiveTab} className="bg-gray-100/50 p-1 rounded-lg">
                            <TabsList className="bg-transparent border-none">
                              <TabsTrigger value="table" className="data-[state=active]:bg-white data-[state=active]:shadow-sm gap-2 text-xs">
                                <TableIcon className="w-3.5 h-3.5" />
                                Record Explorer
                              </TabsTrigger>
                              <TabsTrigger value="dashboard" className="data-[state=active]:bg-white data-[state=active]:shadow-sm gap-2 text-xs">
                                <LayoutDashboard className="w-3.5 h-3.5" />
                                Pulse Analytics
                              </TabsTrigger>
                            </TabsList>
                          </Tabs>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleExportClick('email')} className="gap-2">
                            <Mail className="w-4 h-4" />
                            Email Report
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleExportClick('csv')} className="gap-2">
                            <FileText className="w-4 h-4" />
                            Export CSV
                          </Button>
                          <Button variant="default" size="sm" onClick={() => handleExportClick('excel')} style={{ backgroundColor: accentColor }} className="hover:opacity-90 gap-2">
                            <Download className="w-4 h-4" />
                            Export Excel
                          </Button>
                        </div>
                      </div>

                      <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
                        <DialogContent className="max-w-md">
                          <DialogHeader>
                            <DialogTitle>{exportType === 'email' ? 'Email Report' : 'Export Settings'}</DialogTitle>
                            <DialogDescription>
                              {exportType === 'email' 
                                ? 'Send the extracted report as an Excel attachment to specified recipients.'
                                : `Select the fields you want to include in your ${exportType === 'excel' ? 'Excel' : 'CSV'} report.`}
                            </DialogDescription>
                          </DialogHeader>

                          <div className="space-y-4 py-4">
                            {exportType === 'email' && (
                              <div className="space-y-2">
                                <Label htmlFor="emails">Recipients (comma separated)</Label>
                                <Input 
                                  id="emails"
                                  placeholder="finance@example.com, audit@example.com"
                                  value={emailAddresses}
                                  onChange={(e) => setEmailAddresses(e.target.value)}
                                  className="text-sm"
                                />
                                {emailError && <p className="text-xs text-red-500 font-medium">{emailError}</p>}
                                {emailSuccess && <p className="text-xs text-green-600 font-bold flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Email sent successfully!</p>}
                              </div>
                            )}

                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">Fields to Include</span>
                              <div className="flex gap-2">
                                <Button variant="ghost" size="xs" onClick={selectAllFields} className="text-[10px] h-6 px-2">Select All</Button>
                                <Button variant="ghost" size="xs" onClick={deselectAllFields} className="text-[10px] h-6 px-2">Deselect All</Button>
                              </div>
                            </div>

                            <ScrollArea className="h-[300px] border rounded-md p-4">
                              <div className="space-y-3">
                                {groupFields.map(field => (
                                  <div key={field.name} className="flex items-center space-x-2">
                                    <Checkbox 
                                      id={`export-field-${field.name}`} 
                                      checked={selectedExportFields.includes(field.name)}
                                      onCheckedChange={() => toggleExportField(field.name)}
                                    />
                                    <label
                                      htmlFor={`export-field-${field.name}`}
                                      className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                    >
                                      {field.name}
                                    </label>
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          </div>

                          <DialogFooter>
                            <Button variant="outline" onClick={() => setIsExportDialogOpen(false)}>Cancel</Button>
                            {exportType === 'email' ? (
                              <Button 
                                onClick={sendEmail}
                                disabled={selectedExportFields.length === 0 || !emailAddresses.trim() || isSendingEmail}
                                style={{ backgroundColor: accentColor }}
                                className="gap-2"
                              >
                                {isSendingEmail && <Loader2 className="w-4 h-4 animate-spin" />}
                                Send Email
                              </Button>
                            ) : (
                              <Button 
                                onClick={exportType === 'excel' ? exportToExcel : exportToCSV}
                                disabled={selectedExportFields.length === 0}
                                style={{ backgroundColor: accentColor }}
                              >
                                Download {exportType === 'excel' ? 'Excel' : 'CSV'}
                              </Button>
                            )}
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>

                      <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsContent value="dashboard" className="mt-0">
                          <AnalyticsDashboard data={parsedData} accentColor={accentColor} />
                        </TabsContent>

                        <TabsContent value="table" className="mt-0 space-y-6">
                          <Card className="border-gray-200 overflow-hidden shadow-sm">
                            <div className="bg-gray-50 border-b p-4 flex flex-wrap gap-3 items-center">
                              <div className="flex items-center gap-2 text-sm font-bold text-gray-600 mr-2">
                                <Filter className="w-4 h-4" />
                                Quick Filters:
                              </div>
                              {groupFields.slice(0, 4).map((field) => (
                            <div key={field.name} className="flex flex-col gap-1">
                              <Select 
                                value={filters[field.name] || 'all'} 
                                onValueChange={(val) => handleFilterChange(field.name, val)}
                              >
                                <SelectTrigger className="h-8 min-w-[140px] bg-white text-xs">
                                  <SelectValue placeholder={`Filter ${field.name}...`} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">All {field.name}s</SelectItem>
                                  {getTopValues(parsedData, field.name).map(val => (
                                    <SelectItem key={val} value={val}>{val}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          ))}
                          
                          <Dialog>
                            <DialogTrigger 
                              render={
                                <Button variant="ghost" size="sm" className="text-xs font-bold hover:bg-gray-100" style={{ color: accentColor }}>
                                  More Filters...
                                </Button>
                              }
                            />
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>Advanced Filtering</DialogTitle>
                                <DialogDescription>
                                  Apply filters to any field in the {selectedReport.name}.
                                </DialogDescription>
                              </DialogHeader>
                              <div className="grid grid-cols-2 gap-4 py-4">
                                {groupFields.map((field) => (
                                  <div key={field.name} className="space-y-1.5">
                                    <Label className="text-[10px] font-bold uppercase text-gray-500">{field.name}</Label>
                                    <Select 
                                      value={filters[field.name] || 'all'} 
                                      onValueChange={(val) => handleFilterChange(field.name, val)}
                                    >
                                      <SelectTrigger className="h-9 bg-gray-50 text-xs">
                                        <SelectValue placeholder={`Select ${field.name}`} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="all">All Values</SelectItem>
                                        {(topValuesMap[field.name] || []).map(val => (
                                          <SelectItem key={val} value={val}>{val}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                ))}
                              </div>
                              <div className="flex justify-end">
                                <Button onClick={() => setFilters({})} variant="outline" size="sm" className="mr-2">
                                  Reset All
                                </Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </div>

                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader className="bg-gray-50">
                              <TableRow>
                                <TableHead className="text-[10px] font-bold uppercase text-gray-500 whitespace-nowrap">
                                  Action
                                </TableHead>
                                <TableHead className="text-[10px] font-bold uppercase text-gray-500 whitespace-nowrap">
                                  Source File
                                </TableHead>
                                {groupFields.map((field) => (
                                  <TableHead key={field.name} className="text-[10px] font-bold uppercase text-gray-500 whitespace-nowrap">
                                    {field.name}
                                  </TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredData.length > 0 ? (
                                filteredData.slice(0, 100).map((record, idx) => (
                                  <TableRow key={idx} className="hover:bg-gray-50/50 transition-colors group/row">
                                    <TableCell className="py-3">
                                      <Button 
                                        variant="ghost" 
                                        size="xs" 
                                        onClick={() => handleExplain(record)}
                                        className="h-6 w-6 p-0 rounded-full hover:bg-white hover:shadow-sm"
                                        title="Ask AI Expert"
                                      >
                                        <BrainCircuit className="w-3.5 h-3.5" style={{ color: accentColor }} />
                                      </Button>
                                    </TableCell>
                                    <TableCell className="text-[10px] font-medium text-gray-400 py-3">
                                      {record['Source File']}
                                    </TableCell>
                                    {groupFields.map((field) => {
                                      const labelValue = record[`${field.name} (Label)`];
                                      return (
                                        <TableCell key={field.name} className="text-xs font-mono py-3">
                                          <div className="flex flex-col">
                                            <span>{record[field.name] ?? '-'}</span>
                                            {labelValue && (
                                              <span className="text-[9px] text-gray-400 font-sans mt-0.5 truncate max-w-[120px]" title={String(labelValue)}>
                                                {labelValue}
                                              </span>
                                            )}
                                          </div>
                                        </TableCell>
                                      );
                                    })}
                                  </TableRow>
                                ))
                              ) : (
                                <TableRow>
                                  <TableCell colSpan={selectedReport.fields.length + 2} className="h-32 text-center text-gray-500 italic">
                                    No records match the current filters.
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </div>
                        {filteredData.length > 100 && (
                          <div className="p-4 bg-gray-50 border-t text-center">
                            <p className="text-xs text-gray-500">
                              Showing first 100 records. Export to Excel/CSV to view all {filteredData.length} records.
                            </p>
                          </div>
                        )}
                      </Card>
                    </TabsContent>
                  </Tabs>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 bg-white rounded-2xl border-2 border-dashed border-gray-100">
                  <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
                    <Search className="w-8 h-8 text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">No Records Found</h3>
                    <p className="text-sm text-gray-500 max-w-xs mt-1">
                      We couldn't find any records matching the <strong>{selectedReport.id}</strong> schema in this file.
                      Please ensure you've selected the correct report type.
                    </p>
                  </div>
                </div>
              )}
            </motion.section>
          )}
        </AnimatePresence>

            {/* AI Explanation Dialog */}
            <Dialog open={!!activeExplainRecord} onOpenChange={(open) => { if (!open) setActiveExplainRecord(null); }}>
              <DialogContent className="max-w-2xl max-h-[80vh]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <BrainCircuit className="w-5 h-5" style={{ color: accentColor }} />
                    AI Clearing Expert Analysis
                  </DialogTitle>
                  <DialogDescription>
                    Gemini Intelligence exploring record from {selectedReport.name}
                  </DialogDescription>
                </DialogHeader>
                
                <div className="mt-4 bg-gray-50 rounded-xl p-4 border border-gray-100 overflow-hidden font-mono text-[10px] text-gray-600">
                  <h4 className="font-bold mb-2 uppercase tracking-wider text-gray-400">Raw Data Segment</h4>
                  <div className="grid grid-cols-3 gap-x-4 gap-y-2 max-h-32 overflow-y-auto pr-2">
                    {activeExplainRecord && Object.entries(activeExplainRecord)
                      .filter(([k]) => !k.endsWith('(Label)') && k !== 'Source File')
                      .map(([k, v]) => (
                        <div key={k} className="flex justify-between border-b border-gray-100 py-1">
                          <span className="font-bold mr-2">{k}:</span>
                          <span className="text-gray-900">{v}</span>
                        </div>
                      ))}
                  </div>
                </div>

                <ScrollArea className="mt-6 h-[400px] pr-4">
                  {isExplaining ? (
                    <div className="flex flex-col items-center justify-center h-full space-y-4 py-20">
                      <Loader2 className="w-8 h-8 animate-spin" style={{ color: accentColor }} />
                      <p className="text-sm text-gray-500 animate-pulse">De-coding financial transaction data...</p>
                    </div>
                  ) : (
                    <div className="space-y-4 text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
                      {selectedExplanation || "An error occurred while generating the explanation."}
                    </div>
                  )}
                </ScrollArea>
                
                <DialogFooter className="mt-6 pt-4 border-t">
                  <Button variant="outline" onClick={() => setActiveExplainRecord(null)}>Close Analysis</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Empty State */}
            {uploadedFiles.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center">
                  <TableIcon className="w-10 h-10 text-gray-300" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">No Data Loaded</h3>
                  <p className="text-gray-500 max-w-md mt-2">
                    Select a report type from the sidebar and upload a raw {networkName} file to begin extraction and analysis.
                  </p>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}
