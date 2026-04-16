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
  ArrowLeft
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
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';

import { ReportSchema } from '@/src/constants/schemas';
import { parseTN070File, ParsedRecord, getTopValues } from '@/src/lib/parser';
import { cn } from '@/lib/utils';

interface ReportExtractorProps {
  schemas: ReportSchema[];
  networkName: string;
  accentColor: string;
  onBack: () => void;
}

export function ReportExtractor({ schemas, networkName, accentColor, onBack }: ReportExtractorProps) {
  const [selectedReportId, setSelectedReportId] = useState<string>(schemas[0].id);
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string, content: string, totalLines: number }[]>([]);
  const [parsedData, setParsedData] = useState<ParsedRecord[]>([]);
  const [filters, setFilters] = useState<{ [key: string]: string }>({});
  const [isDragging, setIsDragging] = useState(false);

  const selectedReport = useMemo(() => 
    schemas.find(r => r.id === selectedReportId) || schemas[0],
    [selectedReportId, schemas]
  );

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const newFiles: { name: string, content: string, totalLines: number }[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const content = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsText(file);
      });
      // Count total non-empty lines in the raw file
      const totalLines = content.split(/\r?\n/).filter(l => l.trim().length > 0).length;
      newFiles.push({ name: file.name, content, totalLines });
    }

    setUploadedFiles(prev => [...prev, ...newFiles]);
    
    // Re-parse all files with current schema
    const allParsedData: ParsedRecord[] = [];
    const updatedFiles = [...uploadedFiles, ...newFiles];
    
    updatedFiles.forEach(file => {
      const data = parseTN070File(file.content, selectedReport);
      // Add source file info to each record
      const dataWithSource = data.map(record => ({
        ...record,
        'Source File': file.name
      }));
      allParsedData.push(...dataWithSource);
    });

    setParsedData(allParsedData);
    setFilters({});
  }, [selectedReport, uploadedFiles]);

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

  const filteredData = useMemo(() => {
    return parsedData.filter(record => {
      return Object.entries(filters).every(([field, value]) => {
        if (!value) return true;
        return String(record[field]) === value;
      });
    });
  }, [parsedData, filters]);

  const exportToExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(filteredData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Extracted Records");
    XLSX.writeFile(workbook, `${selectedReport.id}_Extraction.xlsx`);
  };

  const exportToCSV = () => {
    const worksheet = XLSX.utils.json_to_sheet(filteredData);
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${selectedReport.id}_Extraction.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Sidebar */}
      <aside className="w-80 border-r border-[#E5E7EB] bg-white flex flex-col overflow-hidden">
        <div className="p-4 border-b">
          <Button variant="ghost" size="sm" onClick={onBack} className="text-gray-500 hover:text-gray-900 gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Network Selection
          </Button>
        </div>
        <div className="p-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-4">{networkName} Configuration</h2>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="report-select" className="text-xs font-bold text-gray-700">Select Report Type</Label>
              <Select value={selectedReportId} onValueChange={(val) => {
                setSelectedReportId(val);
                if (uploadedFiles.length > 0) {
                  const report = schemas.find(r => r.id === val)!;
                  const allParsedData: ParsedRecord[] = [];
                  uploadedFiles.forEach(file => {
                    const data = parseTN070File(file.content, report);
                    const dataWithSource = data.map(record => ({
                      ...record,
                      'Source File': file.name
                    }));
                    allParsedData.push(...dataWithSource);
                  });
                  setParsedData(allParsedData);
                  setFilters({});
                }
              }}>
                <SelectTrigger id="report-select" className="w-full bg-gray-50 border-gray-200 focus:ring-offset-0">
                  <SelectValue placeholder="Choose a report..." />
                </SelectTrigger>
                <SelectContent>
                  {schemas.map(report => (
                    <SelectItem key={report.id} value={report.id}>
                      {report.id} - {report.name}
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
                    {selectedReport.fields.map((field, idx) => (
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
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="bg-white border-gray-100 shadow-sm col-span-full">
                      <CardHeader className="p-4 pb-2">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                          File Processing Summary
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 pt-0">
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="hover:bg-transparent border-b">
                                <TableHead className="h-8 text-[10px] font-bold uppercase text-gray-500">File Name</TableHead>
                                <TableHead className="h-8 text-[10px] font-bold uppercase text-gray-500 text-right">Extracted Records</TableHead>
                                <TableHead className="h-8 text-[10px] font-bold uppercase text-gray-500 text-right">Total Lines</TableHead>
                                <TableHead className="h-8 text-[10px] font-bold uppercase text-gray-500 text-right">Match Rate</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {uploadedFiles.map(file => {
                                const extractedCount = parsedData.filter(r => r['Source File'] === file.name).length;
                                const rate = file.totalLines > 0 ? (extractedCount / file.totalLines * 100).toFixed(1) : '0';
                                return (
                                  <TableRow key={file.name} className="hover:bg-gray-50/50">
                                    <TableCell className="py-2 text-xs font-medium text-gray-700">{file.name}</TableCell>
                                    <TableCell className="py-2 text-xs text-right font-mono font-bold text-gray-900">{extractedCount}</TableCell>
                                    <TableCell className="py-2 text-xs text-right font-mono text-gray-500">{file.totalLines}</TableCell>
                                    <TableCell className="py-2 text-xs text-right">
                                      <Badge variant="secondary" className="text-[9px] font-bold">
                                        {rate}%
                                      </Badge>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {parsedData.length > 0 ? (
                    <>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <h2 className="text-2xl font-bold tracking-tight">Extracted Records</h2>
                          <Badge style={{ backgroundColor: accentColor }} className="hover:opacity-90">
                            {filteredData.length} Records Found
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={exportToCSV} className="gap-2">
                            <FileText className="w-4 h-4" />
                            Export CSV
                          </Button>
                          <Button variant="default" size="sm" onClick={exportToExcel} style={{ backgroundColor: accentColor }} className="hover:opacity-90 gap-2">
                            <Download className="w-4 h-4" />
                            Export Excel
                          </Button>
                        </div>
                      </div>

                      <Card className="border-gray-200 overflow-hidden shadow-sm">
                        <div className="bg-gray-50 border-b p-4 flex flex-wrap gap-3 items-center">
                          <div className="flex items-center gap-2 text-sm font-bold text-gray-600 mr-2">
                            <Filter className="w-4 h-4" />
                            Quick Filters:
                          </div>
                          {selectedReport.fields.slice(0, 4).map((field) => (
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
                                {selectedReport.fields.map((field) => (
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
                                        {getTopValues(parsedData, field.name).map(val => (
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
                                  Source File
                                </TableHead>
                                {selectedReport.fields.map((field) => (
                                  <TableHead key={field.name} className="text-[10px] font-bold uppercase text-gray-500 whitespace-nowrap">
                                    {field.name}
                                  </TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredData.length > 0 ? (
                                filteredData.slice(0, 100).map((record, idx) => (
                                  <TableRow key={idx} className="hover:bg-gray-50/50 transition-colors">
                                    <TableCell className="text-[10px] font-medium text-gray-400 py-3">
                                      {record['Source File']}
                                    </TableCell>
                                    {selectedReport.fields.map((field) => (
                                      <TableCell key={field.name} className="text-xs font-mono py-3">
                                        {record[field.name]}
                                      </TableCell>
                                    ))}
                                  </TableRow>
                                ))
                              ) : (
                                <TableRow>
                                  <TableCell colSpan={selectedReport.fields.length + 1} className="h-32 text-center text-gray-500 italic">
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
