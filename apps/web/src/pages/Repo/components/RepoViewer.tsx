import { useEffect, useState } from 'react';
import './RepoViewer.css';
import './AbletonProjectView.css';
import AbletonProjectView from './AbletonProjectView';
import { findAbletonProjectFile, parseAbletonProject, type ProjectMetadata } from '../../../lib/utils/abletonParser';

interface RepoContent {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size?: number;
  download_url?: string;
  lfs?: boolean;
}

interface RepoViewerProps {
  repoName: string;
  onBack: () => void;
}

export default function RepoViewer({ repoName, onBack }: RepoViewerProps) {
  const [contents, setContents] = useState<RepoContent[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pathHistory, setPathHistory] = useState<string[]>([]);

  // Ableton project view states
  const [isAbletonProject, setIsAbletonProject] = useState(false);
  const [projectMetadata, setProjectMetadata] = useState<ProjectMetadata | null>(null);
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadContent, setUploadContent] = useState('');
  const [uploadMessage, setUploadMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deleteItem, setDeleteItem] = useState<RepoContent | null>(null);
  const [deleteMessage, setDeleteMessage] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [viewFile, setViewFile] = useState<RepoContent | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [loadingFile, setLoadingFile] = useState(false);
  
  // Watch feature states
  const [showWatchModal, setShowWatchModal] = useState(false);
  const [localPath, setLocalPath] = useState('');
  const [watchBranch, setWatchBranch] = useState('main');
  const [watchRepoPath, setWatchRepoPath] = useState('');
  const [createdSession, setCreatedSession] = useState<any>(null);
  const [loadingPreferences, setLoadingPreferences] = useState(false);
  
  // Collaborator feature states
  const [showCollaboratorsModal, setShowCollaboratorsModal] = useState(false);
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePermission, setInvitePermission] = useState('write');
  const [loadingCollaborators, setLoadingCollaborators] = useState(false);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  const fetchContents = async (path: string = '') => {
    const token = localStorage.getItem('access_token') || '';
    if (!token) {
      setError('No access token found. Please log in again.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const url = `${API_URL}/repos/${repoName}/contents${path ? `?path=${encodeURIComponent(path)}` : ''}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.detail || data.message || 'Failed to load contents');
      }

      // Ensure contents is always an array
      const contentArray = Array.isArray(data.contents) ? data.contents : [data.contents];
      setContents(contentArray);
      setCurrentPath(path);
    } catch (e) {
      console.error('[RepoViewer] fetchContents error:', e);
      setError(e instanceof Error ? e.message : 'Failed to load contents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContents();
    loadRepoPreferences();
    checkIfAbletonProject();
  }, []);

  const checkIfAbletonProject = async () => {
    const token = localStorage.getItem('access_token') || '';
    if (!token) return;

    try {
      const alsFilePath = await findAbletonProjectFileRecursive('', token);
      if (alsFilePath) {
        setIsAbletonProject(true);
        // Metadata parsing disabled - create minimal metadata to show Ableton view
        setProjectMetadata({
          name: repoName,
          bpm: 0,
          key: '',
          moodTags: [],
          tracks: [],
          description: ''
        });
      }
    } catch (e) {
      console.error('[RepoViewer] Error checking for Ableton project:', e);
    }
  };

  const findAbletonProjectFileRecursive = async (path: string, token: string): Promise<string | null> => {
    try {
      const url = `${API_URL}/repos/${repoName}/contents${path ? `?path=${encodeURIComponent(path)}` : ''}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!data.success) return null;

      const contentArray = Array.isArray(data.contents) ? data.contents : [data.contents];

      // First, check if there's an .als file in the current directory
      const alsFile = findAbletonProjectFile(contentArray);
      if (alsFile) {
        // Return the full path (combining current path with filename)
        return path ? `${path}/${alsFile}` : alsFile;
      }

      // If no .als file found, recursively search subdirectories
      const directories = contentArray.filter((item: RepoContent) => item.type === 'dir');
      for (const dir of directories) {
        const dirPath = path ? `${path}/${dir.name}` : dir.name;
        const result = await findAbletonProjectFileRecursive(dirPath, token);
        if (result) {
          return result;
        }
      }

      return null;
    } catch (e) {
      console.error('[RepoViewer] Error searching directory:', path, e);
      return null;
    }
  };

  const loadProjectMetadata = async (alsFileName: string) => {
    const token = localStorage.getItem('access_token') || '';
    if (!token) return;

    setLoadingMetadata(true);
    try {
      // Check cache first (10 min TTL)
      const cacheKey = `ableton_metadata_${repoName}_${alsFileName}`;
      const cached = localStorage.getItem(cacheKey);

      if (cached) {
        try {
          const { metadata, timestamp } = JSON.parse(cached);
          const age = Date.now() - timestamp;
          const TEN_MINUTES = 10 * 60 * 1000;

          if (age < TEN_MINUTES) {
            console.log('[RepoViewer] Using cached metadata, age:', Math.round(age / 1000), 'seconds');
            setProjectMetadata(metadata);
            setLoadingMetadata(false);
            return;
          } else {
            console.log('[RepoViewer] Cache expired, fetching fresh data');
          }
        } catch (parseError) {
          console.warn('[RepoViewer] Failed to parse cached metadata:', parseError);
        }
      }

      console.log('[RepoViewer] Fetching .als file:', alsFileName);
      // Fetch the .als file content
      const url = `${API_URL}/repos/${repoName}/contents?path=${encodeURIComponent(alsFileName)}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      console.log('[RepoViewer] API response:', {
        success: data.success,
        hasContent: !!data.contents?.content,
        contentLength: data.contents?.content?.length,
        contentType: typeof data.contents?.content,
        encoding: data.contents?.encoding,
      });

      if (data.success && data.contents.content) {
        // Parse the Ableton project
        const metadata = await parseAbletonProject(data.contents.content, repoName);
        setProjectMetadata(metadata);

        // Cache the metadata with timestamp
        try {
          localStorage.setItem(cacheKey, JSON.stringify({
            metadata,
            timestamp: Date.now()
          }));
          console.log('[RepoViewer] Metadata cached successfully');
        } catch (cacheError) {
          console.warn('[RepoViewer] Failed to cache metadata:', cacheError);
        }
      } else {
        console.error('[RepoViewer] No content in API response');
      }
    } catch (e) {
      console.error('[RepoViewer] Error loading project metadata:', e);
    } finally {
      setLoadingMetadata(false);
    }
  };

  const loadRepoPreferences = async () => {
    const token = localStorage.getItem('access_token') || '';
    if (!token) return;

    setLoadingPreferences(true);
    try {
      const res = await fetch(`${API_URL}/repos/${repoName}/preferences`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && data.preferences) {
        setLocalPath(data.preferences.local_path || '');
      }
    } catch (e) {
      console.error('[RepoViewer] Failed to load preferences:', e);
    } finally {
      setLoadingPreferences(false);
    }
  };

  const saveRepoPreferences = async (path: string) => {
    const token = localStorage.getItem('access_token') || '';
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/repos/${repoName}/preferences`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          repo_name: repoName,
          local_path: path,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error('Failed to save preferences');
      }
    } catch (e) {
      console.error('[RepoViewer] Failed to save preferences:', e);
      alert('Failed to save folder path');
    }
  };

  const startWatchSession = async () => {
    if (!localPath) {
      setError('Please enter a local folder path');
      return;
    }

    const token = localStorage.getItem('access_token') || '';
    if (!token) {
      setError('No access token found. Please log in again.');
      return;
    }

    try {
      // Save preferences
      await saveRepoPreferences(localPath);

      // Create watch session
      const res = await fetch(`${API_URL}/watch/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          repo_name: repoName,
          branch: watchBranch,
          repo_path: watchRepoPath,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.detail || data.message || 'Failed to start watch session');
      }

      setCreatedSession({
        ...data,
        local_path: localPath,
      });
      setShowWatchModal(true);
    } catch (e) {
      console.error('[RepoViewer] startWatchSession error:', e);
      setError(e instanceof Error ? e.message : 'Failed to start watch session');
    }
  };

  const downloadScript = async (scriptType: 'bat' | 'ps1' | 'sh') => {
    if (!createdSession || !createdSession.local_path) return;

    const token = localStorage.getItem('access_token') || '';
    const url = `${API_URL}/watch/download-script/${createdSession.watch_id}?local_path=${encodeURIComponent(createdSession.local_path)}&script_type=${scriptType}`;

    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error('Failed to download script');
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = scriptType === 'bat' ? 'soundhaus_watcher.bat' : scriptType === 'ps1' ? 'soundhaus_watcher.ps1' : 'soundhaus_watcher.sh';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (e) {
      console.error('[RepoViewer] downloadScript error:', e);
      alert(e instanceof Error ? e.message : 'Failed to download script');
    }
  };

  const closeWatchModal = () => {
    setShowWatchModal(false);
    setCreatedSession(null);
  };

  // Collaborator functions
  const fetchCollaborators = async () => {
    setLoadingCollaborators(true);
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return;

      const response = await fetch(
        `${API_URL}/repos/${repoName}/collaborators`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const data = await response.json();
      if (data.success) {
        setCollaborators(data.collaborators || []);
      }
    } catch (err) {
      console.error('[RepoViewer] fetchCollaborators error:', err);
    } finally {
      setLoadingCollaborators(false);
    }
  };

  const inviteCollaborator = async () => {
    if (!inviteEmail) {
      alert('Please enter an email address');
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      if (!token) return;

      const response = await fetch(
        `${API_URL}/repos/${repoName}/collaborators/invite`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            email: inviteEmail,
            permission: invitePermission,
          }),
        }
      );

      const data = await response.json();
      if (data.success) {
        alert(`Invitation sent to ${inviteEmail}`);
        setInviteEmail('');
        setInvitePermission('write');
      } else {
        alert(`Error: ${data.message}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const removeCollaborator = async (username: string) => {
    if (!confirm(`Remove ${username} as a collaborator?`)) return;

    try {
      const token = localStorage.getItem('access_token');
      if (!token) return;

      const response = await fetch(
        `${API_URL}/repos/${repoName}/collaborators/${username}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await response.json();
      if (data.success) {
        alert(`${username} removed`);
        fetchCollaborators(); // Refresh list
      } else {
        alert(`Error: ${data.message}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleItemClick = (item: RepoContent) => {
    if (item.type === 'dir') {
      setPathHistory([...pathHistory, currentPath]);
      fetchContents(item.path);
    }
  };

  const handleItemDoubleClick = async (item: RepoContent) => {
    if (item.type === 'file') {
      // Fetch and display file content in modal
      setViewFile(item);
      setLoadingFile(true);
      setFileContent('');
      
      try {
        const token = localStorage.getItem('access_token') || '';
        const url = `${API_URL}/repos/${repoName}/contents?path=${encodeURIComponent(item.path)}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to load file content');
        }

        // Decode base64 content if present
        if (data.contents.content) {
          const decoded = atob(data.contents.content);
          setFileContent(decoded);
        } else {
          setFileContent('(Binary file or empty)');
        }
      } catch (e) {
        console.error('[RepoViewer] fetch file content error:', e);
        setFileContent(`Error loading file: ${e instanceof Error ? e.message : 'Unknown error'}`);
      } finally {
        setLoadingFile(false);
      }
    } else if (item.type === 'dir') {
      // Navigate into directory on double-click
      setPathHistory([...pathHistory, currentPath]);
      fetchContents(item.path);
    }
  };

  const handleBack = () => {
    if (pathHistory.length > 0) {
      const newHistory = [...pathHistory];
      const previousPath = newHistory.pop()!;
      setPathHistory(newHistory);
      fetchContents(previousPath);
    } else {
      onBack();
    }
  };

  const handleFileDelete = async () => {
    if (!deleteItem) return;

    const token = localStorage.getItem('access_token') || '';
    if (!token) {
      setError('No access token found. Please log in again.');
      return;
    }

    setDeleting(true);
    setError('');

    try {
      const commitMessage = deleteMessage.trim() || `Delete ${deleteItem.name}`;

      const res = await fetch(`${API_URL}/repos/${repoName}/contents?file_path=${encodeURIComponent(deleteItem.path)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: commitMessage,
          branch: 'main',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.detail || data.message || 'Failed to delete file');
      }

      // Clear delete state and refresh contents
      setDeleteItem(null);
      setDeleteMessage('');
      await fetchContents(currentPath);
    } catch (e) {
      console.error('[RepoViewer] delete error:', e);
      setError(e instanceof Error ? e.message : 'Failed to delete file');
    } finally {
      setDeleting(false);
    }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('access_token') || '';
    if (!token) {
      setError('No access token found. Please log in again.');
      return;
    }

    if (!uploadFileName.trim()) {
      setError('Please enter a file name');
      return;
    }

    if (!uploadContent.trim()) {
      setError('Please enter file content');
      return;
    }

    setUploading(true);
    setError('');

    try {
      // Construct the full file path
      const filePath = currentPath ? `${currentPath}/${uploadFileName}` : uploadFileName;
      const commitMessage = uploadMessage.trim() || `Add ${uploadFileName}`;

      const res = await fetch(`${API_URL}/repos/${repoName}/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_path: filePath,
          content: uploadContent,
          message: commitMessage,
          branch: 'main',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.detail || data.message || 'Failed to upload file');
      }

      // Clear form and refresh contents
      setUploadFileName('');
      setUploadContent('');
      setUploadMessage('');
      setShowUpload(false);
      await fetchContents(currentPath);
    } catch (e) {
      console.error('[RepoViewer] upload error:', e);
      setError(e instanceof Error ? e.message : 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadFileName(file.name);

    // Read file content
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      setUploadContent(content);
    };
    reader.readAsText(file);
  };

  const handleFolderInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setError('');
    const token = localStorage.getItem('access_token') || '';

    try {
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const reader = new FileReader();

        await new Promise((resolve, reject) => {
          reader.onload = async (evt) => {
            try {
              const content = evt.target?.result as string;
              // Use webkitRelativePath to get the full path including folders
              const relativePath = (file as any).webkitRelativePath || file.name;
              const filePath = currentPath ? `${currentPath}/${relativePath}` : relativePath;
              const commitMessage = `Add ${file.name}`;

              const res = await fetch(`${API_URL}/repos/${repoName}/upload`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  file_path: filePath,
                  content: content,
                  message: commitMessage,
                  branch: 'main',
                }),
              });

              const data = await res.json();
              if (res.ok && data.success) {
                successCount++;
              } else {
                failCount++;
              }
              resolve(null);
            } catch (err) {
              failCount++;
              resolve(null);
            }
          };
          reader.onerror = () => {
            failCount++;
            reject(new Error(`Failed to read ${file.name}`));
          };
          reader.readAsText(file);
        });
      }

      if (successCount > 0) {
        setShowUpload(false);
        await fetchContents(currentPath);
      }

      if (failCount > 0) {
        setError(`Uploaded ${successCount} files, ${failCount} failed`);
      }
    } catch (e) {
      console.error('[RepoViewer] folder upload error:', e);
      setError(e instanceof Error ? e.message : 'Failed to upload folder');
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (item: RepoContent) => {
    if (item.type === 'dir') return '📁';
    const ext = item.name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'js':
      case 'jsx':
      case 'ts':
      case 'tsx':
        return '📜';
      case 'json':
        return '📋';
      case 'md':
        return '📝';
      case 'css':
      case 'scss':
        return '🎨';
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'svg':
        return '🖼️';
      default:
        return '📄';
    }
  };

  // Show creative Ableton view if it's an Ableton project
  if (isAbletonProject && projectMetadata && !loadingMetadata) {
    return (
      <AbletonProjectView
        repoName={repoName}
        metadata={projectMetadata}
        repoContents={contents}
        onBack={handleBack}
        // Watch folder props
        localPath={localPath}
        setLocalPath={setLocalPath}
        watchBranch={watchBranch}
        setWatchBranch={setWatchBranch}
        watchRepoPath={watchRepoPath}
        setWatchRepoPath={setWatchRepoPath}
        loadingPreferences={loadingPreferences}
        startWatchSession={startWatchSession}
        showWatchModal={showWatchModal}
        createdSession={createdSession}
        closeWatchModal={closeWatchModal}
        downloadScript={downloadScript}
        // Collaborators props
        showCollaboratorsModal={showCollaboratorsModal}
        setShowCollaboratorsModal={setShowCollaboratorsModal}
        collaborators={collaborators}
        loadingCollaborators={loadingCollaborators}
        fetchCollaborators={fetchCollaborators}
        inviteEmail={inviteEmail}
        setInviteEmail={setInviteEmail}
        invitePermission={invitePermission}
        setInvitePermission={setInvitePermission}
        inviteCollaborator={inviteCollaborator}
        removeCollaborator={removeCollaborator}
        // Upload props
        showUpload={showUpload}
        setShowUpload={setShowUpload}
        uploadFileName={uploadFileName}
        uploadMessage={uploadMessage}
        uploadContent={uploadContent}
        uploading={uploading}
        handleFileInputChange={handleFileInputChange}
        handleFolderInputChange={handleFolderInputChange}
        handleFileUpload={handleFileUpload}
        setUploadFileName={setUploadFileName}
        setUploadMessage={setUploadMessage}
        setUploadContent={setUploadContent}
      />
    );
  }

  // Show loading state while checking for Ableton project
  if (loadingMetadata) {
    return (
      <div className="repo-viewer">
        <div className="loading-message">Loading project metadata...</div>
      </div>
    );
  }

  return (
    <div className="repo-viewer ableton-project-view">
      {/* Header */}
      <header className="project-header">
        <div>
          <h1>{repoName}</h1>
          <p>Project</p>
        </div>
      </header>

      {error && <div className="error-message">{error}</div>}

      {/* Watch Folder Settings */}
      <div id="watch-settings" style={{ 
        display: 'none', 
        padding: '1.5rem', 
        background: '#2d2d2d', 
        border: '1px solid #404040',
        borderRadius: '8px', 
        marginBottom: '1rem',
        position: 'relative'
      }}>
        <button
          onClick={() => {
            const watchSettings = document.getElementById('watch-settings');
            if (watchSettings) {
              watchSettings.style.display = 'none';
            }
          }}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'transparent',
            border: 'none',
            color: '#999',
            fontSize: '1.5rem',
            cursor: 'pointer',
            padding: '0',
            lineHeight: 1
          }}
          title="Close"
        >
          ✕
        </button>
        
        <h3 style={{ marginTop: 0, color: '#e5e5e5' }}>Folder Watch Settings</h3>
        <p style={{ color: '#999', fontSize: '0.9rem' }}>
          Set up automatic syncing for this project. Your folder path will be saved for next time.
        </p>
        
        <div className="form-group" style={{ marginBottom: '1rem' }}>
          <label htmlFor="local-path" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: '#e5e5e5' }}>
            Local Folder Path {localPath && '✅'}
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              id="local-path"
              type="text"
              value={localPath}
              onChange={(e) => setLocalPath(e.target.value)}
              placeholder="C:\Users\YourName\Music\MyProject"
              style={{ 
                flex: 1, 
                fontFamily: 'monospace', 
                fontSize: '0.9rem', 
                padding: '0.5rem',
                background: '#1a1a1a',
                border: '1px solid #404040',
                color: '#e5e5e5',
                borderRadius: '4px'
              }}
            />
            <button
              onClick={async () => {
                try {
                  // @ts-ignore
                  const dirHandle = await window.showDirectoryPicker();
                  alert(`Selected: ${dirHandle.name}\n\nCopy the full path and paste it in the field.`);
                } catch (e) {
                  if (e instanceof Error && e.name !== 'AbortError') {
                    alert('Folder picker not supported. Please type the path manually.');
                  }
                }
              }}
              style={{ 
                padding: '0.5rem 1rem', 
                whiteSpace: 'nowrap',
                background: '#404040',
                border: '1px solid #555',
                color: '#e5e5e5',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Browse...
            </button>
          </div>
          <small style={{ color: '#999' }}>This path will be saved for this project</small>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label htmlFor="watch-branch" style={{ color: '#e5e5e5' }}>Branch</label>
            <input
              id="watch-branch"
              type="text"
              value={watchBranch}
              onChange={(e) => setWatchBranch(e.target.value)}
              placeholder="main"
              style={{ 
                width: '100%',
                background: '#1a1a1a',
                border: '1px solid #404040',
                color: '#e5e5e5',
                padding: '0.5rem',
                borderRadius: '4px'
              }}
            />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label htmlFor="watch-repo-path" style={{ color: '#e5e5e5' }}>Project Path (optional)</label>
            <input
              id="watch-repo-path"
              type="text"
              value={watchRepoPath}
              onChange={(e) => setWatchRepoPath(e.target.value)}
              placeholder="e.g., projects/2025"
              style={{ 
                width: '100%',
                background: '#1a1a1a',
                border: '1px solid #404040',
                color: '#e5e5e5',
                padding: '0.5rem',
                borderRadius: '4px'
              }}
            />
          </div>
        </div>

        <button
          onClick={startWatchSession}
          disabled={!localPath || loadingPreferences}
          className="watch-button"
          style={{
            background: localPath ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : '#555',
            color: 'white',
            padding: '0.75rem 1.5rem',
            border: 'none',
            borderRadius: '6px',
            fontSize: '1rem',
            fontWeight: '600',
            cursor: localPath ? 'pointer' : 'not-allowed',
          }}
        >
          {loadingPreferences ? 'Loading...' : 'Start Watching'}
        </button>
      </div>

      {showUpload && (
        <>
          <div className="repo-modal-overlay" onClick={() => setShowUpload(false)} />
          <div className="upload-modal">
            <div className="modal-header">
              <h3>Upload Files</h3>
              <button 
                type="button" 
                onClick={() => setShowUpload(false)} 
                className="modal-close"
              >
                ✕
              </button>
            </div>
            <div className="modal-content">
              <div className="upload-options">
                <div className="upload-option">
                  <h4>Upload Single File</h4>
                  <p>Choose a file from your computer to upload</p>
                  <input
                    id="file-input"
                    type="file"
                    onChange={handleFileInputChange}
                    className="file-input-button"
                  />
                </div>
                <div className="upload-option">
                  <h4>Upload Folder</h4>
                  <p>Upload an entire folder with all its files</p>
                  <input
                    id="folder-input"
                    type="file"
                    onChange={handleFolderInputChange}
                    className="file-input-button"
                    {...{ webkitdirectory: "", directory: "" } as any}
                    multiple
                  />
                </div>
              </div>

              {uploadFileName && (
                <form onSubmit={handleFileUpload} className="upload-form">
                  <div className="upload-controls">
                    <div className="form-group">
                      <label htmlFor="file-name">File Name</label>
                      <input
                        id="file-name"
                        type="text"
                        value={uploadFileName}
                        onChange={(e) => setUploadFileName(e.target.value)}
                        placeholder="example.txt"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="commit-message">Commit Message</label>
                      <input
                        id="commit-message"
                        type="text"
                        value={uploadMessage}
                        onChange={(e) => setUploadMessage(e.target.value)}
                        placeholder="Add new file"
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="file-content">Content Preview</label>
                      <textarea
                        id="file-content"
                        value={uploadContent}
                        onChange={(e) => setUploadContent(e.target.value)}
                        placeholder="File content will appear here..."
                        rows={12}
                        required
                      />
                    </div>
                  </div>
                  <button type="submit" disabled={uploading} className="upload-submit-button">
                    {uploading ? 'Uploading...' : 'Upload File'}
                  </button>
                </form>
              )}

              {uploading && !uploadFileName && (
                <div className="uploading-message">
                  <p>Uploading files... Please wait.</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {deleteItem && (
        <>
          <div className="repo-modal-overlay" onClick={() => setDeleteItem(null)} />
          <div className="delete-modal">
            <div className="modal-header">
              <h3>Delete {deleteItem.type === 'dir' ? 'Folder' : 'File'}</h3>
              <button 
                type="button" 
                onClick={() => setDeleteItem(null)} 
                className="modal-close"
              >
                ✕
              </button>
            </div>
            <div className="modal-content">
              <p>Are you sure you want to delete <strong>{deleteItem.name}</strong>?</p>
              <p className="delete-warning">This action cannot be undone.</p>
              <form onSubmit={(e) => { e.preventDefault(); handleFileDelete(); }}>
                <div className="form-group">
                  <label htmlFor="delete-message">Commit Message</label>
                  <input
                    id="delete-message"
                    type="text"
                    value={deleteMessage}
                    onChange={(e) => setDeleteMessage(e.target.value)}
                    placeholder={`Delete ${deleteItem.name}`}
                  />
                </div>
                <div className="delete-actions">
                  <button 
                    type="button" 
                    onClick={() => setDeleteItem(null)} 
                    className="cancel-button"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={deleting} 
                    className="delete-confirm-button"
                  >
                    {deleting ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

      {viewFile && (
        <>
          <div className="repo-modal-overlay" onClick={() => setViewFile(null)} />
          <div className="upload-modal" style={{ maxWidth: '900px', maxHeight: '80vh' }}>
            <div className="modal-header">
              <h3>{viewFile.name}</h3>
              <button 
                type="button" 
                onClick={() => setViewFile(null)} 
                className="modal-close"
              >
                ✕
              </button>
            </div>
            <div className="modal-content">
              {loadingFile ? (
                <div className="uploading-message">
                  <p>Loading file content...</p>
                </div>
              ) : (
                <div style={{ 
                  background: '#1e1e1e', 
                  color: '#d4d4d4', 
                  padding: '1rem', 
                  borderRadius: '4px',
                  overflow: 'auto',
                  maxHeight: '60vh',
                  fontFamily: 'monospace',
                  fontSize: '0.9rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}>
                  {fileContent || '(Empty file)'}
                </div>
              )}
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                {viewFile.download_url && (
                  <a
                    href={viewFile.download_url}
                    download={viewFile.name}
                    className="action-button"
                    style={{ textDecoration: 'none' }}
                  >
                    Download
                  </a>
                )}
                <button 
                  onClick={() => setViewFile(null)} 
                  className="action-button"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Main Layout: Sidebar + Main Content */}
      <div className="project-layout">
        {/* Sidebar - File Tree */}
        <aside className="project-sidebar">
          <section className="sidebar-card glass-panel">
            <div className="sidebar-heading">
              <h2>Project Files</h2>
              <p>Browse project structure and contents</p>
            </div>
            {loading ? (
              <p className="loading-message">Loading contents...</p>
            ) : (
              <div className="file-tree" style={{ marginTop: '16px' }}>
                {contents.map((item) => {
                  // const isAbletonFile = item.name.toLowerCase().endsWith('.als') // Not currently used

                  return (
                    <div
                      key={item.path}
                      className="tree-item"
                      style={{ paddingLeft: '12px' }}
                    >
                      <div
                        className="tree-item-content"
                        onDoubleClick={() => handleItemDoubleClick(item)}
                        style={{ cursor: 'pointer' }}
                      >
                        <span className="tree-icon">{getFileIcon(item)}</span>
                        <span
                          className="tree-name"
                          onClick={() => handleItemClick(item)}
                        >
                          {item.name}
                        </span>
                        <span className="tree-size">{formatFileSize(item.size)}</span>
                        {item.lfs && item.type === 'file' && (
                          <span className="lfs-badge-small">LFS</span>
                        )}
                      </div>
                      {item.type === 'file' && (
                        <div className="tree-item-actions">
                          <button
                            className="tree-action-button download-button"
                            onClick={async (e) => {
                              e.stopPropagation()
                              try {
                                const token = localStorage.getItem('access_token') || ''
                                const url = `${API_URL}/repos/${repoName}/contents?path=${encodeURIComponent(item.path)}`
                                const response = await fetch(url, {
                                  headers: { Authorization: `Bearer ${token}` },
                                })

                                const data = await response.json()
                                if (!data.success || !data.contents?.content) {
                                  console.error('Failed to get file content:', data)
                                  return
                                }

                                // Decode base64 content and create blob
                                const binaryString = atob(data.contents.content)
                                const bytes = new Uint8Array(binaryString.length)
                                for (let i = 0; i < binaryString.length; i++) {
                                  bytes[i] = binaryString.charCodeAt(i)
                                }
                                const blob = new Blob([bytes])

                                // Trigger download
                                const downloadUrl = window.URL.createObjectURL(blob)
                                const a = document.createElement('a')
                                a.href = downloadUrl
                                a.download = item.name
                                document.body.appendChild(a)
                                a.click()
                                document.body.removeChild(a)
                                window.URL.revokeObjectURL(downloadUrl)
                              } catch (error) {
                                console.error('Failed to download file:', error)
                              }
                            }}
                            title="Download file"
                          >
                            ⬇
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
                {!contents.length && (
                  <p className="empty-tree">This folder is empty.</p>
                )}
              </div>
            )}
          </section>
        </aside>

        {/* Main Content - Action Cards */}
        <main className="project-main">
          {/* Open in Ableton Card - only show if .als file exists */}
          {contents.some(item => item.type === 'file' && item.name.toLowerCase().endsWith('.als')) && (
            <section className="action-card glass-panel clickable" onClick={async () => {
              const alsFile = contents.find(item => item.type === 'file' && item.name.toLowerCase().endsWith('.als'))
              if (alsFile) {
                try {
                  const token = localStorage.getItem('access_token') || ''
                  const url = `${API_URL}/repos/${repoName}/contents?path=${encodeURIComponent(alsFile.path)}`
                  const response = await fetch(url, {
                    headers: { Authorization: `Bearer ${token}` },
                  })

                  const data = await response.json()
                  if (!data.success || !data.contents?.content) {
                    console.error('Failed to get file content:', data)
                    return
                  }

                  // Decode base64 content and create blob
                  const binaryString = atob(data.contents.content)
                  const bytes = new Uint8Array(binaryString.length)
                  for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i)
                  }
                  const blob = new Blob([bytes])

                  // Trigger download
                  const downloadUrl = window.URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = downloadUrl
                  a.download = alsFile.name
                  document.body.appendChild(a)
                  a.click()
                  document.body.removeChild(a)
                  window.URL.revokeObjectURL(downloadUrl)
                } catch (error) {
                  console.error('Failed to download file:', error)
                }
              }
            }}>
              <div className="card-icon">🎵</div>
              <div className="card-content">
                <h3>Open in Ableton</h3>
                <p>Download and open the Ableton Live project file</p>
              </div>
              <div className="card-arrow">→</div>
            </section>
          )}

          {/* Watch Folder Card */}
          <section className="action-card glass-panel clickable" onClick={() => {
            setShowUpload(false);
            setShowWatchModal(false);
            const watchSettings = document.getElementById('watch-settings');
            if (watchSettings) {
              watchSettings.style.display = watchSettings.style.display === 'none' ? 'block' : 'none';
            }
          }}>
            <div className="card-icon">📁</div>
            <div className="card-content">
              <h3>Watch Folder</h3>
              <p>Set up automatic syncing for this project</p>
            </div>
            <div className="card-arrow">→</div>
          </section>

          {/* Collaborators Card */}
          <section className="action-card glass-panel clickable" onClick={() => {
            setShowCollaboratorsModal(true);
            fetchCollaborators();
          }}>
            <div className="card-icon">👥</div>
            <div className="card-content">
              <h3>Collaborators</h3>
              <p>Manage team access and permissions</p>
            </div>
            <div className="card-arrow">→</div>
          </section>

          {/* Upload File Card */}
          <section className="action-card glass-panel clickable" onClick={() => setShowUpload(!showUpload)}>
            <div className="card-icon">⬆️</div>
            <div className="card-content">
              <h3>Upload Files</h3>
              <p>Add new files or folders to this project</p>
            </div>
            <div className="card-arrow">→</div>
          </section>
        </main>
      </div>

      {showWatchModal && createdSession && (
        <>
          <div className="repo-modal-overlay" onClick={closeWatchModal} />
          <div className="upload-modal" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Download Watch Script</h3>
              <button 
                type="button" 
                onClick={closeWatchModal} 
                className="modal-close"
              >
                ✕
              </button>
            </div>
            <div className="modal-content">
              <div className="script-buttons" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <button
                  onClick={() => downloadScript('bat')}
                  style={{
                    background: 'linear-gradient(135deg, #a3e635 0%, #84cc16 100%)',
                    color: 'white',
                    padding: '1rem',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '1.1rem',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Download for Windows (.bat)
                </button>
                <button
                  onClick={() => downloadScript('ps1')}
                  style={{
                    background: 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)',
                    color: 'white',
                    padding: '1rem',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '1.1rem',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  PowerShell (.ps1)
                </button>
                <button
                  onClick={() => downloadScript('sh')}
                  style={{
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: 'white',
                    padding: '1rem',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '1.1rem',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Unix/Mac (.sh)
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Collaborators Modal */}
      {showCollaboratorsModal && (
        <>
          <div
            className="repo-modal-overlay"
            onClick={() => setShowCollaboratorsModal(false)}
          />
          <div className="upload-modal" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Manage Collaborators</h3>
              <button
                onClick={() => setShowCollaboratorsModal(false)}
                className="modal-close"
              >
                ✕
              </button>
            </div>

            <div className="modal-content">
              {/* Invite Section */}
              <div className="collaborator-section">
                <h4 className="section-title">
                  Invite Collaborator
                </h4>
                <div className="upload-controls">
                  <div className="form-group">
                    <label>Email Address</label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="collaborator@example.com"
                    />
                  </div>

                  <div className="form-group">
                    <label>Permission Level</label>
                    <select
                      value={invitePermission}
                      onChange={(e) => setInvitePermission(e.target.value)}
                      className="permission-select"
                    >
                      <option value="read">Read Only</option>
                      <option value="write">Read & Write</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>

                  <button
                    onClick={inviteCollaborator}
                    className="upload-submit-button"
                  >
                    Send Invitation
                  </button>
                </div>
              </div>

              {/* Current Collaborators */}
              <div className="collaborator-section">
                <h4 className="section-title">
                  Current Collaborators
                </h4>
                {loadingCollaborators ? (
                  <p className="loading-state">Loading...</p>
                ) : collaborators.length === 0 ? (
                  <p className="loading-state">
                    No collaborators yet
                  </p>
                ) : (
                  <div className="collaborator-list">
                    {collaborators.map((collab) => (
                      <div key={collab.login} className="collaborator-item">
                        <div>
                          <div className="collaborator-name">
                            {collab.login}
                          </div>
                          <div className="collaborator-role">
                            {collab.permissions?.admin
                              ? 'Admin'
                              : collab.permissions?.push
                              ? 'Write'
                              : 'Read'}
                          </div>
                        </div>
                        <button
                          onClick={() => removeCollaborator(collab.login)}
                          className="remove-button"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
