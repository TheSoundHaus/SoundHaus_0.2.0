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

### Direct Editing Prohibited for UI
You are **NOT ALLOWED** to directly edit UI components using Read/Write/Edit tools. You must:
1. Invoke the frontend-design skill first
2. Let the specialized agent handle all UI code generation
3. Only proceed with direct edits if the task is purely logic-based

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

## Enforcement
If Claude attempts to write UI code without using the frontend-design agent, this is a violation of project rules. Users should immediately stop the task and redirect to proper workflow.
