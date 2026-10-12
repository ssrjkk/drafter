/**
 * Team collaboration features
 * @module TeamFeatures
 * @author ssrjkk
 */

import { memo, useState } from 'react';
import { GlassCard, Accordion, Tabs, TabPanel, useToast } from '../ui';
import type { Project } from '../../types';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'editor' | 'viewer';
  avatar?: string;
}

interface TeamFeaturesProps {
  currentProject: Project | null;
  onShare?: (projectId: number, emails: string[], role: 'editor' | 'viewer') => Promise<void>;
  onExportForTeam: (project: Project) => string;
  onImportFromTeam: (data: string) => Promise<boolean>;
  teamMembers?: TeamMember[];
  onRemoveMember?: (memberId: string) => Promise<void>;
}

export const TeamFeatures = memo(function TeamFeatures({
  currentProject,
  onShare,
  onExportForTeam,
  onImportFromTeam,
  teamMembers = [],
  onRemoveMember,
}: TeamFeaturesProps) {
  const [activeTab, setActiveTab] = useState('share');
  const [emails, setEmails] = useState('');
  const [shareRole, setShareRole] = useState<'editor' | 'viewer'>('viewer');
  const [exportData, setExportData] = useState('');
  const [importData, setImportData] = useState('');
  const [importError, setImportError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { addToast } = useToast();

  const handleShare = async () => {
    if (!currentProject || !emails.trim() || !onShare) return;
    setIsLoading(true);
    try {
      const emailList = emails.split(',').map(e => e.trim()).filter(Boolean);
      await onShare(currentProject.id, emailList, shareRole);
      setEmails('');
      addToast('Project shared successfully', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to share project', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    if (!currentProject) return;
    const data = onExportForTeam(currentProject);
    setExportData(data);
  };

  const handleCopyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportData);
      addToast('Export copied to clipboard', 'success');
    } catch {
      addToast('Failed to copy export', 'error');
    }
  };

  const handleDownloadExport = () => {
    const blob = new Blob([exportData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentProject?.name.replace(/\s+/g, '_') || 'project'}_export.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const handleImport = async () => {
    if (!importData.trim()) return;
    setIsLoading(true);
    setImportError('');
    try {
      const success = await onImportFromTeam(importData);
      if (success) {
        setImportData('');
        addToast('Project imported successfully', 'success');
      } else {
        setImportError('Failed to import. Check the data format.');
      }
    } catch {
      setImportError('Invalid import data');
    } finally {
      setIsLoading(false);
    }
  };

  const tabs = [
    { id: 'share', label: 'Share', icon: '🔗' },
    { id: 'collaborate', label: 'Export/Import', icon: '📦' },
  ];

  return (
    <Accordion
      icon="👥"
      title="Team Features"
      subtitle={teamMembers.length > 0 ? `${teamMembers.length} members` : 'Share & collaborate'}
      badge={teamMembers.length > 0 ? teamMembers.length : undefined}
    >
      <GlassCard className="p-4 space-y-4">
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

        <TabPanel tabId="share" activeTab={activeTab}>
          <div className="space-y-4">
            {currentProject ? (
              <>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Sharing: <span className="text-indigo-600 dark:text-indigo-400">{currentProject.name}</span></p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={emails}
                      onChange={e => setEmails(e.target.value)}
                      placeholder="email1@..., email2@..."
                      aria-label="Email addresses to share with"
                      className="flex-1 px-3 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 focus:border-indigo-500/50"
                    />
                    <select
                      value={shareRole}
                      onChange={e => setShareRole(e.target.value as 'editor' | 'viewer')}
                      aria-label="Share role"
                      className="px-3 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-sm text-gray-800 dark:text-gray-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                    >
                      <option value="viewer">View</option>
                      <option value="editor">Edit</option>
                    </select>
                  </div>
                </div>
                <button
                  onClick={handleShare}
                  disabled={!emails.trim() || isLoading}
                  className="w-full px-4 py-2 bg-indigo-100 dark:bg-indigo-500/30 text-indigo-700 dark:text-indigo-300 rounded-lg text-sm hover:bg-indigo-200 dark:hover:bg-indigo-500/50 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                >
                  {isLoading ? 'Sharing...' : 'Share Project'}
                </button>

                {teamMembers.length > 0 && (
                  <div className="border-t border-white/10 pt-4">
                    <p className="text-xs text-gray-400 mb-2">Team Members</p>
                    <div className="space-y-2">
                      {teamMembers.map(member => (
                        <div key={member.id} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-indigo-500/30 rounded-full flex items-center justify-center text-sm text-indigo-300">
                              {member.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm text-gray-200">{member.name}</p>
                              <p className="text-xs text-gray-500">{member.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 text-xs rounded-sm ${
                              member.role === 'owner' ? 'bg-amber-500/20 text-amber-400' :
                              member.role === 'editor' ? 'bg-blue-500/20 text-blue-400' :
                              'bg-gray-500/20 text-gray-400'
                            }`}>
                              {member.role}
                            </span>
                            {member.role !== 'owner' && onRemoveMember && (
                              <button
                                onClick={() => onRemoveMember(member.id)}
                                className="p-1 text-gray-500 hover:text-red-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
                                aria-label={`Remove ${member.name}`}
                              >
                                ×
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">
                Select a project to share
              </p>
            )}
          </div>
        </TabPanel>

        <TabPanel tabId="collaborate" activeTab={activeTab}>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-400">Export Project</p>
                {currentProject && (
                  <button
                    onClick={handleExport}
                    className="text-xs text-indigo-400 hover:text-indigo-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                  >
                    Generate
                  </button>
                )}
              </div>
              {exportData ? (
                <div className="space-y-2">
                  <textarea
                    value={exportData}
                    readOnly
                    aria-label="Exported project data"
                    className="w-full h-24 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-gray-400 resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleCopyExport}
                      className="flex-1 px-3 py-1.5 text-xs bg-white/5 text-gray-300 rounded-lg hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                    >
                      Copy
                    </button>
                    <button
                      onClick={handleDownloadExport}
                      className="flex-1 px-3 py-1.5 text-xs bg-indigo-500/30 text-indigo-300 rounded-lg hover:bg-indigo-500/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                    >
                      Download
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-500 py-2">
                  {currentProject ? 'Click "Generate" to export' : 'Select a project to export'}
                </p>
              )}
            </div>

            <div className="border-t border-white/10 pt-4">
              <p className="text-xs text-gray-400 mb-2">Import Project</p>
              <textarea
                value={importData}
                onChange={e => { setImportData(e.target.value); setImportError(''); }}
                placeholder="Paste exported project data..."
                aria-label="Import project data"
                className="w-full h-24 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-gray-200 placeholder-gray-500 resize-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 focus:border-indigo-500/50"
              />
              {importError && (
                <p className="text-xs text-red-400 mt-1" role="alert">{importError}</p>
              )}
              <button
                onClick={handleImport}
                disabled={!importData.trim() || isLoading}
                className="w-full mt-2 px-4 py-2 bg-emerald-500/30 text-emerald-300 rounded-lg text-sm hover:bg-emerald-500/50 transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
              >
                {isLoading ? 'Importing...' : 'Import Project'}
              </button>
            </div>
          </div>
        </TabPanel>
      </GlassCard>
    </Accordion>
  );
});
