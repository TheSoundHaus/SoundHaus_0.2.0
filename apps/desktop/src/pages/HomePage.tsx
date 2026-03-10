import { useNavigate } from 'react-router-dom'
import { useElectronIPC } from '../hooks/useElectronIPC'

const HomePage = () => {
    const { chooseFolder, hasGitFile, initRepo, showProjectSetup, cloneRepo, showCloneUrl } = useElectronIPC()
    const navigate = useNavigate()

    const handleProjectClone = async () => {
        try {
            // Step 1: Show clone URL + path dialog
            const cloneData = await showCloneUrl();
            if (!cloneData) {
                // User cancelled the dialog
                return;
            }

            const cloneUrl = cloneData.url;
            const folder = cloneData.path;
            
            if (!cloneUrl.trim() || !folder.trim()) {
                alert('Please enter both repository URL and local path');
                return;
            }

            // Step 2: Perform the clone
            try {
                console.log('Cloning from:', cloneUrl);
                console.log('Cloning to:', folder);
                const clonedPath = await cloneRepo(cloneUrl, folder);
                alert(`Clone complete:\n${clonedPath}`);

                // Step 3: Verify .git folder was created in the cloned repo
                const git = await hasGitFile(clonedPath);
                if (git) {
                    // Step 4: Navigate to project page
                    navigate('/project', { state: { projectPath: clonedPath } });
                } else {
                    alert('Warning: .git folder not found. The clone may have failed.');
                }
            } catch (error) {
                alert(`Clone failed:\n${error}`);
            }
        } catch (error) {
            console.error('Error in handleProjectClone:', error);
            alert(`An error occurred:\n${error}`);
        }
    }

    const handleServerExplore = async () => {
        window.open("http://www.rickleinecker.com/", "_blank");
    }

    const handleAbletonImport = async () => {
        const folder = await chooseFolder();
        if(folder) {
            // Show project setup dialog
            const projectInfo = await showProjectSetup();
            
            if (!projectInfo) {
                // User cancelled the dialog
                return;
            }

            try {
                const result = await initRepo(folder, projectInfo);
                alert(`Init complete:\n${result}`)
            } catch(error) {
                alert(`Init failed:\n${error}`)
            }

            // Backup check
            const git = await hasGitFile(folder);
            if(git) {
                navigate('/project', {state: {projectPath: folder}});
            }
        }
    }

    const handleExistingProject = async () => {
        const folder = await chooseFolder();
        if(folder) {
            const git = await hasGitFile(folder);
            if(git) {
                navigate('/project', {state: {projectPath: folder}});
            }
        }
    }

    return(
        <div>
            <h1>Let's get started!</h1>
            <p>Add a SoundHaus project to get started</p>

            <div>
                <button onClick={handleProjectClone}>Clone Ableton Project</button>
                <button onClick={handleServerExplore}>Explore projects from server</button>
                <button onClick={handleAbletonImport}>Import Ableton project</button>
                <button onClick={handleExistingProject}>Open existing SoundHaus project</button>
            </div>
        </div>
    )
}

export default HomePage;