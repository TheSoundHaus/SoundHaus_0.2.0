# Claude Configuration - SoundHaus Web Application

## Directory Scope
This configuration applies to `/apps/web/` only - the React/Next.js frontend application.

## UI Development Rules

### MANDATORY: Frontend Agent Usage
**CRITICAL**: When working on ANY UI-related tasks, you MUST use the frontend-design agent.

#### What Qualifies as UI Work:
- Creating new React components
- Modifying existing component styling or layout
- Building new pages or routes
- Updating UI/UX interactions
- Styling changes (CSS, Tailwind, etc.)
- Form design and user input interfaces
- Visual feedback elements (loading states, animations, etc.)
- Responsive design implementations

#### How to Use Frontend Agent:
```
Use the Skill tool with command: "frontend-design:frontend-design"
```

#### When Frontend Agent is NOT Required:
- Pure logic/utility functions with no UI
- API integration code (hooks, services)
- Type definitions and interfaces
- Configuration files
- Build/deployment scripts
- Test files (unless testing UI components)

### Logic & Hook Implementation Restriction
**CRITICAL**: You are **NOT ALLOWED** to write the implementation code for:
- React hooks (useState, useEffect, custom hooks)
- Service layers
- Form submission handlers
- API calls
- State management logic

#### Implementation Guidelines:
- **Suggestions Only**: For any functional logic, API calls, or state management, you must provide suggestions, pseudocode, or architectural outlines in the chat interface only. **DO NOT** write this logic into the codebase.
- **Direct UI Editing**: You are permitted to write JSX/TSX layout code and CSS/Tailwind styling, provided they are strictly presentational and do not include functional logic.

### Direct Editing Prohibited for UI
You are **NOT ALLOWED** to directly edit UI components using Read/Write/Edit tools. You must:
1. Invoke the frontend-design skill first
2. Let the specialized agent handle all UI code generation
3. Only proceed with direct edits if the task is purely logic-based

### Combined UI + Logic Tasks
If a task requires a combination of UI changes and logic updates, you must:
1. Use the frontend-design agent for the visual/layout code
2. Provide the logic/hook implementation as a suggested snippet in the chat for the user to manually integrate
3. **Never merge functional logic directly into the files via write tools**

## Technology Stack
- **Framework**: Next.js (React)
- **Styling**: [Check existing components for styling approach]
- **State Management**: [Check existing code]
- **Routing**: Next.js App Router or Pages Router

## File Organization
Refer to `/Users/wes/Desktop/SoundHaus_0.2.0/structure.txt` for complete file structure.

## Integration Points
- **Backend API**: FastAPI hosted on Digital Ocean
- **Authentication**: Supabase Auth (session tokens)
- **User Data**: Supabase PostgreSQL
- **Git Operations**: Desktop app handles via git binary (not web)

## Key Constraints
- Never hardcode credentials - use environment variables
- Follow 4-space indentation, no trailing whitespace
- Do not create new API endpoints (backend responsibility)
- Graceful error handling for all API calls
- Repository operations are read-only from web (write via Desktop app)
- **CRITICAL**: Do NOT implement React hooks, service layers, or form handlers - provide suggestions only
- **CRITICAL**: All UI work must go through the frontend-design agent
- **CRITICAL**: For combined UI + logic tasks, separate visual code (agent-handled) from functional code (suggestion-only)

## Enforcement
If Claude violates any of these rules, this is a violation of project rules. Users should immediately stop the task and redirect to proper workflow.

### Violations Include:
- Writing UI code without using the frontend-design agent
- Implementing React hooks, state management, or service layers directly in files
- Writing form submission handlers or API call implementations
- Merging functional logic into files via write tools when only suggestions were requested
