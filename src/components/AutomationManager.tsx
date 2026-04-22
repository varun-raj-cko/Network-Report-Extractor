import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  Slack, 
  FolderOpen, 
  Type, 
  Play, 
  Trash2, 
  Plus, 
  CheckCircle2,
  AlertCircle,
  Network,
  Mail,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface AutoJob {
  id: string;
  name: string;
  reportType: string;
  scheme: string;
  sourceType: 'server' | 'drive';
  folderPath?: string;
  driveFolderId?: string;
  time: string;
  recipientEmail: string;
  active: boolean;
}

export function AutomationManager() {
  const [jobs, setJobs] = useState<AutoJob[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newJob, setNewJob] = useState<Partial<AutoJob>>({
    name: '',
    reportType: '',
    scheme: 'Mastercard',
    sourceType: 'server',
    folderPath: '/uploads/automation',
    driveFolderId: '',
    time: '09:00',
    recipientEmail: ''
  });

  const [isRunningJob, setIsRunningJob] = useState<string | null>(null);

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    try {
      const response = await fetch('/api/automation/jobs');
      const data = await response.json();
      setJobs(data);
    } catch (err) {
      console.error("Failed to fetch jobs", err);
    }
  };

  const handleRunJob = async (id: string) => {
    setIsRunningJob(id);
    try {
      const response = await fetch(`/api/automation/jobs/${id}/run`, {
        method: 'POST'
      });
      if (response.ok) {
        alert("Automation task triggered. Please check your email for the scan results!");
      } else {
        const error = await response.json();
        alert(`Automation failed: ${error.error}`);
      }
    } catch (err) {
      alert("System error triggering automation.");
    } finally {
      setIsRunningJob(null);
    }
  };

  const handleAddJob = async () => {
    if (!newJob.name || !newJob.reportType || !newJob.recipientEmail) return;
    
    try {
      const response = await fetch('/api/automation/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newJob)
      });
      if (response.ok) {
        setIsAdding(false);
        setNewJob({
          name: '',
          reportType: '',
          scheme: 'Mastercard',
          sourceType: 'server',
          folderPath: '/uploads/automation',
          driveFolderId: '',
          time: '09:00',
          recipientEmail: ''
        });
        fetchJobs();
      }
    } catch (err) {
      console.error("Failed to add job", err);
    }
  };

  const handleDeleteJob = async (id: string) => {
    try {
      const response = await fetch(`/api/automation/jobs/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        fetchJobs();
      }
    } catch (err) {
      console.error("Failed to delete job", err);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Automation Engine</h2>
          <p className="text-gray-500">Scheduled report extraction from Server or Google Drive.</p>
        </div>
        <Button onClick={() => setIsAdding(!isAdding)} className="gap-2 bg-black hover:bg-gray-800">
          <Plus className="w-4 h-4" />
          {isAdding ? 'Cancel' : 'New Automation'}
        </Button>
      </div>

      {isAdding && (
        <Card className="border-2 border-dashed border-blue-200 bg-blue-50/30">
          <CardHeader>
            <CardTitle className="text-lg">Configure Scheduled Task</CardTitle>
            <CardDescription>Automate daily report checks from your chosen data source.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="job-name">Job Name</Label>
              <Input 
                id="job-name" 
                placeholder="Daily Network Audit" 
                value={newJob.name}
                onChange={e => setNewJob({...newJob, name: e.target.value})}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="scheme">Network Scheme</Label>
              <Select value={newJob.scheme} onValueChange={val => setNewJob({...newJob, scheme: val})}>
                <SelectTrigger id="scheme">
                  <SelectValue placeholder="Select Network" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Mastercard">Mastercard</SelectItem>
                  <SelectItem value="Visa">Visa</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="source">Data Source</Label>
              <Select value={newJob.sourceType} onValueChange={(val: 'server' | 'drive') => setNewJob({...newJob, sourceType: val})}>
                <SelectTrigger id="source">
                  <SelectValue placeholder="Select Data Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="server">Server Folder</SelectItem>
                  <SelectItem value="drive">Google Drive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="report">Report Keyword (to match file name)</Label>
              <Input 
                id="report" 
                placeholder="TC33, IP727, etc." 
                value={newJob.reportType}
                onChange={e => setNewJob({...newJob, reportType: e.target.value})}
              />
            </div>

            {newJob.sourceType === 'server' ? (
              <div className="space-y-2">
                <Label htmlFor="folder">Server Folder Path</Label>
                <Input 
                  id="folder" 
                  placeholder="/uploads/automation" 
                  value={newJob.folderPath}
                  onChange={e => setNewJob({...newJob, folderPath: e.target.value})}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="drive-id">Google Drive Folder ID</Label>
                <Input 
                  id="drive-id" 
                  placeholder="Paste Drive Folder ID" 
                  value={newJob.driveFolderId}
                  onChange={e => setNewJob({...newJob, driveFolderId: e.target.value})}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="time">Execution Time (Daily)</Label>
              <Input 
                id="time" 
                type="time" 
                value={newJob.time}
                onChange={e => setNewJob({...newJob, time: e.target.value})}
              />
            </div>

            <div className="space-y-2 col-span-2">
              <Label htmlFor="email">Recipient Email(s)</Label>
              <div className="flex gap-2">
                <div className="flex items-center justify-center bg-gray-100 p-2 rounded-md">
                   <Mail className="w-4 h-4 text-blue-600" />
                </div>
                <Input 
                  id="email" 
                  placeholder="team-alerts@company.com" 
                  value={newJob.recipientEmail}
                  onChange={e => setNewJob({...newJob, recipientEmail: e.target.value})}
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-3">
             <Button variant="outline" onClick={() => setIsAdding(false)}>Cancel</Button>
             <Button onClick={handleAddJob} className="bg-blue-600 hover:bg-blue-700 text-white">Establish Automation</Button>
          </CardFooter>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4">
        {jobs.length === 0 ? (
          <div className="h-64 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-gray-400 bg-gray-50/50">
             <Clock className="w-8 h-8 mb-2 opacity-20" />
             <p>No active automations. Create one to start monitoring your reports.</p>
          </div>
        ) : (
          jobs.map(job => (
            <Card key={job.id} className="group overflow-hidden">
               <div className="p-6 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                       {job.sourceType === 'drive' ? (
                         <Network className="w-6 h-6 text-gray-400 group-hover:text-blue-600" />
                       ) : (
                         <FolderOpen className="w-6 h-6 text-gray-400 group-hover:text-blue-600" />
                       )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                         <h3 className="font-bold text-lg">{job.name}</h3>
                         <Badge variant="outline" className="text-[10px] uppercase text-gray-400">{job.sourceType}</Badge>
                         <Badge variant="outline" className="text-[10px] uppercase">{job.scheme}</Badge>
                         {job.active && <Badge className="bg-green-100 text-green-700 border-green-200">Active</Badge>}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-gray-500">
                         <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {job.time} (Daily)</span>
                         <span className="flex items-center gap-1">
                           <Type className="w-3 h-3" /> Keyword: "{job.reportType}"
                         </span>
                         <span className="flex items-center gap-1 text-blue-600 font-medium">
                           <Mail className="w-3 h-3" /> {job.recipientEmail}
                         </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                     <Button 
                        variant="ghost" 
                        size="icon" 
                        disabled={isRunningJob === job.id}
                        onClick={() => handleRunJob(job.id)} 
                        className="text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                        title="Trigger Scan Now"
                     >
                        {isRunningJob === job.id ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Play className="w-5 h-5" />
                        )}
                     </Button>
                     <Button variant="ghost" size="icon" onClick={() => handleDeleteJob(job.id)} className="text-gray-400 hover:text-red-600">
                        <Trash2 className="w-5 h-5" />
                     </Button>
                  </div>
               </div>
            </Card>
          ))
        )}
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="bg-white p-3 rounded-xl shadow-sm">
             <AlertCircle className="text-blue-600 w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold mb-2">Setting up Google Drive Automation</h4>
            <ol className="text-sm text-gray-600 space-y-3 list-decimal pl-4">
              <li>
                <b>Service Account:</b> You need a Google Service Account. Add the entire JSON credential string to the <code>GOOGLE_SERVICE_ACCOUNT_JSON</code> secret.
              </li>
              <li>
                <b>Share Folder:</b> Open your Google Drive folder and share it with the <code>client_email</code> address found inside your Service Account JSON.
              </li>
              <li>
                <b>Get Folder ID:</b> The Folder ID is the last part of the URL when you open the folder in your browser (e.g., <code>1abc123...</code>).
              </li>
              <li>
                <b>Test:</b> Use the <b>Play</b> button on the automation card to verify the server can successfully reach and scan your Drive folder.
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

