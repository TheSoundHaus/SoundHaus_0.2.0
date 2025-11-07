# The SoundHaus Design Overview

This document is for the developers of SoundHaus to use as a go-to reference guide for everything from overall structure to specific API calls. It can also be used by AI agents as context to improve their ability to contribute to the codebase.

This document contains the following sections:

- [Overall Design](#overall-design)
- [API Calls](#api-calls)
- [File Structure Overview](#file-structure-overview)
- [Instructions for AI](#instructions-for-ai)


## Overall Design

SoundHaus is comprised of three apps tied together by an API and hosted within a monorepo. These three apps are the [desktop application](#desktop-application), the [web application](#web-application), and the [backend](#backend), and can be found in the `/apps/` directory at the root of the SoundHaus repo.  

### Desktop Application 
Located at `/apps/desktop/`

The desktop application is the entry point for the day-to-day user experience. The user will launch our desktop app alongside Ableton when they are ready to engage in asynchronous file sharing. It will allow them to locally modify their git-ified
Ableton projects and push them to the cloud. It will also allow them to pull remote changes to their local environment. 

**What follows is a brief technical overview of the technologies used in the SoundHaus desktop application:**

 - Built on Electron
	 - To make the app as cross-platform as possible
	 - To take advantage of the huge npm library of extensions
 - Built with React.js
	 - To allow for reactive content 
	 - Familiar to the developers
	 - Enables modularity and constancy with the web application 
 - Uses ZLib
	 - To take advantage of ZLib's built in gzip functionality, which converts .als files to .xml files
 - Packaged with Git binaires
	 - The app can rely on it's own git, and not have to rely on the user already having it

### Web Application 
Located at `/apps/web/`

The web application is the user's landing point when exploring SoundHaus for the first time. It acts as the outlet for all of the data stored in the backend. It also acts as the social and discovery portion of SoundHaus. 

**What follows is a brief technical overview of the technologies used in the SoundHaus desktop application:**

- Built with React.js
	- To allow for reactive content
	- Familiar to developers
	- Enables modularity and consistency with the desktop application
- Routed with Next.js
	- Enables simple and modular API calls
	- Familiar to the developers
- Consists of the following pages:
	- Home page: Mission statement, links to everything else, tutorial/overview of SoundHaus
	- Explore page: Look through other user's public repositories (sorted view, ranked view, etc.)
	- Personal Repositories page: Manage and view personal remote repositories
	- User settings page: Contains general user settings as well as statistics about the signed-in user
	- Authentication pages: Login, forgot credentials, new user, etc.
	- Repository View page: Displays information about a selected repository

### Backend
Located at  `/apps/backend/`

The backend is a two-tiered application that exists across two cloud providers: Supabase and Digital Ocean. Supabase acts as the repository for all user information and handles authentication tasks, while Digital Ocean hosts our own git services, as well as large file storage. 

**What follows is a brief technical overview of the technologies used in the SoundHaus desktop application:**

- Supabase
	- Built in authentication and account management operations
	- Integration with PostgreSQL
	- Stores user information
		- Name / Username
		- Email
		- Git credentials
		- References to git repositories
- Digital Ocean
	- Cheap large file storage for audio files
	- Hosts Gitea git server
- Gitea
	- Self-hosted GitHub-like service that manages remote repositories
	- Lives within Digital Ocean
	- Takes advantage of gitLFS for managing large audio files
- FastAPI
	- Manages data flow between (Supabase) and (the desktop and web applications)
	- Manages data flow between Supabase and the Gitea instance
- Docker
	- Containerize Gitea for easy development and deploymen
- Uvicorn
	- Run FastAPI asynchronously
- 
## API Calls

You'll notice that the Desktop Application and Web Application portions are filled in, despite neither of them being servers. That is because this table is meant to act as a helpful abstraction rather than a literal translation of reality. In reality, nearly every call will be hosted as a route by the FastAPI in the backend and will be called by the other applications. The only exceptions to this rule are the Desktop Application's git endpoints. These are handled by git using its existing push, pull, clone, commit, etc, functionality. 

### Desktop Application API

Important to note about these API endpoints is that many of them are handled by git itself. This means that you **do not** have to pass data directly through the API endpoint when denoted. **Pay careful attention to this.**  They are listed as API endpoints because they handle data flow, even though they use a different route.

| API Call |  To | Data Passed In | Data Received[^1] | Description |
|--|--|--|--|--|
| Clone Repository[^2] | Backend | HTTPS Link to Gitea repository | SoundHaus Repository | Called when the user intends to access a remote repository that they ***don't*** already have locally installed. *Uses git as proxy*|
| Pull[^2] | Backend | Ref to remote repo | Updated repo | Called when user wants to update their current working project. *Uses git as proxy* |
| Push[^2] | Backend | Updates to repo | None | Called when a user want to sync their local project changes to the cloud. Acts as both a commit and push. *Uses git as proxy* |
| Login | Backend | Username + Password | Session Token | Called when the Login button is pressed.  |
| Logout | Backend | None | None | Called when the logout button is pressed. Triggers a revocation of the session token in the backend. |
| Delete Remote | Backend | HTTPS Link to Gitea repository | None | Called after delete remote and "are you sure" buttons are pressed. Triggers an erasure of a specified SoundHaus repo stored in Digital Ocean |


### Web Application API

**A note on repository overviews.** Repository overviews contain only the essential information needed to gain a preliminary understanding of a SoundHaus project. They must be small enough to quickly load many at a time. The implementation of these is left to the developers.

| API Call |  To | Data Passed In | Data Received[^1] | Description |
|--|--|--|--|--|
| Login | Backend | Username + Password | Session Token | Called when the login button is pressed. |
| Logout | Backend | None | None | Called when the logout button is pressed. Triggers a revocation of the session token in the backend. |
| User CRUD Operations | Backend | Self Explanatory | Self Explanatory | Self Explanatory |
| Repository CRUD Operations | Backend | Self Explanatory | Self Explanatory | Self Explanatory |
| Get Top *N* Repos | Backend | An integer *N* | Array of top *N* SoundHaus repo overviews globally | Called when the user opens the Explore Page. |
| Get personal repos | Backend | An integer *N* | Array of *N* personal SoundHaus repos | Called when the user opens the Personal Repositories Page. |
| Invite Collaborator | Backend | Repo ID + Target UserID + Selected Permissions | Updated collaborator list | Called when adding a collaborator to a repo. Grants read/write access depending on selected permissions. |
| Clone Repository | Backend + Desktop Client | Repo ID | None | Backend fetches repo URL from Gitea, then triggers Desktop Client to open and clone the repo locally. |
| Desktop Authentication Link | Backend | Device Identifier | Desktop Auth Token | Called when "open desktop app" or similar button is pressed. Links the logged-in account to the desktop app without requiring login. |
| Get Commit History | Backend | Repo ID | Array of commit objects (hash, author, timestamp, message) | Called when loading commit history in the repository view. Use to display version history. |
| Fetch Audio Files | Backend | Repo ID | Array of audio files and their metadata | Called when loading the repository view. |


### Backend API

These API endpoints are designed as part of FastAPI and coordinate communication between the Digital Ocean and Supabase services. For brevity, if the "To" field says Digital Ocean, assume the request is coming from Supabase, and vice versa. 

| API Call |  To | Data Passed In | Data Received[^1] | Description |
|--|--|--|--|--|
| 

[^1]: Assume an error code is always returned, even when Data Received says "None"
[^2]: No data is passed through the API call itself, but data is still transmitted and handled by the git binary. This doesn't need to be configured in the backend. 


## File Structure Overview

The purpose of this section is not to act as an exhaustive diagram of the file structure. That is the job of structure.txt, which is located in the root of the project. 

Development of SoundHaus takes place in a monorepo, where all apps are siloed into their own directories, sharing only a few common files outside. That file structure should follow this guide:

```
SoundHouse/
├─ apps/
│  ├─ desktop/
│  │  ├─ electron/
│  │  │  ├─ main.js
│  │  │  ├─ preload.js
│  │  ├─ src/
│  │  ├─ git-binaries/
│  ├─ web/
│  │  ├─ src/
│  ├─ backend/
│  │  ├─ fastapi/
│  │  │  ├─ app/
│  │  ├─ gitea/
├─ .env
├─ SOUNDHAUS.md
├─ README.md
├─ structure.txt
├─ package.json
├─ .gitignore
```

Much choice is left up to the developer, but abiding by these guidelnes will prevent the monorepo's functionality from becoming crossed and messy.

## Instructions for AI

- Use 4-space indentation, no trailing whitespace.
- Do not hardcode credentials or secrets.
- Load paths, ports, and credentials from .env files.
- Use graceful error handling (try/except, HTTPException).
- Respect the existing API structure
	- Do not create or use new API endpoints unless explicitly instructed to do so by the user
	- Always check the entire FastAPI structure before making any decisions regarding the API
- Respect the existing file structure
	- Always check the structure.txt file in the project root to find the most up to date file structure. If you notice a discrepancy, alert the user to rerun the ai-prep script
- Ensure that before you start coding, your task and scope are clear
	- If there is room for interpretation, clarify with the user what the exact scope is
	- Do not edit files or interfere with services beyond the scope of your task 
- Do not edit this document
- Use best practices regardless of the language
- Do not arbitrarily recommend tools or refactors that the user does not explicitly mention 
- Do not create or edit more than 2 files at a time unless the user instructs you which files to create or edit
- Refuse to do refactors of entire features
- Add comments that describe the functionality of any code that you write

